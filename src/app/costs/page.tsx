"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { formatCost, formatTokens } from "@/lib/cost-calculator";
import { MODEL_PRICING } from "@/lib/constants";

interface TokenData {
  date: string;
  input: number;
  output: number;
  cache_create: number;
  cache_read: number;
  cost: number;
}

interface ModelData {
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost: number;
  cache_hit_rate: number;
}

export default function CostsPage() {
  const [tokenData, setTokenData] = useState<TokenData[]>([]);
  const [modelData, setModelData] = useState<ModelData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const to = new Date().toISOString().split("T")[0];
    const from = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .split("T")[0];

    Promise.all([
      fetch(`/api/stats/tokens?from=${from}&to=${to}`).then((r) => r.json()),
      fetch(`/api/stats/models?from=${from}&to=${to}`).then((r) => r.json()),
    ])
      .then(([tokens, models]) => {
        setTokenData(tokens.data || []);
        setModelData(models.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const totalCost = tokenData.reduce((sum, d) => sum + d.cost, 0);
  const totalTokens = tokenData.reduce(
    (sum, d) => sum + d.input + d.output + d.cache_create + d.cache_read,
    0,
  );

  // Max subscription value comparison
  const maxPlanCost = 200; // Claude Max plan at $200/mo
  const valueMultiplier =
    totalCost > 0 ? (totalCost / maxPlanCost).toFixed(1) : "0";

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-6">Costs & Tokens</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
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
      <h1 className="text-2xl font-bold mb-6">Costs & Tokens</h1>

      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Equivalent API Cost (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatCost(totalCost)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-muted-foreground">
              Total Tokens (30d)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{formatTokens(totalTokens)}</p>
          </CardContent>
        </Card>
        <Card className="bg-emerald-950/30 border-emerald-800/50">
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-emerald-400">
              Value vs Max Plan ($200/mo)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-emerald-400">
              {valueMultiplier}x
            </p>
            <p className="text-xs text-emerald-400/70">
              You&apos;d pay {formatCost(totalCost)} on API pricing
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Budget Forecast */}
      {(() => {
        const last7 = tokenData.slice(-7);
        const avgDaily =
          last7.length > 0
            ? last7.reduce((s, d) => s + d.cost, 0) / last7.length
            : 0;
        const projected30 = avgDaily * 30;
        const budget = 5000;
        const pct = budget > 0 ? (projected30 / budget) * 100 : 0;
        const color =
          pct > 100
            ? "text-red-400"
            : pct > 80
              ? "text-yellow-400"
              : "text-emerald-400";

        return (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-sm">30-Day Budget Forecast</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Daily Average (7d)
                  </p>
                  <p className="text-2xl font-bold">{formatCost(avgDaily)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Projected 30-Day
                  </p>
                  <p className={`text-2xl font-bold ${color}`}>
                    {formatCost(projected30)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Budget ($5,000/mo)
                  </p>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-3 bg-muted rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full ${pct > 100 ? "bg-red-500" : pct > 80 ? "bg-yellow-500" : "bg-emerald-500"}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span className={`text-sm font-medium ${color}`}>
                      {pct.toFixed(0)}%
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Cost over time */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Daily Cost (30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={tokenData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#888" }}
                tickFormatter={(d) =>
                  new Date(d).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#888" }}
                tickFormatter={(v) => `$${v.toFixed(0)}`}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: 8,
                }}
                formatter={(value) => [`$${Number(value).toFixed(2)}`, "Cost"]}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
              />
              <Area
                type="monotone"
                dataKey="cost"
                stroke="#22c55e"
                fill="#22c55e"
                fillOpacity={0.15}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Token breakdown */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">
            Token Breakdown by Type (30 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={tokenData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#333" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 11, fill: "#888" }}
                tickFormatter={(d) =>
                  new Date(d).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                  })
                }
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#888" }}
                tickFormatter={(v) => formatTokens(v)}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#1a1a1a",
                  border: "1px solid #333",
                  borderRadius: 8,
                }}
                formatter={(value, name) => [formatTokens(Number(value)), name]}
              />
              <Legend />
              <Bar dataKey="input" stackId="a" fill="#60a5fa" name="Input" />
              <Bar dataKey="output" stackId="a" fill="#34d399" name="Output" />
              <Bar
                dataKey="cache_create"
                stackId="a"
                fill="#fbbf24"
                name="Cache Write"
              />
              <Bar
                dataKey="cache_read"
                stackId="a"
                fill="#a78bfa"
                name="Cache Read"
              />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Cache efficiency */}
      {(() => {
        const totalCacheRead = tokenData.reduce((s, d) => s + d.cache_read, 0);
        const totalCacheWrite = tokenData.reduce(
          (s, d) => s + d.cache_create,
          0,
        );
        const totalInput = tokenData.reduce((s, d) => s + d.input, 0);
        const allInput = totalCacheRead + totalCacheWrite + totalInput;
        const hitRate =
          allInput > 0 ? ((totalCacheRead / allInput) * 100).toFixed(1) : "0";
        const savedCost = (totalCacheRead / 1_000_000) * (15 - 3.75); // saved vs paying full input price on opus

        return (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-sm">
                Cache Efficiency (30 days)
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">
                    Cache Hit Rate
                  </p>
                  <p className="text-2xl font-bold text-emerald-400">
                    {hitRate}%
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cache Reads</p>
                  <p className="text-2xl font-bold">
                    {formatTokens(totalCacheRead)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Cache Writes</p>
                  <p className="text-2xl font-bold">
                    {formatTokens(totalCacheWrite)}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">
                    Estimated Savings
                  </p>
                  <p className="text-2xl font-bold text-emerald-400">
                    {formatCost(savedCost)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    vs full input pricing
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })()}

      {/* Model comparison */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Model Comparison (30 days)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-3 font-medium">Model</th>
                  <th className="text-right p-3 font-medium">Requests</th>
                  <th className="text-right p-3 font-medium">Input</th>
                  <th className="text-right p-3 font-medium">Output</th>
                  <th className="text-right p-3 font-medium">Cache Hit</th>
                  <th className="text-right p-3 font-medium">Cost</th>
                </tr>
              </thead>
              <tbody>
                {modelData.map((m) => (
                  <tr key={m.model} className="border-t">
                    <td className="p-3 font-medium">
                      {MODEL_PRICING[m.model]?.display_name || m.model}
                    </td>
                    <td className="p-3 text-right">
                      {m.requests.toLocaleString()}
                    </td>
                    <td className="p-3 text-right">
                      {formatTokens(m.input_tokens)}
                    </td>
                    <td className="p-3 text-right">
                      {formatTokens(m.output_tokens)}
                    </td>
                    <td className="p-3 text-right">
                      {(m.cache_hit_rate * 100).toFixed(1)}%
                    </td>
                    <td className="p-3 text-right font-medium">
                      {formatCost(m.cost)}
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
