"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Flame,
  Clock,
  Coins,
  Terminal,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { DashboardData } from "@/lib/types";
import { ActivityChart } from "./activity-chart";
import { useLiveUpdates } from "@/hooks/use-live-updates";

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatMinutes(mins: number): string {
  if (mins < 60) return `${Math.round(mins)}m`;
  const hrs = Math.floor(mins / 60);
  const remaining = Math.round(mins % 60);
  return remaining > 0 ? `${hrs}h ${remaining}m` : `${hrs}h`;
}

function formatDuration(ms: number): string {
  if (!ms) return "--";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) {
    const m = Math.floor(ms / 60_000);
    return `${m}m`;
  }
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const refetch = useCallback(() => {
    fetch("/api/dashboard")
      .then((r) => r.json())
      .then((d: DashboardData) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  useLiveUpdates(
    useCallback(
      (event) => {
        if (event.type === "stats") {
          refetch();
        }
      },
      [refetch],
    ),
  );

  if (loading) return <DashboardSkeleton />;
  if (!data)
    return (
      <div className="text-muted-foreground">
        Failed to load dashboard data.
      </div>
    );

  const sessionsDelta = data.today.sessions - data.yesterday.sessions;
  const totalMinutes = data.project_split.reduce((a, b) => a + b.minutes, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <span className="text-xs text-emerald-400">Live</span>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Sessions Today
            </CardTitle>
            <Terminal className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.today.sessions}</div>
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              {sessionsDelta > 0 ? (
                <>
                  <TrendingUp className="h-3 w-3 text-emerald-500" />
                  <span className="text-emerald-500">+{sessionsDelta}</span>
                </>
              ) : sessionsDelta < 0 ? (
                <>
                  <TrendingDown className="h-3 w-3 text-red-400" />
                  <span className="text-red-400">{sessionsDelta}</span>
                </>
              ) : (
                <span>same as yesterday</span>
              )}
              {sessionsDelta !== 0 && <span>vs yesterday</span>}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Active Time
            </CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatMinutes(data.today.active_minutes)}
            </div>
            <p className="text-xs text-muted-foreground">
              avg {formatMinutes(data.weekly_avg.active_minutes)}/day this week
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Tokens Used
            </CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatTokens(data.today.tokens_total)}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatCost(data.today.cost_usd)} equivalent
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Streak
            </CardTitle>
            {data.today.streak > 0 ? (
              <Flame className="h-4 w-4 text-orange-500" />
            ) : (
              <Flame className="h-4 w-4 text-muted-foreground" />
            )}
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {data.today.streak} {data.today.streak === 1 ? "day" : "days"}
            </div>
            <p className="text-xs text-muted-foreground">
              {data.today.streak > 0
                ? "Keep it going"
                : "Start a new streak today"}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Live session indicator */}
      {data.live_session && (
        <Card className="border-emerald-800/50 bg-emerald-950/20">
          <CardContent className="py-3 flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
            </span>
            <span className="text-sm text-emerald-400 font-medium">
              Active session in {data.live_session.project}
            </span>
            <span className="text-xs text-emerald-400/60 ml-auto">
              Started{" "}
              {new Date(data.live_session.started_at).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Activity Timeline
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ActivityChart data={data.hourly_activity} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-3 gap-4">
        {/* Recent Sessions */}
        <Card className="col-span-2">
          <CardHeader>
            <CardTitle className="text-sm font-medium">
              Recent Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recent_sessions.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No sessions today
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead className="text-right">Duration</TableHead>
                    <TableHead className="text-right">Prompts</TableHead>
                    <TableHead className="text-right">Cost</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recent_sessions.map((session) => (
                    <TableRow
                      key={session.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/sessions/${session.id}`)}
                    >
                      <TableCell className="text-xs text-muted-foreground">
                        {timeAgo(session.started_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className="text-xs font-normal"
                        >
                          {session.project_display_name}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm">
                        {session.title || "Untitled session"}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatDuration(session.duration_ms || 0)}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {session.prompt_count}
                      </TableCell>
                      <TableCell className="text-right text-sm tabular-nums">
                        {formatCost(session.equivalent_cost_usd)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Project Split */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Project Split</CardTitle>
          </CardHeader>
          <CardContent>
            {data.project_split.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No project data today
              </p>
            ) : (
              <div className="space-y-4">
                {data.project_split.map((p) => {
                  const pct =
                    totalMinutes > 0
                      ? Math.round((p.minutes / totalMinutes) * 100)
                      : 0;
                  return (
                    <div key={p.project} className="space-y-1.5">
                      <div className="flex items-center justify-between text-sm">
                        <span className="truncate font-medium">
                          {p.project}
                        </span>
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatMinutes(p.minutes)} ({pct}%)
                        </span>
                      </div>
                      <Progress value={pct} className="h-1.5" />
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-7 w-32" />
      <div className="grid grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16" />
              <Skeleton className="mt-2 h-3 w-28" />
            </CardContent>
          </Card>
        ))}
      </div>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-48 w-full" />
        </CardContent>
      </Card>
      <div className="grid grid-cols-3 gap-4">
        <Card className="col-span-2">
          <CardHeader>
            <Skeleton className="h-4 w-28" />
          </CardHeader>
          <CardContent className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-1.5 w-full" />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
