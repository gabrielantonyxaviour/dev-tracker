"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import Link from "next/link";
import {
  GitBranch,
  Clock,
  DollarSign,
  MessageSquare,
  Bot,
  Layers,
} from "lucide-react";
import type {
  SessionWithProject,
  Turn,
  ToolUse,
  CompactEvent,
} from "@/lib/types";

type SessionDetail = SessionWithProject & {
  turns: (Turn & { tools: ToolUse[] })[];
  children: SessionWithProject[];
  compact_events: CompactEvent[];
};

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

function formatDuration(ms: number): string {
  if (!ms) return "--";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) {
    const m = Math.floor(ms / 60_000);
    const s = Math.round((ms % 60_000) / 1000);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(ms / 3_600_000);
  const m = Math.round((ms % 3_600_000) / 60_000);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatTime(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function shortenModel(model: string | null): string {
  if (!model) return "--";
  if (model.includes("opus-4-6")) return "Opus 4.6";
  if (model.includes("opus-4")) return "Opus 4";
  if (model.includes("sonnet-4-6")) return "Sonnet 4.6";
  if (model.includes("sonnet-4")) return "Sonnet 4";
  if (model.includes("haiku")) return "Haiku";
  if (model.includes("sonnet-3")) return "Sonnet 3.5";
  return model;
}

const TOOL_COLORS: Record<string, string> = {
  Read: "bg-blue-500/15 text-blue-400",
  Edit: "bg-emerald-500/15 text-emerald-400",
  Write: "bg-emerald-500/15 text-emerald-400",
  Bash: "bg-red-500/15 text-red-400",
  Grep: "bg-amber-500/15 text-amber-400",
  Glob: "bg-amber-500/15 text-amber-400",
  Agent: "bg-violet-500/15 text-violet-400",
  Skill: "bg-teal-500/15 text-teal-400",
  ToolSearch: "bg-zinc-500/15 text-zinc-400",
};

function getToolBadgeClass(name: string): string {
  const shortName = name.split("__").pop() || name;
  return TOOL_COLORS[shortName] || "bg-zinc-500/15 text-zinc-400";
}

function getToolDisplayName(name: string): string {
  if (name.startsWith("mcp__")) {
    const parts = name.split("__");
    if (parts.length >= 3) return parts[2];
    return parts[1];
  }
  return name;
}

export default function SessionDetailPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const [session, setSession] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sessions/${sessionId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Session not found");
        return r.json();
      })
      .then((d) => {
        setSession(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [sessionId]);

  if (loading) return <SessionDetailSkeleton />;
  if (error || !session) {
    return (
      <div className="py-16 text-center text-sm text-muted-foreground">
        {error || "Session not found"}
      </div>
    );
  }

  const totalInput = session.total_input_tokens;
  const totalOutput = session.total_output_tokens;
  const totalCache =
    session.total_cache_creation_tokens + session.total_cache_read_tokens;
  const totalAllTokens = totalInput + totalOutput + totalCache;

  const inputPct = totalAllTokens > 0 ? (totalInput / totalAllTokens) * 100 : 0;
  const outputPct =
    totalAllTokens > 0 ? (totalOutput / totalAllTokens) * 100 : 0;
  const cachePct = totalAllTokens > 0 ? (totalCache / totalAllTokens) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Badge variant="secondary">{session.project_display_name}</Badge>
          {session.primary_model && (
            <Badge variant="outline" className="text-xs">
              {shortenModel(session.primary_model)}
            </Badge>
          )}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          {session.title || "Untitled session"}
        </h1>
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <span>
            {formatDate(session.started_at)} at {formatTime(session.started_at)}
          </span>
          {session.git_branch && (
            <span className="flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" />
              {session.git_branch}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {formatDuration(session.duration_ms || 0)}
          </span>
          <span className="flex items-center gap-1">
            <MessageSquare className="h-3.5 w-3.5" />
            {session.prompt_count} prompts
          </span>
          <span className="flex items-center gap-1">
            <DollarSign className="h-3.5 w-3.5" />
            {formatCost(session.equivalent_cost_usd)}
          </span>
        </div>
      </div>

      <Separator />

      {/* Token breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Token Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div
              className="flex h-4 w-full overflow-hidden rounded-full bg-muted"
              title={`Input: ${formatTokens(totalInput)} (${inputPct.toFixed(1)}%) | Output: ${formatTokens(totalOutput)} (${outputPct.toFixed(1)}%) | Cache: ${formatTokens(totalCache)} (${cachePct.toFixed(1)}%)`}
            >
              <div
                className="bg-blue-500 transition-all"
                style={{ width: `${inputPct}%` }}
              />
              <div
                className="bg-emerald-500 transition-all"
                style={{ width: `${outputPct}%` }}
              />
              <div
                className="bg-amber-500 transition-all"
                style={{ width: `${cachePct}%` }}
              />
            </div>
            <div className="flex items-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                Input {formatTokens(totalInput)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                Output {formatTokens(totalOutput)}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                Cache {formatTokens(totalCache)}
              </span>
              <span className="ml-auto tabular-nums">
                {formatTokens(totalAllTokens)} total
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Session insights */}
      {(() => {
        const thinkingTurns = session.turns.filter(
          (t) => t.has_thinking,
        ).length;
        const thinkingPct =
          session.turns.length > 0
            ? ((thinkingTurns / session.turns.length) * 100).toFixed(0)
            : "0";
        const turnsWithTools = session.turns.filter(
          (t) => t.tools.length > 0,
        ).length;
        const totalToolCalls = session.turns.reduce(
          (sum, t) => sum + t.tools.length,
          0,
        );
        const cacheHitRate =
          totalAllTokens > 0
            ? (
                (session.total_cache_read_tokens / totalAllTokens) *
                100
              ).toFixed(1)
            : "0";

        return (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Thinking</p>
                <p className="text-lg font-semibold">{thinkingPct}%</p>
                <p className="text-xs text-muted-foreground">
                  {thinkingTurns}/{session.turns.length} turns
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Cache Hit</p>
                <p className="text-lg font-semibold">{cacheHitRate}%</p>
                <p className="text-xs text-muted-foreground">
                  {formatTokens(session.total_cache_read_tokens)} read
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Tool Calls</p>
                <p className="text-lg font-semibold">{totalToolCalls}</p>
                <p className="text-xs text-muted-foreground">
                  {turnsWithTools} turns used tools
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Avg Cost/Turn</p>
                <p className="text-lg font-semibold">
                  {session.turns.length > 0
                    ? formatCost(
                        session.equivalent_cost_usd / session.turns.length,
                      )
                    : "$0"}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-4 pb-3">
                <p className="text-xs text-muted-foreground">Version</p>
                <p className="text-lg font-semibold font-mono">
                  {session.version || "--"}
                </p>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Subagent Sessions */}
      {session.children && session.children.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Bot className="h-4 w-4" />
              Subagent Sessions ({session.children.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-border">
              {session.children.map((child) => (
                <Link
                  key={child.id}
                  href={`/sessions/${child.id}`}
                  className="flex items-center justify-between px-5 py-3 hover:bg-muted/40 transition-colors"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">
                        {child.agent_name || child.title || "Agent session"}
                      </span>
                      {child.primary_model && (
                        <Badge variant="outline" className="text-xs">
                          {shortenModel(child.primary_model)}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      <span>{child.prompt_count} turns</span>
                      <span>
                        {formatTokens(
                          child.total_input_tokens +
                            child.total_output_tokens +
                            child.total_cache_creation_tokens +
                            child.total_cache_read_tokens,
                        )}{" "}
                        tokens
                      </span>
                      <span>{formatDuration(child.duration_ms || 0)}</span>
                    </div>
                  </div>
                  <span className="text-sm tabular-nums text-muted-foreground">
                    {formatCost(child.equivalent_cost_usd)}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Compact Events */}
      {session.compact_events && session.compact_events.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              <Layers className="h-4 w-4" />
              Context Compacted {session.compact_events.length} time
              {session.compact_events.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {session.compact_events.map((ce, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="text-xs capitalize">
                      {ce.trigger}
                    </Badge>
                    <span className="text-muted-foreground">
                      at {formatTokens(ce.pre_tokens)} tokens
                    </span>
                  </div>
                  <span className="text-muted-foreground">
                    {formatTime(ce.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Turn timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">
            Turn Timeline ({session.turns.length} turns)
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {session.turns.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No turns recorded
            </div>
          ) : (
            <div className="divide-y divide-border">
              {session.turns.map((turn, idx) => (
                <div
                  key={turn.id}
                  className={idx % 2 === 0 ? "bg-transparent" : "bg-muted/30"}
                >
                  <div className="px-5 py-3">
                    {/* Prompt */}
                    {turn.prompt_text && (
                      <p className="mb-2 text-sm text-foreground line-clamp-3">
                        {turn.prompt_text}
                      </p>
                    )}

                    {/* Response */}
                    {turn.response_text && (
                      <details className="mt-2">
                        <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                          Show response ({turn.response_text.length} chars)
                        </summary>
                        <div className="mt-1 text-xs text-muted-foreground bg-muted/40 rounded p-2 whitespace-pre-wrap line-clamp-10 max-h-48 overflow-y-auto">
                          {turn.response_text}
                        </div>
                      </details>
                    )}

                    {/* Meta row */}
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {shortenModel(turn.model)}
                      </Badge>
                      {turn.has_thinking === 1 && (
                        <Badge className="text-xs bg-purple-500/15 text-purple-400 border-purple-500/30">
                          thinking
                        </Badge>
                      )}
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatTokens(
                          turn.input_tokens +
                            turn.output_tokens +
                            turn.cache_creation_tokens +
                            turn.cache_read_tokens,
                        )}{" "}
                        tokens
                      </span>
                      {turn.duration_ms && (
                        <span className="text-xs tabular-nums text-muted-foreground">
                          {formatDuration(turn.duration_ms)}
                        </span>
                      )}
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {formatCost(turn.equivalent_cost_usd)}
                      </span>
                    </div>

                    {/* Tool calls */}
                    {turn.tools.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {turn.tools.map((tool) => (
                          <span
                            key={tool.id}
                            className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium ${getToolBadgeClass(tool.tool_name)} ${tool.is_error ? "ring-1 ring-red-500/30" : ""}`}
                          >
                            {getToolDisplayName(tool.tool_name)}
                            {tool.is_error ? " (err)" : ""}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SessionDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex gap-2">
          <Skeleton className="h-5 w-24" />
          <Skeleton className="h-5 w-16" />
        </div>
        <Skeleton className="h-7 w-64" />
        <div className="flex gap-4">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>
      <Separator />
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-28" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full" />
          <div className="mt-3 flex gap-6">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-20" />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
