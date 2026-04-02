import { NextRequest, NextResponse } from "next/server";
import { getToolStats } from "@/lib/db-queries";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;

    const defaultFrom = new Date(Date.now() - 30 * 86400000)
      .toISOString()
      .split("T")[0];
    const defaultTo = new Date().toISOString().split("T")[0];

    const from = searchParams.get("from") || defaultFrom;
    const to = searchParams.get("to") || defaultTo;
    const project = searchParams.get("project") || undefined;

    const data = getToolStats(from, to, project);

    return NextResponse.json({ data, from, to, project: project || null });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
