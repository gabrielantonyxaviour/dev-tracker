import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { validateIngestAuth } from "@/lib/auth";

export async function POST(request: NextRequest) {
  try {
    const authError = validateIngestAuth(request);
    if (authError) return authError;

    const body = await request.json();
    const {
      hook_event_name,
      session_id,
      cwd,
      tool_name,
      tool_use_id,
      agent_id,
      agent_type,
      agent_transcript_path,
      task_id,
      task_subject,
      teammate_name,
      team_name,
      error,
      error_details,
      notification_type,
      message,
      stop_hook_active,
      last_assistant_message,
      source,
      reason,
      trigger,
      file_path,
      worktree_path,
    } = body;

    if (!session_id || !hook_event_name) {
      return NextResponse.json({ ok: false }, { status: 400 });
    }

    const db = getDb();

    // Ensure events table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        cwd TEXT,
        tool_name TEXT,
        tool_use_id TEXT,
        agent_id TEXT,
        agent_type TEXT,
        task_id TEXT,
        task_subject TEXT,
        teammate_name TEXT,
        team_name TEXT,
        error TEXT,
        notification_type TEXT,
        message TEXT,
        source TEXT,
        reason TEXT,
        trigger_type TEXT,
        file_path TEXT,
        worktree_path TEXT,
        raw_json TEXT,
        timestamp TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(session_id);
      CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    `);

    // Store compact version (not full tool_input/tool_response which can be huge)
    const compactJson = JSON.stringify({
      hook_event_name,
      session_id,
      tool_name,
      agent_id,
      agent_type,
      task_id,
      task_subject,
      teammate_name,
      team_name,
      error,
      notification_type,
      stop_hook_active,
      source,
      reason,
    });

    db.prepare(
      `INSERT INTO events (
        session_id, event_type, cwd, tool_name, tool_use_id,
        agent_id, agent_type, task_id, task_subject,
        teammate_name, team_name, error, notification_type,
        message, source, reason, trigger_type, file_path,
        worktree_path, raw_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      session_id,
      hook_event_name,
      cwd || null,
      tool_name || null,
      tool_use_id || null,
      agent_id || null,
      agent_type || null,
      task_id || null,
      task_subject || null,
      teammate_name || null,
      team_name || null,
      error || error_details || null,
      notification_type || null,
      (message || last_assistant_message || "")?.slice(0, 500) || null,
      source || null,
      reason || null,
      trigger || null,
      file_path || worktree_path || null,
      worktree_path || null,
      compactJson,
    );

    return NextResponse.json({ ok: true, event: hook_event_name });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
