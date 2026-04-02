import { NextRequest, NextResponse } from "next/server";
import { getProjectById, getRecentSessions } from "@/lib/db-queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = getProjectById(id);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const { sessions: recentSessions } = getRecentSessions(20, 0, {
      project_id: id,
    });

    return NextResponse.json({
      project,
      recent_sessions: recentSessions,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
