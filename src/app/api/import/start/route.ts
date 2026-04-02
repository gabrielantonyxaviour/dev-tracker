import { NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";

export async function POST() {
  try {
    const projectDir = path.resolve(process.cwd());

    // Spawn import as a background process
    exec(
      `cd "${projectDir}" && npx tsx src/scripts/import.ts`,
      { timeout: 600000 },
      (error, stdout, stderr) => {
        if (error) {
          console.error("Import error:", error.message);
        }
        if (stdout) console.log("Import:", stdout.slice(-200));
        if (stderr) console.error("Import stderr:", stderr.slice(-200));
      },
    );

    return NextResponse.json({
      status: "started",
      message: "Import process started in background.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message },
      { status: 500 },
    );
  }
}
