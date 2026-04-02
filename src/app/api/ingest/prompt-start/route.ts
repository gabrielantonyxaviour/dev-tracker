import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { categorizeProject, deriveDisplayName } from "@/lib/constants";
import { v4 as uuid } from "uuid";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id, cwd, prompt } = body as {
      session_id?: string;
      cwd?: string;
      prompt?: string;
    };

    if (!session_id) {
      return NextResponse.json(
        { error: "session_id is required" },
        { status: 400 },
      );
    }

    const db = getDb();
    const now = new Date().toISOString();
    const projectCwd = cwd || "unknown";

    // Resolve or create project
    let projectId: string;
    const existingProject = db
      .prepare(`SELECT id FROM projects WHERE path = ?`)
      .get(projectCwd) as { id: string } | undefined;

    if (existingProject) {
      projectId = existingProject.id;
      db.prepare(`UPDATE projects SET last_seen_at = ? WHERE id = ?`).run(
        now,
        projectId,
      );
    } else {
      projectId = uuid();
      const displayName = deriveDisplayName(projectCwd);
      const category = categorizeProject(projectCwd);
      db.prepare(
        `INSERT INTO projects (id, path, encoded_path, display_name, category, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        projectId,
        projectCwd,
        projectCwd.replace(/\//g, "-"),
        displayName,
        category,
        now,
        now,
      );
    }

    // Generate title from prompt
    let title: string | null = null;
    if (prompt) {
      const clean = prompt
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      title = clean.slice(0, 80);
    }

    // Check if session already exists
    const existingSession = db
      .prepare(`SELECT id FROM sessions WHERE id = ?`)
      .get(session_id) as { id: string } | undefined;

    if (existingSession) {
      // Update with latest info
      db.prepare(
        `UPDATE sessions SET title = COALESCE(?, title), prompt_count = prompt_count + 1 WHERE id = ?`,
      ).run(title, session_id);

      return NextResponse.json({
        status: "updated",
        session_id,
        project_id: projectId,
      });
    }

    // Create a pending session record
    db.prepare(
      `INSERT INTO sessions (
        id, project_id, title, started_at, prompt_count, entrypoint
      ) VALUES (?, ?, ?, ?, 1, 'cli')`,
    ).run(session_id, projectId, title, now);

    return NextResponse.json({
      status: "created",
      session_id,
      project_id: projectId,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
