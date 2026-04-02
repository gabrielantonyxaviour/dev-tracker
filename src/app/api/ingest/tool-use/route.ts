import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { v4 as uuid } from "uuid";
import { getToolCategory } from "@/lib/constants";
import { validateIngestAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const authError = validateIngestAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const {
      session_id,
      tool_name,
      tool_use_id,
      input_summary,
      is_error,
      agent_id,
      agent_type,
    } = body;

    if (!session_id || !tool_name) {
      return NextResponse.json(
        { error: "session_id and tool_name required" },
        { status: 400 },
      );
    }

    const db = getDb();

    // Check if session exists — tool uses may arrive before session-end ingestion
    const session = db
      .prepare(`SELECT id FROM sessions WHERE id = ?`)
      .get(session_id);

    if (!session) {
      // Store in a pending buffer table for later association
      // For now just skip — the JSONL parse at session-end will capture these
      return NextResponse.json({ ok: true, buffered: true });
    }

    // Find the latest turn for this session
    const latestTurn = db
      .prepare(
        `SELECT id FROM turns WHERE session_id = ? ORDER BY turn_index DESC LIMIT 1`,
      )
      .get(session_id) as { id: string } | undefined;

    const turnId = latestTurn?.id || "orphan";

    db.prepare(
      `INSERT OR IGNORE INTO tool_uses (id, turn_id, session_id, tool_name, tool_category, input_summary, is_error, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      tool_use_id || uuid(),
      turnId,
      session_id,
      tool_name,
      getToolCategory(tool_name),
      input_summary || null,
      is_error ? 1 : 0,
      new Date().toISOString(),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
