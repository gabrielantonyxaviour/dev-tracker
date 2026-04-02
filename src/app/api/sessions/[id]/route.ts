import { NextRequest, NextResponse } from "next/server";
import {
  getSessionById,
  getChildSessions,
  getCompactEvents,
} from "@/lib/db-queries";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const session = getSessionById(id);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const children = getChildSessions(id);
    const compact_events = getCompactEvents(id);

    return NextResponse.json({ ...session, children, compact_events });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
