import { NextRequest, NextResponse } from "next/server";
import {
  getTodayStats,
  getYesterdayStats,
  getWeeklyAvgStats,
  getRecentSessions,
  getHourlyActivity,
  getProjectSplit,
  getCurrentStreak,
} from "@/lib/db-queries";
import type { DashboardData } from "@/lib/types";

export async function GET(request: NextRequest) {
  try {
    const machineId = request.nextUrl.searchParams.get("machine_id");
    const today = new Date().toISOString().split("T")[0];
    const todayStats = getTodayStats();
    const yesterday = getYesterdayStats();
    const weeklyAvg = getWeeklyAvgStats();
    const { sessions: recentSessions } = getRecentSessions(10, 0, {
      min_prompts: 3,
      machine_id: machineId ?? undefined,
    });
    const hourlyActivity = getHourlyActivity(today);
    const projectSplit = getProjectSplit(today);
    const streak = getCurrentStreak();

    // Detect live session — started recently, no ended_at or very recent
    const db = await import("@/lib/db").then((m) => m.getDb());
    const liveSession = db
      .prepare(
        `SELECT s.id, p.display_name as project, s.started_at, s.prompt_count
         FROM sessions s JOIN projects p ON s.project_id = p.id
         WHERE s.ended_at IS NULL AND s.is_agent_session = 0
         AND s.started_at > datetime('now', '-2 hours')
         AND (? IS NULL OR s.machine_id = ?)
         ORDER BY s.started_at DESC LIMIT 1`,
      )
      .get(machineId, machineId) as
      | {
          id: string;
          project: string;
          started_at: string;
          prompt_count: number;
        }
      | undefined;

    const data: DashboardData = {
      today: {
        ...todayStats,
        streak,
      },
      yesterday,
      weekly_avg: weeklyAvg,
      recent_sessions: recentSessions,
      hourly_activity: hourlyActivity,
      project_split: projectSplit,
      live_session: liveSession
        ? { project: liveSession.project, started_at: liveSession.started_at }
        : null,
    };

    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
