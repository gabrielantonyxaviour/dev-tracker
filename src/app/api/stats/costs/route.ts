import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const defaultFrom = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .split("T")[0];
    const defaultTo = new Date().toISOString().split("T")[0];

    const from = searchParams.get("from") || defaultFrom;
    const to = searchParams.get("to") || defaultTo;

    const db = getDb();
    const data = db
      .prepare(
        `SELECT
        date,
        model,
        SUM(equivalent_cost_usd) as cost,
        SUM(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens) as total_tokens,
        SUM(request_count) as requests
      FROM model_daily_stats
      WHERE date >= ? AND date <= ?
      GROUP BY date, model
      ORDER BY date, model`,
      )
      .all(from, to) as {
      date: string;
      model: string;
      cost: number;
      total_tokens: number;
      requests: number;
    }[];

    // Also provide a daily total for convenience
    const daily_totals = db
      .prepare(
        `SELECT
        date,
        SUM(equivalent_cost_usd) as cost,
        SUM(input_tokens + output_tokens + cache_creation_tokens + cache_read_tokens) as total_tokens
      FROM model_daily_stats
      WHERE date >= ? AND date <= ?
      GROUP BY date
      ORDER BY date`,
      )
      .all(from, to) as {
      date: string;
      cost: number;
      total_tokens: number;
    }[];

    return NextResponse.json({
      by_model: data,
      daily_totals,
      from,
      to,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
