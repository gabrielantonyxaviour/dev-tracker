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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { CATEGORY_COLORS } from "@/lib/constants";

interface ToolData {
  tool_name: string;
  tool_category: string;
  count: number;
  errors: number;
}

interface SkillData {
  skill_name: string;
  count: number;
  last_used: string | null;
}

export default function ToolsPage() {
  const [tools, setTools] = useState<ToolData[]>([]);
  const [skills, setSkills] = useState<SkillData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const to = new Date().toISOString().split("T")[0];
    const from = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .split("T")[0];

    Promise.all([
      fetch(`/api/stats/tools?from=${from}&to=${to}`)
        .then((r) => r.json())
        .then((data) => setTools(data.data || [])),
      fetch(`/api/stats/skills?from=${from}&to=${to}`)
        .then((r) => r.json())
        .then((data) => setSkills(data.data || [])),
    ])
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Top tools for bar chart
  const topTools = tools.slice(0, 15).map((t) => ({
    name: t.tool_name.replace("mcp__plugin_playwright_playwright__", "pw:"),
    count: t.count,
    errors: t.errors,
    color:
      CATEGORY_COLORS[t.tool_category]?.color || CATEGORY_COLORS.other.color,
  }));

  // Category breakdown for pie chart
  const categoryMap = new Map<string, number>();
  for (const t of tools) {
    const cat = t.tool_category || "other";
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + t.count);
  }
  const categoryData = Array.from(categoryMap.entries())
    .map(([category, count]) => ({
      name: CATEGORY_COLORS[category]?.label || category,
      value: count,
      color: CATEGORY_COLORS[category]?.color || "#6b7280",
    }))
    .sort((a, b) => b.value - a.value);

  const totalCalls = tools.reduce((sum, t) => sum + t.count, 0);
  const totalErrors = tools.reduce((sum, t) => sum + t.errors, 0);

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Tools</h1>
        <div className="space-y-4">
          {[...Array(2)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="h-64" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Tool Usage (30 days)</h1>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Total Tool Calls
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{totalCalls.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Unique Tools
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{tools.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Error Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {totalCalls > 0
                ? ((totalErrors / totalCalls) * 100).toFixed(1)
                : 0}
              %
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Tool ranking bar chart */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Top Tools</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={topTools} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#888" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 11, fill: "#888" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #333",
                    borderRadius: 8,
                  }}
                />
                <Bar dataKey="count" name="Calls" radius={[0, 4, 4, 0]}>
                  {topTools.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Category pie chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">By Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={400}>
              <PieChart>
                <Pie
                  data={categoryData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="45%"
                  outerRadius={100}
                  innerRadius={50}
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={index} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1a1a1a",
                    border: "1px solid #333",
                    borderRadius: 8,
                  }}
                />
                <Legend
                  wrapperStyle={{ fontSize: 11 }}
                  layout="horizontal"
                  verticalAlign="bottom"
                />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Skill invocations */}
      {skills.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm">
              Skill Invocations (30 days)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {skills.map((s) => (
                <div
                  key={s.skill_name}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/20"
                >
                  <div>
                    <p className="text-sm font-mono font-medium">
                      /{s.skill_name}
                    </p>
                    {s.last_used && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {new Date(s.last_used).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  <span className="text-lg font-bold tabular-nums">
                    {s.count}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Full tool table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">All Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden max-h-[400px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left p-3 font-medium">Tool</th>
                  <th className="text-left p-3 font-medium">Category</th>
                  <th className="text-right p-3 font-medium">Calls</th>
                  <th className="text-right p-3 font-medium">Errors</th>
                  <th className="text-right p-3 font-medium">Error Rate</th>
                </tr>
              </thead>
              <tbody>
                {tools.map((t) => (
                  <tr key={t.tool_name} className="border-t">
                    <td className="p-3 font-mono text-xs">{t.tool_name}</td>
                    <td className="p-3">
                      <span
                        className="inline-block w-2 h-2 rounded-full mr-2"
                        style={{
                          backgroundColor:
                            CATEGORY_COLORS[t.tool_category]?.color ||
                            "#6b7280",
                        }}
                      />
                      {CATEGORY_COLORS[t.tool_category]?.label ||
                        t.tool_category}
                    </td>
                    <td className="p-3 text-right">
                      {t.count.toLocaleString()}
                    </td>
                    <td className="p-3 text-right">{t.errors}</td>
                    <td className="p-3 text-right">
                      {t.count > 0
                        ? ((t.errors / t.count) * 100).toFixed(1)
                        : 0}
                      %
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
