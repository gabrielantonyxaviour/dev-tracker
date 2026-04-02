import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export interface SecurityFlag {
  id: string;
  tool_name: string;
  input_summary: string | null;
  session_id: string;
  started_at: string;
  project: string;
  pattern: string;
}

const PATTERNS = [
  { sql: "tu.input_summary LIKE '%rm -rf%'", label: "rm -rf" },
  { sql: "tu.input_summary LIKE '%--force%'", label: "--force" },
  { sql: "tu.input_summary LIKE '%.env%'", label: ".env access" },
  { sql: "tu.input_summary LIKE '%secret%'", label: "secret reference" },
  { sql: "tu.input_summary LIKE '%password%'", label: "password reference" },
  {
    sql: "tu.input_summary LIKE '%credentials%'",
    label: "credentials reference",
  },
  {
    sql: "(tu.tool_name = 'Bash' AND tu.input_summary LIKE '%curl%' AND tu.input_summary LIKE '%auth%')",
    label: "curl with auth",
  },
];

export async function GET() {
  try {
    const db = getDb();

    const whereClause = PATTERNS.map((p) => `(${p.sql})`).join(" OR ");

    const rows = db
      .prepare(
        `SELECT tu.id, tu.tool_name, tu.input_summary, tu.session_id,
                s.started_at, p.display_name as project
         FROM tool_uses tu
         JOIN sessions s ON tu.session_id = s.id
         JOIN projects p ON s.project_id = p.id
         WHERE ${whereClause}
         ORDER BY s.started_at DESC
         LIMIT 100`,
      )
      .all() as {
      id: string;
      tool_name: string;
      input_summary: string | null;
      session_id: string;
      started_at: string;
      project: string;
    }[];

    const flagged: SecurityFlag[] = rows.map((row) => {
      const summary = (row.input_summary || "").toLowerCase();
      let pattern = "unknown";
      if (summary.includes("rm -rf")) pattern = "rm -rf";
      else if (summary.includes("--force")) pattern = "--force";
      else if (summary.includes(".env")) pattern = ".env access";
      else if (summary.includes("secret")) pattern = "secret reference";
      else if (summary.includes("password")) pattern = "password reference";
      else if (summary.includes("credentials"))
        pattern = "credentials reference";
      else if (summary.includes("curl") && summary.includes("auth"))
        pattern = "curl with auth";

      return { ...row, pattern };
    });

    return NextResponse.json({
      count: flagged.length,
      flagged,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
