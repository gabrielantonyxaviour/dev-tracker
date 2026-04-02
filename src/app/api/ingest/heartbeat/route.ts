import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { session_id } = body;

    if (!session_id) {
      return NextResponse.json(
        { error: "session_id required" },
        { status: 400 },
      );
    }

    const db = getDb();

    // Full heartbeats table with all status line fields
    db.exec(`
      CREATE TABLE IF NOT EXISTS heartbeats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        context_remaining_pct REAL,
        context_used_pct REAL,
        context_window_size INTEGER,
        total_input_tokens INTEGER,
        total_output_tokens INTEGER,
        model TEXT,
        cost_usd REAL,
        wall_duration_ms INTEGER,
        api_duration_ms INTEGER,
        lines_added INTEGER,
        lines_removed INTEGER,
        rate_limit_5h_pct REAL,
        rate_limit_7d_pct REAL,
        rate_limit_5h_resets_at INTEGER,
        rate_limit_7d_resets_at INTEGER,
        exceeds_200k INTEGER,
        timestamp TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_heartbeats_session ON heartbeats(session_id);
    `);

    db.prepare(
      `INSERT INTO heartbeats (
        session_id, context_remaining_pct, context_used_pct,
        context_window_size, total_input_tokens, total_output_tokens,
        model, cost_usd, wall_duration_ms, api_duration_ms,
        lines_added, lines_removed,
        rate_limit_5h_pct, rate_limit_7d_pct,
        rate_limit_5h_resets_at, rate_limit_7d_resets_at, exceeds_200k
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      session_id,
      body.context_remaining_pct ?? null,
      body.context_used_pct ?? null,
      body.context_window_size ?? null,
      body.total_input_tokens ?? null,
      body.total_output_tokens ?? null,
      body.model ?? null,
      body.cost_usd ?? null,
      body.wall_duration_ms ?? null,
      body.api_duration_ms ?? null,
      body.lines_added ?? null,
      body.lines_removed ?? null,
      body.rate_limit_5h_pct ?? null,
      body.rate_limit_7d_pct ?? null,
      body.rate_limit_5h_resets_at ?? null,
      body.rate_limit_7d_resets_at ?? null,
      body.exceeds_200k ? 1 : 0,
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
