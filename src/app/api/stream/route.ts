import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const db = getDb();

      // Seed watermarks from current DB state
      let lastTurnId = 0;
      let lastSessionCount = 0;

      try {
        // Use rowid as watermark — turn IDs are UUIDs
        const latestTurnRow = db
          .prepare(`SELECT MAX(rowid) as rid FROM turns`)
          .get() as { rid: number | null };
        lastTurnId = latestTurnRow?.rid ?? 0;

        const sessionCount = db
          .prepare(
            `SELECT COUNT(*) as c FROM sessions WHERE is_agent_session = 0`,
          )
          .get() as { c: number };
        lastSessionCount = sessionCount.c;
      } catch {
        // DB may not be ready yet
      }

      const interval = setInterval(() => {
        try {
          // Check for new turns (most granular indicator of activity)
          const currentMaxTurn = db
            .prepare(`SELECT MAX(rowid) as rid FROM turns`)
            .get() as { rid: number | null };
          const currentTurnId = currentMaxTurn?.rid ?? 0;

          // Check for new or changed sessions
          const currentSessionCount = db
            .prepare(
              `SELECT COUNT(*) as c FROM sessions WHERE is_agent_session = 0`,
            )
            .get() as { c: number };

          const turnsChanged = currentTurnId > lastTurnId;
          const sessionsChanged = currentSessionCount.c !== lastSessionCount;

          if (turnsChanged || sessionsChanged) {
            lastTurnId = currentTurnId;
            lastSessionCount = currentSessionCount.c;

            // Send updated today stats
            const today = new Date().toISOString().split("T")[0];
            const stats = db
              .prepare(
                `SELECT
                  COUNT(DISTINCT s.id) as sessions,
                  COALESCE(SUM(s.prompt_count), 0) as prompts,
                  COALESCE(SUM(s.equivalent_cost_usd), 0) as cost_usd
                FROM sessions s
                WHERE date(s.started_at) = ? AND s.is_agent_session = 0`,
              )
              .get(today) as {
              sessions: number;
              prompts: number;
              cost_usd: number;
            };

            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ type: "stats", data: stats })}\n\n`,
              ),
            );
          }

          // Send heartbeat to keep connection alive
          controller.enqueue(encoder.encode(`: heartbeat\n\n`));
        } catch {
          // DB might be locked during import — skip this tick
        }
      }, 5000);

      // Cleanup on client disconnect
      request.signal.addEventListener("abort", () => {
        clearInterval(interval);
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
