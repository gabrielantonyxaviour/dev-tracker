import { NextResponse } from "next/server";
import { getStreakHistory, getDailyStats } from "@/lib/db-queries";

export async function GET() {
  try {
    const streakData = getStreakHistory();

    // Get daily streak values for the last 90 days for a history view
    const from = new Date(Date.now() - 90 * 86400000)
      .toISOString()
      .split("T")[0];
    const to = new Date().toISOString().split("T")[0];
    const dailyStats = getDailyStats(from, to);

    const history = dailyStats.map((d) => ({
      date: d.date,
      streak_day: d.streak_day,
      sessions: d.session_count,
      active_minutes: Math.round(d.active_duration_ms / 60000),
    }));

    return NextResponse.json({
      current: streakData.current,
      longest: streakData.longest,
      longest_start: streakData.longest_start,
      longest_end: streakData.longest_end,
      history,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
