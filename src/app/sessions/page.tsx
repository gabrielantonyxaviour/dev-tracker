"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import type { SessionWithProject } from "@/lib/types";

interface SessionsResponse {
  sessions: SessionWithProject[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
}

function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}

function formatDuration(ms: number): string {
  if (!ms) return "--";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`;
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

function shortenModel(model: string | null): string {
  if (!model) return "--";
  if (model.includes("opus-4-6")) return "Opus 4.6";
  if (model.includes("opus-4")) return "Opus 4";
  if (model.includes("sonnet-4-6")) return "Sonnet 4.6";
  if (model.includes("sonnet-4")) return "Sonnet 4";
  if (model.includes("haiku")) return "Haiku";
  if (model.includes("sonnet-3")) return "Sonnet 3.5";
  return model.split("-").slice(-1)[0];
}

export default function SessionsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-10 w-full" />
          <div className="space-y-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </div>
      }
    >
      <SessionsContent />
    </Suspense>
  );
}

function SessionsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [data, setData] = useState<SessionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get("search") || "");
  const [sort, setSort] = useState(searchParams.get("sort") || "newest");
  const [page, setPage] = useState(
    parseInt(searchParams.get("page") || "1", 10),
  );

  const fetchSessions = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", page.toString());
    params.set("limit", "20");
    if (search) params.set("search", search);
    if (sort) params.set("sort", sort);

    try {
      const res = await fetch(`/api/sessions?${params.toString()}`);
      const json = await res.json();
      setData(json);
    } catch {
      // ignore
    }
    setLoading(false);
  }, [page, search, sort]);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions]);

  const totalTime = data
    ? data.sessions.reduce((a, s) => a + (s.duration_ms || 0), 0)
    : 0;
  const totalCost = data
    ? data.sessions.reduce((a, s) => a + s.equivalent_cost_usd, 0)
    : 0;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold tracking-tight">Sessions</h1>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search prompts..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") fetchSessions();
            }}
            className="pl-9"
          />
        </div>
        <Select
          value={sort}
          onValueChange={(v) => {
            setSort(v ?? "newest");
            setPage(1);
          }}
        >
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Newest</SelectItem>
            <SelectItem value="oldest">Oldest</SelectItem>
            <SelectItem value="longest">Longest</SelectItem>
            <SelectItem value="tokens">Most tokens</SelectItem>
            <SelectItem value="cost">Most expensive</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Stats banner */}
      {data && !loading && (
        <div className="flex items-center gap-6 text-sm text-muted-foreground">
          <span>
            <span className="font-medium text-foreground">{data.total}</span>{" "}
            sessions
          </span>
          <span>
            <span className="font-medium text-foreground">
              {formatDuration(totalTime)}
            </span>{" "}
            total time
          </span>
          <span>
            <span className="font-medium text-foreground">
              {formatCost(totalCost)}
            </span>{" "}
            total cost
          </span>
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !data || data.sessions.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No sessions found
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="text-right">Duration</TableHead>
                  <TableHead className="text-right">Prompts</TableHead>
                  <TableHead>Model</TableHead>
                  <TableHead className="text-right">Tokens</TableHead>
                  <TableHead className="text-right">Cost</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.sessions.map((session) => (
                  <TableRow
                    key={session.id}
                    className="cursor-pointer hover:bg-muted/50"
                    onClick={() => router.push(`/sessions/${session.id}`)}
                  >
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
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
                    <TableCell className="max-w-[240px] truncate text-sm">
                      {session.title || "Untitled session"}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatDuration(session.duration_ms || 0)}
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {session.prompt_count}
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground">
                        {shortenModel(session.primary_model)}
                      </span>
                    </TableCell>
                    <TableCell className="text-right text-sm tabular-nums">
                      {formatTokens(
                        session.total_input_tokens +
                          session.total_output_tokens +
                          session.total_cache_creation_tokens +
                          session.total_cache_read_tokens,
                      )}
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

      {/* Pagination */}
      {data && data.total_pages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.total_pages}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={data.page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="mr-1 h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={data.page >= data.total_pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
