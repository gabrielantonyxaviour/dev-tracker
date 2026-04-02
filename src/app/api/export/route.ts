import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();

    const projects = db
      .prepare(`SELECT * FROM projects ORDER BY last_seen_at DESC`)
      .all();

    const daily_stats = db
      .prepare(`SELECT * FROM daily_stats ORDER BY date DESC`)
      .all();

    const sessions = db
      .prepare(
        `SELECT s.*, p.display_name as project_display_name
         FROM sessions s
         JOIN projects p ON s.project_id = p.id
         WHERE s.is_agent_session = 0
         ORDER BY s.equivalent_cost_usd DESC
         LIMIT 20`,
      )
      .all();

    const sessionIds = (sessions as { id: string }[]).map((s) => s.id);
    let turns: unknown[] = [];
    if (sessionIds.length > 0) {
      const placeholders = sessionIds.map(() => "?").join(",");
      turns = db
        .prepare(
          `SELECT * FROM turns WHERE session_id IN (${placeholders}) ORDER BY session_id, turn_index`,
        )
        .all(...sessionIds);
    }

    const tool_stats = db
      .prepare(
        `SELECT tool_name, tool_category, COUNT(*) as count, SUM(is_error) as errors
         FROM tool_uses
         GROUP BY tool_name, tool_category
         ORDER BY count DESC`,
      )
      .all();

    const model_stats = db
      .prepare(
        `SELECT model,
                SUM(request_count) as requests,
                SUM(input_tokens) as input_tokens,
                SUM(output_tokens) as output_tokens,
                SUM(cache_creation_tokens) as cache_creation_tokens,
                SUM(cache_read_tokens) as cache_read_tokens,
                SUM(equivalent_cost_usd) as cost
         FROM model_daily_stats
         GROUP BY model
         ORDER BY cost DESC`,
      )
      .all();

    const exported_at = new Date().toISOString();

    return NextResponse.json({
      exported_at,
      projects,
      daily_stats,
      sessions,
      turns,
      tool_stats,
      model_stats,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
