import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { MachineWithStats } from "@/lib/types";

export async function GET() {
  try {
    const db = getDb();
    const machines = db
      .prepare(
        `SELECT m.*,
          (SELECT COUNT(*) FROM sessions s WHERE s.machine_id = m.id AND s.is_agent_session = 0) as session_count,
          (SELECT COALESCE(SUM(s.equivalent_cost_usd), 0) FROM sessions s WHERE s.machine_id = m.id AND s.is_agent_session = 0) as total_cost_usd
        FROM machines m
        ORDER BY m.last_seen_at DESC`,
      )
      .all() as MachineWithStats[];

    return NextResponse.json({ machines });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
