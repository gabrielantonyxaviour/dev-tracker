import { NextRequest, NextResponse } from "next/server";
import { getDb } from "./db";
import crypto from "crypto";

/**
 * Get or generate the API key.
 * Checks DEV_TRACKER_API_KEY env var first, then settings table.
 * On first run, auto-generates and stores a key.
 */
export function getApiKey(): string {
  const envKey = process.env.DEV_TRACKER_API_KEY;
  if (envKey) return envKey;

  const db = getDb();
  const row = db
    .prepare(`SELECT value FROM settings WHERE key = 'api_key'`)
    .get() as { value: string } | undefined;

  if (row) return row.value;

  // Auto-generate on first access
  const newKey = crypto.randomBytes(32).toString("hex");
  db.prepare(
    `INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES ('api_key', ?, datetime('now'))`,
  ).run(newKey);

  console.log(`\n[dev-tracker] API key generated: ${newKey}\n`);
  console.log(`Use this key to configure remote machines:\n`);
  console.log(
    `  dev-tracker setup --server http://<this-ip>:3020 --key ${newKey}\n`,
  );

  return newKey;
}

/**
 * Validate an ingest request's API key.
 * Returns null if valid, or a NextResponse with 401 if invalid.
 * Localhost requests without a key are allowed (backward compat).
 */
export function validateIngestAuth(request: NextRequest): NextResponse | null {
  const apiKey = request.headers.get("x-api-key");
  const isLocalhost =
    request.headers.get("host")?.startsWith("localhost") ||
    request.headers.get("host")?.startsWith("127.0.0.1");

  // Localhost without key = backward compat (local hooks)
  if (!apiKey && isLocalhost) return null;

  // Remote requests must have a key
  if (!apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serverKey = getApiKey();
  if (apiKey !== serverKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}

/**
 * Extract machine_id from request body.
 * Returns null for localhost requests without machine_id (backward compat).
 */
export function extractMachineId(
  body: Record<string, unknown>,
  request: NextRequest,
): string | null {
  if (body.machine_id && typeof body.machine_id === "string") {
    return body.machine_id;
  }
  return null;
}

/**
 * Upsert a machine record from ingest metadata.
 */
export function upsertMachine(
  machineId: string,
  meta: { hostname: string; os: string; architecture?: string },
): void {
  const db = getDb();
  const now = new Date().toISOString();

  const existing = db
    .prepare(`SELECT id FROM machines WHERE id = ?`)
    .get(machineId) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      `UPDATE machines SET hostname = ?, os = ?, architecture = COALESCE(?, architecture), last_seen_at = ? WHERE id = ?`,
    ).run(meta.hostname, meta.os, meta.architecture || null, now, machineId);
  } else {
    db.prepare(
      `INSERT INTO machines (id, hostname, os, architecture, first_seen_at, last_seen_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      machineId,
      meta.hostname,
      meta.os,
      meta.architecture || null,
      now,
      now,
    );
  }
}
