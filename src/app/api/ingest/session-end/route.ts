import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { parseJsonlFile } from "@/lib/jsonl-parser";
import { calculateCost } from "@/lib/cost-calculator";
import {
  getToolCategory,
  categorizeProject,
  deriveDisplayName,
} from "@/lib/constants";
import {
  rebuildDailyStats,
  rebuildProjectDailyStats,
  rebuildModelDailyStats,
  rebuildProjectTotals,
} from "@/lib/aggregator";
import { v4 as uuid } from "uuid";
import { validateIngestAuth, extractMachineId } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const authError = validateIngestAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const { session_id, cwd, transcript_path } = body as {
      session_id?: string;
      cwd?: string;
      transcript_path?: string;
    };

    const machineId = extractMachineId(
      body as Record<string, unknown>,
      request,
    );

    if (!session_id || !transcript_path) {
      return NextResponse.json(
        { error: "session_id and transcript_path are required" },
        { status: 400 },
      );
    }

    const db = getDb();

    // Check if already imported
    const existing = db
      .prepare(`SELECT id FROM sessions WHERE id = ?`)
      .get(session_id) as { id: string } | undefined;

    if (existing) {
      return NextResponse.json({
        status: "already_imported",
        session_id,
      });
    }

    // Parse the JSONL transcript
    const parsed = await parseJsonlFile(transcript_path, session_id);

    if (!parsed || parsed.turns.length === 0) {
      return NextResponse.json(
        { error: "Failed to parse transcript or no turns found" },
        { status: 422 },
      );
    }

    // Resolve project
    const projectCwd = cwd || parsed.cwd;
    let projectId: string;

    const existingProject = db
      .prepare(`SELECT id FROM projects WHERE path = ?`)
      .get(projectCwd) as { id: string } | undefined;

    if (existingProject) {
      projectId = existingProject.id;
      db.prepare(`UPDATE projects SET last_seen_at = ? WHERE id = ?`).run(
        parsed.started_at,
        projectId,
      );
    } else {
      projectId = uuid();
      const displayName = deriveDisplayName(projectCwd);
      const category = categorizeProject(projectCwd);
      db.prepare(
        `INSERT INTO projects (id, path, encoded_path, display_name, category, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        projectId,
        projectCwd,
        projectCwd.replace(/\//g, "-"),
        displayName,
        category,
        parsed.started_at,
        parsed.started_at,
      );
    }

    // Calculate session-level aggregates
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheCreate = 0;
    let totalCacheRead = 0;
    let activeDuration = 0;
    const modelCounts: Record<string, number> = {};

    for (const turn of parsed.turns) {
      totalInputTokens += turn.input_tokens;
      totalOutputTokens += turn.output_tokens;
      totalCacheCreate += turn.cache_creation_tokens;
      totalCacheRead += turn.cache_read_tokens;
      if (turn.duration_ms) activeDuration += turn.duration_ms;
      if (turn.model) {
        modelCounts[turn.model] = (modelCounts[turn.model] || 0) + 1;
      }
    }

    const primaryModel =
      Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const sessionCost = calculateCost({
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cache_creation_tokens: totalCacheCreate,
      cache_read_tokens: totalCacheRead,
      model: primaryModel || "claude-sonnet-4-6",
    });

    const durationMs =
      new Date(parsed.ended_at).getTime() -
      new Date(parsed.started_at).getTime();

    // Generate title from first prompt
    const firstPrompt = parsed.turns[0]?.prompt_text;
    let title: string | null = null;
    if (firstPrompt) {
      const clean = firstPrompt
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      title = clean.slice(0, 80);
    }

    // Insert everything in a transaction
    const insertAll = db.transaction(() => {
      db.prepare(
        `INSERT OR REPLACE INTO sessions (
          id, project_id, jsonl_path, git_branch, title, started_at, ended_at,
          duration_ms, active_duration_ms, prompt_count, response_count,
          total_input_tokens, total_output_tokens, total_cache_creation_tokens,
          total_cache_read_tokens, equivalent_cost_usd, primary_model,
          entrypoint, version, is_agent_session, machine_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        parsed.id,
        projectId,
        transcript_path,
        parsed.git_branch,
        title,
        parsed.started_at,
        parsed.ended_at,
        durationMs > 0 ? durationMs : null,
        activeDuration > 0 ? activeDuration : null,
        parsed.turns.length,
        parsed.turns.length,
        totalInputTokens,
        totalOutputTokens,
        totalCacheCreate,
        totalCacheRead,
        sessionCost,
        primaryModel,
        parsed.entrypoint,
        parsed.version,
        parsed.is_agent_session ? 1 : 0,
        machineId,
      );

      for (const turn of parsed.turns) {
        const turnCost = calculateCost({
          input_tokens: turn.input_tokens,
          output_tokens: turn.output_tokens,
          cache_creation_tokens: turn.cache_creation_tokens,
          cache_read_tokens: turn.cache_read_tokens,
          model: turn.model || primaryModel || "claude-sonnet-4-6",
        });

        db.prepare(
          `INSERT OR REPLACE INTO turns (
            id, session_id, turn_index, prompt_text, prompt_timestamp, response_timestamp,
            duration_ms, model, input_tokens, output_tokens, cache_creation_tokens,
            cache_read_tokens, stop_reason, has_thinking, tool_use_count, equivalent_cost_usd
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          turn.id,
          parsed.id,
          turn.turn_index,
          turn.prompt_text,
          turn.prompt_timestamp,
          turn.response_timestamp,
          turn.duration_ms,
          turn.model,
          turn.input_tokens,
          turn.output_tokens,
          turn.cache_creation_tokens,
          turn.cache_read_tokens,
          turn.stop_reason,
          turn.has_thinking ? 1 : 0,
          turn.tool_uses.length,
          turnCost,
        );

        for (const tool of turn.tool_uses) {
          db.prepare(
            `INSERT OR REPLACE INTO tool_uses (
              id, turn_id, session_id, tool_name, tool_category, input_summary, is_error, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            tool.id,
            turn.id,
            parsed.id,
            tool.tool_name,
            getToolCategory(tool.tool_name),
            tool.input_summary,
            tool.is_error ? 1 : 0,
            tool.timestamp,
          );
        }
      }

      for (const filePath of parsed.file_changes) {
        db.prepare(
          `INSERT INTO file_changes (session_id, file_path, change_type, timestamp)
           VALUES (?, ?, ?, ?)`,
        ).run(parsed.id, filePath, "modified", parsed.ended_at);
      }
    });

    insertAll();

    // Rebuild aggregates incrementally
    rebuildDailyStats();
    rebuildProjectDailyStats();
    rebuildModelDailyStats();
    rebuildProjectTotals();

    return NextResponse.json({
      status: "imported",
      session_id: parsed.id,
      turns: parsed.turns.length,
      cost_usd: sessionCost,
      project_id: projectId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
