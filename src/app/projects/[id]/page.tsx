"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Project, SessionWithProject } from "@/lib/types";
import { formatCost, formatTokens } from "@/lib/cost-calculator";

export default function ProjectDetailPage() {
  const params = useParams();
  const [project, setProject] = useState<Project | null>(null);
  const [sessions, setSessions] = useState<SessionWithProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = params.id;
    Promise.all([
      fetch(`/api/projects/${id}`).then((r) => r.json()),
      fetch(`/api/sessions?project=${id}&limit=50`).then((r) => r.json()),
    ])
      .then(([projectData, sessionsData]) => {
        setProject(projectData.project || null);
        setSessions(sessionsData.sessions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [params.id]);

  if (loading) {
    return (
      <div className="p-6">
        <div className="h-8 w-48 bg-muted animate-pulse rounded mb-6" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="p-6">
        <p className="text-muted-foreground">Project not found.</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">{project.display_name}</h1>
        {project.category && (
          <Badge variant="secondary">{project.category}</Badge>
        )}
      </div>

      <p className="text-sm text-muted-foreground mb-6 font-mono">
        {project.path}
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Sessions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{project.total_sessions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Total Cost
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatCost(project.total_cost_usd)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Input Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatTokens(project.total_tokens_in)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Output Tokens
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">
              {formatTokens(project.total_tokens_out)}
            </p>
          </CardContent>
        </Card>
      </div>

      <h2 className="text-lg font-semibold mb-4">Recent Sessions</h2>
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-3 font-medium">Date</th>
              <th className="text-left p-3 font-medium">Title</th>
              <th className="text-left p-3 font-medium">Branch</th>
              <th className="text-right p-3 font-medium">Prompts</th>
              <th className="text-right p-3 font-medium">Tokens</th>
              <th className="text-right p-3 font-medium">Cost</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr
                key={s.id}
                className="border-t hover:bg-muted/30 cursor-pointer"
              >
                <td className="p-3">
                  <Link
                    href={`/sessions/${s.id}`}
                    className="text-primary hover:underline"
                  >
                    {new Date(s.started_at).toLocaleDateString()}{" "}
                    {new Date(s.started_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Link>
                </td>
                <td className="p-3 truncate max-w-[300px]">{s.title || "—"}</td>
                <td className="p-3">
                  {s.git_branch && (
                    <Badge variant="outline" className="text-xs font-mono">
                      {s.git_branch}
                    </Badge>
                  )}
                </td>
                <td className="p-3 text-right">{s.prompt_count}</td>
                <td className="p-3 text-right">
                  {formatTokens(
                    s.total_input_tokens +
                      s.total_output_tokens +
                      s.total_cache_creation_tokens +
                      s.total_cache_read_tokens,
                  )}
                </td>
                <td className="p-3 text-right">
                  {formatCost(s.equivalent_cost_usd)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
