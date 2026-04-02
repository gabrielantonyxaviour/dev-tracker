import { NextResponse } from "next/server";
import { getAllProjects } from "@/lib/db-queries";

export async function GET() {
  try {
    const projects = getAllProjects();
    return NextResponse.json({ projects });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
