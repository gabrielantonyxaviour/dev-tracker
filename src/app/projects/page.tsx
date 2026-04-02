"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { Project } from "@/lib/types";
import { formatCost, formatTokens } from "@/lib/cost-calculator";

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then((data) => {
        setProjects(data.projects || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Projects</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-32" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  const sorted = [...projects].sort(
    (a, b) =>
      new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime(),
  );

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Projects</h1>
        <span className="text-sm text-muted-foreground">
          {projects.length} projects
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sorted.map((project) => (
          <Link key={project.id} href={`/projects/${project.id}`}>
            <Card className="hover:border-primary/50 transition-colors cursor-pointer">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium truncate">
                    {project.display_name}
                  </CardTitle>
                  {project.category && (
                    <Badge variant="secondary" className="text-xs">
                      {project.category}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-muted-foreground text-xs">Sessions</p>
                    <p className="font-medium">{project.total_sessions}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Cost</p>
                    <p className="font-medium">
                      {formatCost(project.total_cost_usd)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Input</p>
                    <p className="font-medium">
                      {formatTokens(project.total_tokens_in)}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground text-xs">Output</p>
                    <p className="font-medium">
                      {formatTokens(project.total_tokens_out)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  Last active:{" "}
                  {new Date(project.last_seen_at).toLocaleDateString()}
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
