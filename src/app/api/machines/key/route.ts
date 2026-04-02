import { NextResponse } from "next/server";
import { getApiKey } from "@/lib/auth";

export async function GET() {
  try {
    const key = getApiKey();
    return NextResponse.json({ key });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
