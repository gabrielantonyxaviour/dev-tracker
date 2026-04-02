"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { formatMinutes } from "@/lib/cost-calculator";

interface HeatmapDay {
  date: string;
  sessions: number;
  active_minutes: number;
}

interface StreakData {
  current: number;
  longest: number;
  longest_start: string | null;
  longest_end: string | null;
}

export default function ActivityPage() {
  const [heatmap, setHeatmap] = useState<HeatmapDay[]>([]);
  const [streaks, setStreaks] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const to = new Date().toISOString().split("T")[0];
    const from = new Date(Date.now() - 365 * 86400000)
      .toISOString()
      .split("T")[0];

    Promise.all([
      fetch(`/api/stats/activity?from=${from}&to=${to}`).then((r) => r.json()),
      fetch("/api/stats/streaks").then((r) => r.json()),
    ])
      .then(([activityData, streakData]) => {
        setHeatmap(activityData.data || []);
        setStreaks(streakData);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Build weekly data from heatmap for the bar chart
  const weeklyData: { week: string; hours: number; sessions: number }[] = [];
  if (heatmap.length > 0) {
    const weekMap = new Map<string, { hours: number; sessions: number }>();
    for (const day of heatmap) {
      const d = new Date(day.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().split("T")[0];
      const existing = weekMap.get(key) || { hours: 0, sessions: 0 };
      existing.hours += day.active_minutes / 60;
      existing.sessions += day.sessions;
      weekMap.set(key, existing);
    }
    for (const [week, data] of weekMap) {
      weeklyData.push({
        week,
        hours: Math.round(data.hours * 10) / 10,
        sessions: data.sessions,
      });
    }
    weeklyData.sort((a, b) => a.week.localeCompare(b.week));
  }

  // Build hour-of-day distribution
  const dayOfWeekData = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(
    (name, i) => {
      const days = heatmap.filter((d) => new Date(d.date).getDay() === i);
      const totalMinutes = days.reduce((sum, d) => sum + d.active_minutes, 0);
      return {
        day: name,
        avg_hours: days.length > 0 ? totalMinutes / days.length / 60 : 0,
        total_sessions: days.reduce((sum, d) => sum + d.sessions, 0),
      };
    },
  );

  // Build calendar heatmap grid (last 52 weeks)
  const calendarWeeks: { date: string; level: number }[][] = [];
  if (heatmap.length > 0) {
    const dayMap = new Map(heatmap.map((d) => [d.date, d]));
    const maxSessions = Math.max(...heatmap.map((d) => d.sessions), 1);
    const today = new Date();
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 364);
    startDate.setDate(startDate.getDate() - startDate.getDay()); // align to Sunday

    let currentWeek: { date: string; level: number }[] = [];
    const date = new Date(startDate);
    while (date <= today) {
      const key = date.toISOString().split("T")[0];
      const dayData = dayMap.get(key);
      const sessions = dayData?.sessions || 0;
      const level =
        sessions === 0
          ? 0
          : Math.min(4, Math.ceil((sessions / maxSessions) * 4));
      currentWeek.push({ date: key, level });
      if (date.getDay() === 6 || date.getTime() === today.getTime()) {
        calendarWeeks.push(currentWeek);
        currentWeek = [];
      }
      date.setDate(date.getDate() + 1);
    }
    if (currentWeek.length > 0) calendarWeeks.push(currentWeek);
  }

  const levelColors = [
    "bg-zinc-800",
    "bg-emerald-900",
    "bg-emerald-700",
    "bg-emerald-500",
    "bg-emerald-400",
  ];

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Activity</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-48" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Activity</h1>

      {/* Streak cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Current Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">
              {streaks?.current || 0}
              {(streaks?.current || 0) > 0 && (
                <span className="text-orange-500 ml-2">&#x1F525;</span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-1">days</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Longest Streak
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold">{streaks?.longest || 0}</p>
            <p className="text-xs text-muted-foreground mt-1">
              {streaks?.longest_start && streaks?.longest_end
                ? `${new Date(streaks.longest_start).toLocaleDateString()} — ${new Date(streaks.longest_end).toLocaleDateString()}`
                : "days"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* GitHub-style heatmap */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Activity Heatmap</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-[3px] overflow-x-auto pb-2">
            {calendarWeeks.map((week, wi) => (
              <div key={wi} className="flex flex-col gap-[3px]">
                {week.map((day) => (
                  <div
                    key={day.date}
                    className={`w-[11px] h-[11px] rounded-sm ${levelColors[day.level]}`}
                    title={`${day.date}: level ${day.level}`}
                  />
                ))}
              </div>
            ))}
          </div>
          <div className="flex items-center gap-1 mt-3 text-xs text-muted-foreground">
            <span>Less</span>
            {levelColors.map((c, i) => (
              <div key={i} className={`w-[11px] h-[11px] rounded-sm ${c}`} />
            ))}
            <span>More</span>
          </div>
        </CardContent>
      </Card>

      {/* Weekly hours chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Weekly Active Hours</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={weeklyData.slice(-26)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="week"
                tick={{ fontSize: 10, fill: "#888" }}
                tickFormatter={(w) =>
                  new Date(w).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#888" }}
                tickFormatter={(v) => `${v}h`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: 8,
                }}
                formatter={(value) => [
                  `${Number(value).toFixed(1)}h`,
                  "Active",
                ]}
              />
              <Bar dataKey="hours" fill="#60a5fa" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Day of week distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Day of Week Pattern</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={dayOfWeekData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#888" }} />
              <YAxis
                tick={{ fontSize: 11, fill: "#888" }}
                tickFormatter={(v) => `${v.toFixed(1)}h`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: 8,
                }}
                formatter={(value, name) => [
                  name === "avg_hours"
                    ? `${Number(value ?? 0).toFixed(1)}h avg`
                    : String(value ?? 0),
                  name === "avg_hours" ? "Avg Hours" : "Sessions",
                ]}
              />
              <Bar dataKey="avg_hours" fill="#a78bfa" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
