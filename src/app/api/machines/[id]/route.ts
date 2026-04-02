import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { label } = body as { label?: string };

    if (!label) {
      return NextResponse.json({ error: "label is required" }, { status: 400 });
    }

    const db = getDb();
    const result = db
      .prepare(`UPDATE machines SET label = ? WHERE id = ?`)
      .run(label, id);

    if (result.changes === 0) {
      return NextResponse.json({ error: "Machine not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, id, label });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const db = getDb();

    db.prepare(
      `UPDATE sessions SET machine_id = NULL WHERE machine_id = ?`,
    ).run(id);
    db.prepare(`DELETE FROM machine_daily_stats WHERE machine_id = ?`).run(id);
    db.prepare(`DELETE FROM machines WHERE id = ?`).run(id);

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
