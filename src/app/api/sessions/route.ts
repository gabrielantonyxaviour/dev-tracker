import { NextRequest, NextResponse } from "next/server";
import { getRecentSessions } from "@/lib/db-queries";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1", 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(searchParams.get("limit") || "20", 10)),
    );
    const offset = (page - 1) * limit;

    const filters: {
      project_id?: string;
      date?: string;
      model?: string;
      search?: string;
      sort?: string;
      machine_id?: string;
    } = {};

    const project = searchParams.get("project");
    if (project) filters.project_id = project;

    const date = searchParams.get("date");
    if (date) filters.date = date;

    const model = searchParams.get("model");
    if (model) filters.model = model;

    const search = searchParams.get("search");
    if (search) filters.search = search;

    const sort = searchParams.get("sort");
    if (
      sort &&
      ["newest", "oldest", "longest", "tokens", "cost"].includes(sort)
    ) {
      filters.sort = sort;
    }

    const machineId = searchParams.get("machine_id");
    if (machineId) filters.machine_id = machineId;

    const { sessions, total } = getRecentSessions(limit, offset, filters);

    return NextResponse.json({
      sessions,
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
