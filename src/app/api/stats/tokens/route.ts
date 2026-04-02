import { NextRequest, NextResponse } from "next/server";
import { getTokenTimeSeries } from "@/lib/db-queries";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const period = (searchParams.get("period") || "day") as
      | "day"
      | "week"
      | "month";
    if (!["day", "week", "month"].includes(period)) {
      return NextResponse.json(
        { error: "Invalid period. Must be day, week, or month." },
        { status: 400 },
      );
    }

    const defaultFrom = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .split("T")[0];
    const defaultTo = new Date().toISOString().split("T")[0];

    const from = searchParams.get("from") || defaultFrom;
    const to = searchParams.get("to") || defaultTo;

    const data = getTokenTimeSeries(from, to, period);

    return NextResponse.json({ data, period, from, to });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
