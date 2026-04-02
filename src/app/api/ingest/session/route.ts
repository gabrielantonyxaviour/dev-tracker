import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { validateIngestAuth, upsertMachine } from "@/lib/auth";
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
  rebuildMachineDailyStats,
} from "@/lib/aggregator";
import { v4 as uuid } from "uuid";
import type { IngestSessionPayload } from "@/lib/types";

export async function POST(request: NextRequest) {
  const authError = validateIngestAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as IngestSessionPayload;
    const { machine_id, machine_meta, session: s } = body;

    if (!machine_id || !machine_meta || !s) {
      return NextResponse.json(
        { error: "machine_id, machine_meta, and session are required" },
        { status: 400 },
      );
    }

    if (!s.id || !s.cwd || !s.started_at || !s.ended_at) {
      return NextResponse.json(
        { error: "session must include id, cwd, started_at, ended_at" },
        { status: 400 },
      );
    }

    const db = getDb();

    // Check duplicate
    const existing = db
      .prepare(`SELECT id FROM sessions WHERE id = ?`)
      .get(s.id) as { id: string } | undefined;

    if (existing) {
      return NextResponse.json(
        { error: "Session already exists", session_id: s.id },
        { status: 409 },
      );
    }

    // Upsert machine
    upsertMachine(machine_id, machine_meta);

    // Resolve project
    let projectId: string;
    const existingProject = db
      .prepare(`SELECT id FROM projects WHERE path = ?`)
      .get(s.cwd) as { id: string } | undefined;

    if (existingProject) {
      projectId = existingProject.id;
      db.prepare(`UPDATE projects SET last_seen_at = ? WHERE id = ?`).run(
        s.started_at,
        projectId,
      );
    } else {
      projectId = uuid();
      const displayName = deriveDisplayName(s.cwd);
      const category = categorizeProject(s.cwd);
      db.prepare(
        `INSERT INTO projects (id, path, encoded_path, display_name, category, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        projectId,
        s.cwd,
        s.cwd.replace(/\//g, "-"),
        displayName,
        category,
        s.started_at,
        s.started_at,
      );
    }

    // Calculate session-level aggregates
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheCreate = 0;
    let totalCacheRead = 0;
    let activeDuration = 0;
    const modelCounts: Record<string, number> = {};

    for (const turn of s.turns) {
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
      new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();

    // Generate title from first prompt
    const firstPrompt = s.turns[0]?.prompt_text;
    let title: string | null = null;
    if (firstPrompt) {
      const clean = firstPrompt
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      title = clean.slice(0, 80);
    }

    // Insert in transaction
    const insertAll = db.transaction(() => {
      db.prepare(
        `INSERT OR REPLACE INTO sessions (
          id, project_id, git_branch, title, started_at, ended_at,
          duration_ms, active_duration_ms, prompt_count, response_count,
          total_input_tokens, total_output_tokens, total_cache_creation_tokens,
          total_cache_read_tokens, equivalent_cost_usd, primary_model,
          entrypoint, version, is_agent_session, slug, stop_reason,
          parent_session_id, agent_name, total_web_searches, total_web_fetches,
          coding_active_ms, coding_idle_ms, compact_count, machine_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        s.id,
        projectId,
        s.git_branch,
        title,
        s.started_at,
        s.ended_at,
        durationMs > 0 ? durationMs : null,
        activeDuration > 0 ? activeDuration : null,
        s.turns.length,
        s.turns.length,
        totalInputTokens,
        totalOutputTokens,
        totalCacheCreate,
        totalCacheRead,
        sessionCost,
        primaryModel,
        "cli",
        s.version,
        s.is_agent_session ? 1 : 0,
        s.slug,
        s.stop_reason,
        s.parent_session_id,
        s.agent_name,
        s.total_web_searches,
        s.total_web_fetches,
        s.coding_active_ms || 0,
        s.coding_idle_ms || 0,
        s.compact_events?.length || 0,
        machine_id,
      );

      for (const turn of s.turns) {
        const turnId = uuid();
        const turnCost = calculateCost({
          input_tokens: turn.input_tokens,
          output_tokens: turn.output_tokens,
          cache_creation_tokens: turn.cache_creation_tokens,
          cache_read_tokens: turn.cache_read_tokens,
          model: turn.model || primaryModel || "claude-sonnet-4-6",
        });

        db.prepare(
          `INSERT OR REPLACE INTO turns (
            id, session_id, turn_index, prompt_text, response_text, prompt_timestamp,
            response_timestamp, duration_ms, actual_duration_ms, message_count, model,
            input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
            stop_reason, has_thinking, tool_use_count, equivalent_cost_usd,
            service_tier, inference_speed, cache_5m_tokens, cache_1h_tokens,
            web_search_requests, web_fetch_requests
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          turnId,
          s.id,
          turn.turn_index,
          turn.prompt_text,
          turn.response_text,
          turn.prompt_timestamp,
          turn.response_timestamp,
          turn.duration_ms,
          turn.actual_duration_ms,
          turn.message_count,
          turn.model,
          turn.input_tokens,
          turn.output_tokens,
          turn.cache_creation_tokens,
          turn.cache_read_tokens,
          turn.stop_reason,
          turn.has_thinking ? 1 : 0,
          turn.tool_uses.length,
          turnCost,
          turn.service_tier,
          turn.inference_speed,
          turn.cache_5m_tokens,
          turn.cache_1h_tokens,
          turn.web_search_requests,
          turn.web_fetch_requests,
        );

        for (const tool of turn.tool_uses) {
          db.prepare(
            `INSERT OR REPLACE INTO tool_uses (
              id, turn_id, session_id, tool_name, tool_category, input_summary, is_error, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            uuid(),
            turnId,
            s.id,
            tool.tool_name,
            tool.tool_category || getToolCategory(tool.tool_name),
            tool.input_summary,
            tool.is_error ? 1 : 0,
            tool.timestamp,
          );
        }
      }

      for (const filePath of s.file_changes) {
        db.prepare(
          `INSERT INTO file_changes (session_id, file_path, change_type, timestamp)
           VALUES (?, ?, ?, ?)`,
        ).run(s.id, filePath, "modified", s.ended_at);
      }

      for (const hook of s.hook_executions || []) {
        db.prepare(
          `INSERT INTO hook_executions (session_id, hook_command, duration_ms, had_error, error_message, timestamp)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          s.id,
          hook.hook_command,
          hook.duration_ms,
          hook.had_error ? 1 : 0,
          hook.error_message,
          hook.timestamp,
        );
      }

      for (const compact of s.compact_events || []) {
        db.prepare(
          `INSERT INTO compact_events (session_id, trigger, pre_tokens, content_length, timestamp)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(
          s.id,
          compact.trigger,
          compact.pre_tokens,
          compact.content_length,
          compact.timestamp,
        );
      }
    });

    insertAll();

    rebuildDailyStats();
    rebuildProjectDailyStats();
    rebuildModelDailyStats();
    rebuildProjectTotals();
    rebuildMachineDailyStats();

    return NextResponse.json({
      ok: true,
      session_id: s.id,
      turns: s.turns.length,
      cost_usd: sessionCost,
      project_id: projectId,
      machine_id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
