"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { useMemo } from "react";

const PROJECT_COLORS = [
  "#60a5fa",
  "#34d399",
  "#fbbf24",
  "#f87171",
  "#a78bfa",
  "#fb923c",
  "#2dd4bf",
  "#f472b6",
  "#38bdf8",
  "#facc15",
];

interface HourlyEntry {
  hour: number;
  prompts: number;
  project: string;
}

export function ActivityChart({ data }: { data: HourlyEntry[] }) {
  const { chartData, projects } = useMemo(() => {
    const projectSet = new Set<string>();
    data.forEach((d) => projectSet.add(d.project));
    const projects = Array.from(projectSet);

    const hours: Record<string, Record<string, number>> = {};
    for (let h = 0; h < 24; h++) {
      hours[h] = {};
      projects.forEach((p) => (hours[h][p] = 0));
    }
    data.forEach((d) => {
      hours[d.hour][d.project] = d.prompts;
    });

    const chartData = Object.entries(hours).map(([hour, projectCounts]) => ({
      hour: `${hour.padStart(2, "0")}:00`,
      ...projectCounts,
    }));

    return { chartData, projects };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No activity data for today
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={chartData} barCategoryGap="20%">
        <XAxis
          dataKey="hour"
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={{ stroke: "#27272a" }}
          tickLine={false}
          interval={2}
        />
        <YAxis
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={32}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "#18181b",
            border: "1px solid #27272a",
            borderRadius: "6px",
            fontSize: 12,
          }}
          labelStyle={{ color: "#a1a1aa" }}
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
        />
        {projects.length > 1 && (
          <Legend
            iconSize={8}
            wrapperStyle={{ fontSize: 11, color: "#a1a1aa" }}
          />
        )}
        {projects.map((project, i) => (
          <Bar
            key={project}
            dataKey={project}
            stackId="a"
            fill={PROJECT_COLORS[i % PROJECT_COLORS.length]}
            radius={i === projects.length - 1 ? [2, 2, 0, 0] : [0, 0, 0, 0]}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
