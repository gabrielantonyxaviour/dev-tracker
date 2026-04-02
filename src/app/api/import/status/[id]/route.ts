import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = getDb();

    const run = db.prepare(`SELECT * FROM import_runs WHERE id = ?`).get(id);

    if (!run) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(run);
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
