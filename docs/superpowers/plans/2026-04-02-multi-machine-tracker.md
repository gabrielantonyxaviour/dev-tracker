# Multi-Machine Dev Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend dev-tracker to collect and unify Claude Code usage data across multiple machines via stop hooks, with a CLI for setup and Docker/npm packaging for distribution.

**Architecture:** One machine runs the server (Next.js + SQLite). Other machines push parsed session data via Claude Code stop hooks to the server's ingest API. Auth is a single shared API key. Machines self-register on first contact.

**Tech Stack:** Next.js 16, better-sqlite3, TypeScript, Commander.js (CLI), Docker

**Spec:** `docs/superpowers/specs/2026-04-02-multi-machine-tracker-design.md`

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/lib/auth.ts` | API key validation helper |
| `src/app/api/ingest/session/route.ts` | Unified remote ingest endpoint |
| `src/app/api/machines/route.ts` | List machines |
| `src/app/api/machines/[id]/route.ts` | Update/delete machine |
| `src/app/settings/machines/page.tsx` | Machines management UI |
| `src/cli/index.ts` | CLI entry point (start, setup, hook, import) |
| `src/cli/setup.ts` | Machine setup logic |
| `src/cli/hook-session-end.ts` | Stop hook handler |
| `src/cli/queue.ts` | Offline queue management |
| `bin/cli.js` | npm bin entry point |
| `Dockerfile` | Docker image build |
| `docker-compose.yml` | Easy server setup |

### Modified files
| File | Changes |
|------|---------|
| `src/lib/db.ts` | Add `machines` table, `machine_daily_stats` table, `machine_id` column on sessions |
| `src/lib/types.ts` | Add `Machine`, `MachineWithStats` types, extend `Session` with `machine_id` |
| `src/lib/aggregator.ts` | Add `rebuildMachineDailyStats()` |
| `src/lib/db-queries.ts` | Add machine filter param to existing queries, add machine queries |
| `src/app/api/ingest/session-end/route.ts` | Add auth check, accept `machine_id` |
| `src/app/api/ingest/prompt-start/route.ts` | Add auth check, accept `machine_id` |
| `src/app/api/ingest/tool-use/route.ts` | Add auth check, accept `machine_id` |
| `src/app/api/ingest/heartbeat/route.ts` | Add auth check, accept `machine_id` |
| `src/app/api/ingest/event/route.ts` | Add auth check, accept `machine_id` |
| `src/app/api/dashboard/route.ts` | Accept `?machine_id` filter |
| `src/app/api/sessions/route.ts` | Accept `?machine_id` filter |
| `src/components/sidebar.tsx` | Add machine selector dropdown |
| `src/app/settings/page.tsx` | Add link to machines sub-page |
| `package.json` | Add `bin`, `commander` dep, update scripts |
| `next.config.ts` | Enable `output: 'standalone'` |

---

### Task 1: Database Schema — Machines Table & Session Column

**Files:**
- Modify: `src/lib/db.ts`

- [ ] **Step 1: Add machines table to initSchema**

In `src/lib/db.ts`, add the `machines` table and `machine_daily_stats` table inside `initSchema()`, after the `settings` table creation:

```sql
CREATE TABLE IF NOT EXISTS machines (
  id TEXT PRIMARY KEY,
  hostname TEXT NOT NULL,
  os TEXT NOT NULL,
  label TEXT,
  architecture TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS machine_daily_stats (
  machine_id TEXT NOT NULL REFERENCES machines(id),
  date TEXT NOT NULL,
  session_count INTEGER DEFAULT 0,
  prompt_count INTEGER DEFAULT 0,
  active_duration_ms INTEGER DEFAULT 0,
  total_input_tokens INTEGER DEFAULT 0,
  total_output_tokens INTEGER DEFAULT 0,
  total_cache_creation_tokens INTEGER DEFAULT 0,
  total_cache_read_tokens INTEGER DEFAULT 0,
  equivalent_cost_usd REAL DEFAULT 0,
  PRIMARY KEY (machine_id, date)
);
CREATE INDEX IF NOT EXISTS idx_machine_daily_date ON machine_daily_stats(date);
```

- [ ] **Step 2: Add machine_id migration to sessions**

In the `migrateSchema()` function, add `machine_id` to the `sessionCols` array:

```typescript
["machine_id", "TEXT"],
```

Also add an index migration after the column additions:

```typescript
// Machine index on sessions
try {
  db.exec(`CREATE INDEX IF NOT EXISTS idx_sessions_machine ON sessions(machine_id)`);
} catch { /* index already exists */ }
```

- [ ] **Step 3: Verify schema applies cleanly**

Run: `npm run dev` — server should start without errors. The new tables and column should be created automatically.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add machines table, machine_daily_stats, and sessions.machine_id column"
```

---

### Task 2: TypeScript Types — Machine & Extended Session

**Files:**
- Modify: `src/lib/types.ts`

- [ ] **Step 1: Add Machine interface**

Add after the `ToolUse` interface (around line 97):

```typescript
export interface Machine {
  id: string;
  hostname: string;
  os: string;
  label: string | null;
  architecture: string | null;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
}

export interface MachineWithStats extends Machine {
  session_count: number;
  total_cost_usd: number;
}
```

- [ ] **Step 2: Add machine_id to Session interface**

Add `machine_id` field to the `Session` interface, after `agent_name`:

```typescript
machine_id: string | null;
```

- [ ] **Step 3: Add SessionWithMachine type**

Add after `SessionWithProject`:

```typescript
export interface SessionWithProjectAndMachine extends SessionWithProject {
  machine_id: string | null;
  machine_label: string | null;
  machine_os: string | null;
}
```

- [ ] **Step 4: Add IngestSessionPayload type**

Add at the end of the file — this is the payload remote machines POST:

```typescript
export interface IngestSessionPayload {
  machine_id: string;
  machine_meta: {
    hostname: string;
    os: string;
    architecture: string;
  };
  session: {
    id: string;
    cwd: string;
    git_branch: string | null;
    version: string | null;
    started_at: string;
    ended_at: string;
    is_agent_session: boolean;
    slug: string | null;
    stop_reason: string | null;
    parent_session_id: string | null;
    agent_name: string | null;
    total_web_searches: number;
    total_web_fetches: number;
    coding_active_ms: number;
    coding_idle_ms: number;
    turns: Array<{
      turn_index: number;
      prompt_text: string | null;
      response_text: string | null;
      prompt_timestamp: string;
      response_timestamp: string | null;
      duration_ms: number | null;
      actual_duration_ms: number | null;
      input_tokens: number;
      output_tokens: number;
      cache_creation_tokens: number;
      cache_read_tokens: number;
      cache_5m_tokens: number;
      cache_1h_tokens: number;
      model: string | null;
      service_tier: string | null;
      inference_speed: string | null;
      stop_reason: string | null;
      has_thinking: boolean;
      message_count: number | null;
      tool_use_count: number;
      web_search_requests: number;
      web_fetch_requests: number;
      equivalent_cost_usd: number;
      tool_uses: Array<{
        tool_name: string;
        tool_category: string;
        input_summary: string | null;
        is_error: boolean;
        timestamp: string | null;
      }>;
    }>;
    file_changes: string[];
    hook_executions: Array<{
      hook_command: string;
      duration_ms: number | null;
      had_error: boolean;
      error_message: string | null;
      timestamp: string | null;
    }>;
    compact_events: Array<{
      timestamp: string;
      pre_tokens: number;
      trigger: string;
      content_length: number;
    }>;
  };
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts
git commit -m "feat: add Machine types and IngestSessionPayload"
```

---

### Task 3: Auth Middleware — API Key Validation

**Files:**
- Create: `src/lib/auth.ts`

- [ ] **Step 1: Create auth.ts**

```typescript
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
  console.log(`  dev-tracker setup --server http://<this-ip>:3020 --key ${newKey}\n`);

  return newKey;
}

/**
 * Validate an ingest request's API key.
 * Returns null if valid, or a NextResponse with 401 if invalid.
 * Localhost requests without a key are allowed (backward compat).
 */
export function validateIngestAuth(
  request: NextRequest,
): NextResponse | null {
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

  // Localhost without machine_id = local machine
  const isLocalhost =
    request.headers.get("host")?.startsWith("localhost") ||
    request.headers.get("host")?.startsWith("127.0.0.1");

  if (isLocalhost) return null;

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
    ).run(machineId, meta.hostname, meta.os, meta.architecture || null, now, now);
  }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `npx tsc --noEmit src/lib/auth.ts` or just `npm run build` — should have no type errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat: add API key auth middleware and machine upsert"
```

---

### Task 4: Unified Remote Ingest Endpoint

**Files:**
- Create: `src/app/api/ingest/session/route.ts`

- [ ] **Step 1: Create the unified ingest endpoint**

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { validateIngestAuth, upsertMachine } from "@/lib/auth";
import { calculateCost } from "@/lib/cost-calculator";
import { getToolCategory, categorizeProject, deriveDisplayName } from "@/lib/constants";
import {
  rebuildDailyStats,
  rebuildProjectDailyStats,
  rebuildModelDailyStats,
  rebuildProjectTotals,
  rebuildMachineDailyStats,
} from "@/lib/aggregator";
import { v4 as uuid } from "uuid";
import type { IngestSessionPayload } from "@/lib/types";

export async function POST(request: NextRequest) {
  const authError = validateIngestAuth(request);
  if (authError) return authError;

  try {
    const body = (await request.json()) as IngestSessionPayload;
    const { machine_id, machine_meta, session: s } = body;

    if (!machine_id || !machine_meta || !s) {
      return NextResponse.json(
        { error: "machine_id, machine_meta, and session are required" },
        { status: 400 },
      );
    }

    if (!s.id || !s.cwd || !s.started_at || !s.ended_at) {
      return NextResponse.json(
        { error: "session must include id, cwd, started_at, ended_at" },
        { status: 400 },
      );
    }

    const db = getDb();

    // Check duplicate
    const existing = db
      .prepare(`SELECT id FROM sessions WHERE id = ?`)
      .get(s.id) as { id: string } | undefined;

    if (existing) {
      return NextResponse.json(
        { error: "Session already exists", session_id: s.id },
        { status: 409 },
      );
    }

    // Upsert machine
    upsertMachine(machine_id, machine_meta);

    // Resolve project
    let projectId: string;
    const existingProject = db
      .prepare(`SELECT id FROM projects WHERE path = ?`)
      .get(s.cwd) as { id: string } | undefined;

    if (existingProject) {
      projectId = existingProject.id;
      db.prepare(`UPDATE projects SET last_seen_at = ? WHERE id = ?`).run(
        s.started_at,
        projectId,
      );
    } else {
      projectId = uuid();
      const displayName = deriveDisplayName(s.cwd);
      const category = categorizeProject(s.cwd);
      db.prepare(
        `INSERT INTO projects (id, path, encoded_path, display_name, category, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        projectId,
        s.cwd,
        s.cwd.replace(/\//g, "-"),
        displayName,
        category,
        s.started_at,
        s.started_at,
      );
    }

    // Calculate session-level aggregates
    let totalInputTokens = 0;
    let totalOutputTokens = 0;
    let totalCacheCreate = 0;
    let totalCacheRead = 0;
    let activeDuration = 0;
    const modelCounts: Record<string, number> = {};

    for (const turn of s.turns) {
      totalInputTokens += turn.input_tokens;
      totalOutputTokens += turn.output_tokens;
      totalCacheCreate += turn.cache_creation_tokens;
      totalCacheRead += turn.cache_read_tokens;
      if (turn.duration_ms) activeDuration += turn.duration_ms;
      if (turn.model) {
        modelCounts[turn.model] = (modelCounts[turn.model] || 0) + 1;
      }
    }

    const primaryModel =
      Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const sessionCost = calculateCost({
      input_tokens: totalInputTokens,
      output_tokens: totalOutputTokens,
      cache_creation_tokens: totalCacheCreate,
      cache_read_tokens: totalCacheRead,
      model: primaryModel || "claude-sonnet-4-6",
    });

    const durationMs =
      new Date(s.ended_at).getTime() - new Date(s.started_at).getTime();

    // Generate title from first prompt
    const firstPrompt = s.turns[0]?.prompt_text;
    let title: string | null = null;
    if (firstPrompt) {
      const clean = firstPrompt
        .replace(/<[^>]+>/g, "")
        .replace(/\s+/g, " ")
        .trim();
      title = clean.slice(0, 80);
    }

    // Insert in transaction
    const insertAll = db.transaction(() => {
      db.prepare(
        `INSERT OR REPLACE INTO sessions (
          id, project_id, git_branch, title, started_at, ended_at,
          duration_ms, active_duration_ms, prompt_count, response_count,
          total_input_tokens, total_output_tokens, total_cache_creation_tokens,
          total_cache_read_tokens, equivalent_cost_usd, primary_model,
          entrypoint, version, is_agent_session, slug, stop_reason,
          parent_session_id, agent_name, total_web_searches, total_web_fetches,
          coding_active_ms, coding_idle_ms, compact_count, machine_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        s.id,
        projectId,
        s.git_branch,
        title,
        s.started_at,
        s.ended_at,
        durationMs > 0 ? durationMs : null,
        activeDuration > 0 ? activeDuration : null,
        s.turns.length,
        s.turns.length,
        totalInputTokens,
        totalOutputTokens,
        totalCacheCreate,
        totalCacheRead,
        sessionCost,
        primaryModel,
        "cli",
        s.version,
        s.is_agent_session ? 1 : 0,
        s.slug,
        s.stop_reason,
        s.parent_session_id,
        s.agent_name,
        s.total_web_searches,
        s.total_web_fetches,
        s.coding_active_ms || 0,
        s.coding_idle_ms || 0,
        s.compact_events?.length || 0,
        machine_id,
      );

      for (const turn of s.turns) {
        const turnId = uuid();
        const turnCost = calculateCost({
          input_tokens: turn.input_tokens,
          output_tokens: turn.output_tokens,
          cache_creation_tokens: turn.cache_creation_tokens,
          cache_read_tokens: turn.cache_read_tokens,
          model: turn.model || primaryModel || "claude-sonnet-4-6",
        });

        db.prepare(
          `INSERT OR REPLACE INTO turns (
            id, session_id, turn_index, prompt_text, response_text, prompt_timestamp,
            response_timestamp, duration_ms, actual_duration_ms, message_count, model,
            input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens,
            stop_reason, has_thinking, tool_use_count, equivalent_cost_usd,
            service_tier, inference_speed, cache_5m_tokens, cache_1h_tokens,
            web_search_requests, web_fetch_requests
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          turnId,
          s.id,
          turn.turn_index,
          turn.prompt_text,
          turn.response_text,
          turn.prompt_timestamp,
          turn.response_timestamp,
          turn.duration_ms,
          turn.actual_duration_ms,
          turn.message_count,
          turn.model,
          turn.input_tokens,
          turn.output_tokens,
          turn.cache_creation_tokens,
          turn.cache_read_tokens,
          turn.stop_reason,
          turn.has_thinking ? 1 : 0,
          turn.tool_uses.length,
          turnCost,
          turn.service_tier,
          turn.inference_speed,
          turn.cache_5m_tokens,
          turn.cache_1h_tokens,
          turn.web_search_requests,
          turn.web_fetch_requests,
        );

        for (const tool of turn.tool_uses) {
          db.prepare(
            `INSERT OR REPLACE INTO tool_uses (
              id, turn_id, session_id, tool_name, tool_category, input_summary, is_error, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          ).run(
            uuid(),
            turnId,
            s.id,
            tool.tool_name,
            tool.tool_category || getToolCategory(tool.tool_name),
            tool.input_summary,
            tool.is_error ? 1 : 0,
            tool.timestamp,
          );
        }
      }

      for (const filePath of s.file_changes) {
        db.prepare(
          `INSERT INTO file_changes (session_id, file_path, change_type, timestamp)
           VALUES (?, ?, ?, ?)`,
        ).run(s.id, filePath, "modified", s.ended_at);
      }

      for (const hook of s.hook_executions || []) {
        db.prepare(
          `INSERT INTO hook_executions (session_id, hook_command, duration_ms, had_error, error_message, timestamp)
           VALUES (?, ?, ?, ?, ?, ?)`,
        ).run(
          s.id,
          hook.hook_command,
          hook.duration_ms,
          hook.had_error ? 1 : 0,
          hook.error_message,
          hook.timestamp,
        );
      }

      for (const compact of s.compact_events || []) {
        db.prepare(
          `INSERT INTO compact_events (session_id, trigger, pre_tokens, content_length, timestamp)
           VALUES (?, ?, ?, ?, ?)`,
        ).run(s.id, compact.trigger, compact.pre_tokens, compact.content_length, compact.timestamp);
      }
    });

    insertAll();

    rebuildDailyStats();
    rebuildProjectDailyStats();
    rebuildModelDailyStats();
    rebuildProjectTotals();
    rebuildMachineDailyStats();

    return NextResponse.json({
      ok: true,
      session_id: s.id,
      turns: s.turns.length,
      cost_usd: sessionCost,
      project_id: projectId,
      machine_id,
    });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/ingest/session/route.ts
git commit -m "feat: add unified remote ingest endpoint POST /api/ingest/session"
```

---

### Task 5: Aggregator — Machine Daily Stats

**Files:**
- Modify: `src/lib/aggregator.ts`

- [ ] **Step 1: Add rebuildMachineDailyStats function**

Add before the `rebuildAllAggregates` function:

```typescript
export function rebuildMachineDailyStats() {
  const db = getDb();

  db.exec(`DELETE FROM machine_daily_stats`);

  db.exec(`
    INSERT INTO machine_daily_stats (
      machine_id, date, session_count, prompt_count,
      active_duration_ms, total_input_tokens, total_output_tokens,
      total_cache_creation_tokens, total_cache_read_tokens,
      equivalent_cost_usd
    )
    SELECT
      s.machine_id,
      date(s.started_at) as date,
      COUNT(DISTINCT s.id),
      COALESCE(SUM(s.prompt_count), 0),
      COALESCE(SUM(s.active_duration_ms), 0),
      COALESCE(SUM(s.total_input_tokens), 0),
      COALESCE(SUM(s.total_output_tokens), 0),
      COALESCE(SUM(s.total_cache_creation_tokens), 0),
      COALESCE(SUM(s.total_cache_read_tokens), 0),
      COALESCE(SUM(s.equivalent_cost_usd), 0)
    FROM sessions s
    WHERE s.machine_id IS NOT NULL AND s.is_agent_session = 0
    GROUP BY s.machine_id, date(s.started_at)
  `);
}
```

- [ ] **Step 2: Add to rebuildAllAggregates**

Add `rebuildMachineDailyStats()` call inside `rebuildAllAggregates`:

```typescript
export function rebuildAllAggregates() {
  console.log("Rebuilding daily stats...");
  rebuildDailyStats();
  console.log("Rebuilding project daily stats...");
  rebuildProjectDailyStats();
  console.log("Rebuilding model daily stats...");
  rebuildModelDailyStats();
  console.log("Rebuilding machine daily stats...");
  rebuildMachineDailyStats();
  console.log("Rebuilding project totals...");
  rebuildProjectTotals();
  console.log("All aggregates rebuilt.");
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/aggregator.ts
git commit -m "feat: add machine daily stats aggregation"
```

---

### Task 6: Add Auth to Existing Ingest Endpoints

**Files:**
- Modify: `src/app/api/ingest/session-end/route.ts`
- Modify: `src/app/api/ingest/prompt-start/route.ts`
- Modify: `src/app/api/ingest/tool-use/route.ts`
- Modify: `src/app/api/ingest/heartbeat/route.ts`
- Modify: `src/app/api/ingest/event/route.ts`

- [ ] **Step 1: Add auth to session-end**

At the top of `src/app/api/ingest/session-end/route.ts`, add import:

```typescript
import { validateIngestAuth, extractMachineId } from "@/lib/auth";
```

At the start of the POST handler, add auth check (before the body parsing line):

```typescript
const authError = validateIngestAuth(request);
if (authError) return authError;
```

In the session INSERT statement, add `machine_id` column. After parsing the body, extract it:

```typescript
const machineId = extractMachineId(body as Record<string, unknown>, request);
```

Add `machine_id` to the INSERT OR REPLACE statement's column list and values.

- [ ] **Step 2: Add auth to prompt-start**

Same pattern — import `validateIngestAuth` and `extractMachineId`, add auth check at top of handler, extract `machine_id`, pass to session INSERT if creating a new session.

- [ ] **Step 3: Add auth to tool-use, heartbeat, event**

Same pattern for each: import auth, add validation at top of handler. These endpoints don't create sessions, so `machine_id` is informational only — no schema changes needed for these.

- [ ] **Step 4: Verify all endpoints still work**

Start the server with `npm run dev`. Test that localhost requests without API key still work (backward compat):

```bash
curl -X POST http://localhost:3020/api/ingest/prompt-start \
  -H "Content-Type: application/json" \
  -d '{"session_id":"test-123","cwd":"/tmp/test","prompt":"hello"}'
```

Expected: 200 OK (localhost bypass works).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/ingest/
git commit -m "feat: add API key auth to all ingest endpoints"
```

---

### Task 7: Machine Management API Endpoints

**Files:**
- Create: `src/app/api/machines/route.ts`
- Create: `src/app/api/machines/[id]/route.ts`

- [ ] **Step 1: Create GET /api/machines**

```typescript
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import type { MachineWithStats } from "@/lib/types";

export async function GET() {
  try {
    const db = getDb();
    const machines = db
      .prepare(
        `SELECT m.*,
          (SELECT COUNT(*) FROM sessions s WHERE s.machine_id = m.id AND s.is_agent_session = 0) as session_count,
          (SELECT COALESCE(SUM(s.equivalent_cost_usd), 0) FROM sessions s WHERE s.machine_id = m.id AND s.is_agent_session = 0) as total_cost_usd
        FROM machines m
        ORDER BY m.last_seen_at DESC`,
      )
      .all() as MachineWithStats[];

    return NextResponse.json({ machines });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message },
      { status: 500 },
    );
  }
}
```

- [ ] **Step 2: Create PATCH/DELETE /api/machines/[id]**

```typescript
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
      return NextResponse.json(
        { error: "label is required" },
        { status: 400 },
      );
    }

    const db = getDb();
    const result = db
      .prepare(`UPDATE machines SET label = ? WHERE id = ?`)
      .run(label, id);

    if (result.changes === 0) {
      return NextResponse.json(
        { error: "Machine not found" },
        { status: 404 },
      );
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

    // Orphan sessions (set machine_id to NULL) rather than deleting them
    db.prepare(`UPDATE sessions SET machine_id = NULL WHERE machine_id = ?`).run(id);
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
```

- [ ] **Step 3: Commit**

```bash
git add src/app/api/machines/
git commit -m "feat: add machine management API endpoints"
```

---

### Task 8: Add Machine Filter to Query Endpoints

**Files:**
- Modify: `src/lib/db-queries.ts`
- Modify: `src/app/api/dashboard/route.ts`
- Modify: `src/app/api/sessions/route.ts`

- [ ] **Step 1: Update getRecentSessions in db-queries.ts**

Add `machine_id` optional param to the filter object. When present, add `AND s.machine_id = ?` to the WHERE clause. Also join machines table to get `machine_label` and `machine_os`:

In the SELECT, add:
```sql
m.label as machine_label, m.os as machine_os
```

In the FROM, add:
```sql
LEFT JOIN machines m ON s.machine_id = m.id
```

In the WHERE, conditionally add:
```sql
AND (? IS NULL OR s.machine_id = ?)
```

- [ ] **Step 2: Update dashboard route**

In `src/app/api/dashboard/route.ts`, read `?machine_id` from search params:

```typescript
const machineId = request.nextUrl.searchParams.get("machine_id");
```

Pass it through to the queries that aggregate sessions. Add `AND (? IS NULL OR s.machine_id = ?)` pattern to the dashboard queries.

- [ ] **Step 3: Update sessions route**

In `src/app/api/sessions/route.ts`, read `?machine_id` from search params and pass to `getRecentSessions`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/db-queries.ts src/app/api/dashboard/route.ts src/app/api/sessions/route.ts
git commit -m "feat: add machine_id filter to dashboard and sessions queries"
```

---

### Task 9: Sidebar Machine Selector

**Files:**
- Modify: `src/components/sidebar.tsx`

- [ ] **Step 1: Add machine selector to sidebar**

Add a machine dropdown above the nav items. It fetches machines from `/api/machines` and stores the selection in URL search params:

```typescript
"use client";

import Link from "next/link";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Terminal,
  FolderOpen,
  DollarSign,
  Activity,
  Wrench,
  Settings,
  Monitor,
  Laptop,
  Server,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MachineOption {
  id: string;
  label: string | null;
  hostname: string;
  os: string;
}

const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/sessions", label: "Sessions", icon: Terminal },
  { href: "/projects", label: "Projects", icon: FolderOpen },
  { href: "/costs", label: "Costs", icon: DollarSign },
  { href: "/activity", label: "Activity", icon: Activity },
  { href: "/tools", label: "Tools", icon: Wrench },
  { href: "/settings", label: "Settings", icon: Settings },
];

function getMachineIcon(os: string) {
  if (os === "darwin") return Laptop;
  if (os === "linux") return Server;
  return Monitor;
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const selectedMachine = searchParams.get("machine_id");

  useEffect(() => {
    fetch("/api/machines")
      .then((r) => r.json())
      .then((data) => setMachines(data.machines || []))
      .catch(() => {});
  }, []);

  const setMachineFilter = (machineId: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (machineId) {
      params.set("machine_id", machineId);
    } else {
      params.delete("machine_id");
    }
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-border bg-card">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <Terminal className="h-5 w-5 text-primary" />
        <span className="text-sm font-semibold tracking-tight text-foreground">
          Dev Tracker
        </span>
      </div>

      {machines.length > 0 && (
        <div className="border-b border-border px-3 py-3">
          <select
            value={selectedMachine || ""}
            onChange={(e) => setMachineFilter(e.target.value || null)}
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-xs text-foreground"
          >
            <option value="">All Machines</option>
            {machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label || m.hostname}
              </option>
            ))}
          </select>
        </div>
      )}

      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          const href = selectedMachine
            ? `${item.href}?machine_id=${selectedMachine}`
            : item.href;
          return (
            <Link
              key={item.href}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-muted-foreground">v0.2.0</p>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/sidebar.tsx
git commit -m "feat: add machine selector dropdown to sidebar"
```

---

### Task 10: Machines Settings Page

**Files:**
- Create: `src/app/settings/machines/page.tsx`
- Modify: `src/app/settings/page.tsx`

- [ ] **Step 1: Create machines settings page**

```typescript
"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Laptop, Server, Monitor, Trash2, Pencil, Check, X } from "lucide-react";

interface MachineRow {
  id: string;
  hostname: string;
  os: string;
  label: string | null;
  architecture: string | null;
  first_seen_at: string;
  last_seen_at: string;
  session_count: number;
  total_cost_usd: number;
}

function getMachineIcon(os: string) {
  if (os === "darwin") return Laptop;
  if (os === "linux") return Server;
  return Monitor;
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

export default function MachinesPage() {
  const [machines, setMachines] = useState<MachineRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [apiKey, setApiKey] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/machines")
      .then((r) => r.json())
      .then((data) => {
        setMachines(data.machines || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch("/api/machines/key")
      .then((r) => r.json())
      .then((data) => setApiKey(data.key || null))
      .catch(() => {});
  }, []);

  const startEdit = (machine: MachineRow) => {
    setEditingId(machine.id);
    setEditLabel(machine.label || machine.hostname);
  };

  const saveLabel = async (id: string) => {
    await fetch(`/api/machines/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel }),
    });
    setMachines((prev) =>
      prev.map((m) => (m.id === id ? { ...m, label: editLabel } : m)),
    );
    setEditingId(null);
  };

  const deleteMachine = async (id: string) => {
    if (!confirm("Remove this machine? Its sessions will be kept but unlinked.")) return;
    await fetch(`/api/machines/${id}`, { method: "DELETE" });
    setMachines((prev) => prev.filter((m) => m.id !== id));
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Machines</h1>

      {/* Setup instructions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm">Add a Machine</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Run this on any machine to start sending session data here:
          </p>
          <pre className="bg-muted/50 rounded-md p-3 text-xs font-mono overflow-x-auto">
            {`npx dev-tracker setup --server ${typeof window !== "undefined" ? window.location.origin : "http://localhost:3020"} --key ${apiKey || "<api-key>"}`}
          </pre>
        </CardContent>
      </Card>

      {/* Machine list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            Registered Machines ({machines.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading...</p>
          ) : machines.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No machines registered yet. Run the setup command above on a machine to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {machines.map((machine) => {
                const Icon = getMachineIcon(machine.os);
                return (
                  <div
                    key={machine.id}
                    className="flex items-center justify-between rounded-md border border-border p-3"
                  >
                    <div className="flex items-center gap-3">
                      <Icon className="h-5 w-5 text-muted-foreground" />
                      <div>
                        {editingId === machine.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editLabel}
                              onChange={(e) => setEditLabel(e.target.value)}
                              className="h-7 w-48 text-sm"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveLabel(machine.id);
                                if (e.key === "Escape") setEditingId(null);
                              }}
                            />
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => saveLabel(machine.id)}
                            >
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 w-7 p-0"
                              onClick={() => setEditingId(null)}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">
                              {machine.label || machine.hostname}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={() => startEdit(machine)}
                            >
                              <Pencil className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-xs text-muted-foreground font-mono">
                            {machine.id}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            {machine.os}
                          </Badge>
                          {machine.architecture && (
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {machine.architecture}
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Sessions</p>
                        <p className="text-sm font-medium">{machine.session_count}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Cost</p>
                        <p className="text-sm font-medium">
                          ${machine.total_cost_usd.toFixed(2)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Last seen</p>
                        <p className="text-sm">{timeAgo(machine.last_seen_at)}</p>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-destructive"
                        onClick={() => deleteMachine(machine.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Create API key endpoint**

Create `src/app/api/machines/key/route.ts`:

```typescript
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
```

- [ ] **Step 3: Add link from settings page to machines page**

In `src/app/settings/page.tsx`, add a new Card between the Hook Configuration card and the Data Export card:

```typescript
{/* Machines */}
<Card className="mb-6">
  <CardHeader>
    <CardTitle className="text-sm">Multi-Machine Tracking</CardTitle>
  </CardHeader>
  <CardContent className="space-y-3">
    <p className="text-sm text-muted-foreground">
      Track Claude Code usage across multiple machines. Configure remote machines to push session data here.
    </p>
    <a href="/settings/machines">
      <Button variant="outline" size="sm">Manage Machines</Button>
    </a>
  </CardContent>
</Card>
```

- [ ] **Step 4: Commit**

```bash
git add src/app/settings/machines/ src/app/api/machines/key/ src/app/settings/page.tsx
git commit -m "feat: add machines settings page and API key endpoint"
```

---

### Task 11: CLI — Entry Point & Setup Command

**Files:**
- Create: `src/cli/index.ts`
- Create: `src/cli/setup.ts`

- [ ] **Step 1: Install commander dependency**

```bash
npm install commander
```

- [ ] **Step 2: Create CLI entry point**

`src/cli/index.ts`:

```typescript
#!/usr/bin/env node

import { Command } from "commander";
import { setupCommand } from "./setup";
import { hookSessionEnd } from "./hook-session-end";

const program = new Command();

program
  .name("dev-tracker")
  .description("Multi-machine Claude Code usage tracker")
  .version("0.2.0");

program
  .command("setup")
  .description("Configure this machine to send session data to a dev-tracker server")
  .requiredOption("--server <url>", "Server URL (e.g., http://192.168.1.10:3020)")
  .requiredOption("--key <key>", "API key from the server")
  .option("--label <label>", "Human-readable label for this machine")
  .action(setupCommand);

program
  .command("hook")
  .description("Hook handlers (called by Claude Code, not directly)")
  .command("session-end")
  .description("Process session-end hook data from stdin")
  .action(hookSessionEnd);

program
  .command("start")
  .description("Start the dev-tracker server")
  .option("--port <port>", "Port to listen on", "3020")
  .action(async (opts) => {
    process.env.PORT = opts.port;
    // Dynamic import to avoid loading Next.js for CLI-only commands
    const { execSync } = await import("child_process");
    const path = await import("path");
    const serverDir = path.resolve(__dirname, "..");
    execSync(`node ${path.join(serverDir, ".next/standalone/server.js")}`, {
      stdio: "inherit",
      env: { ...process.env, PORT: opts.port, HOSTNAME: "0.0.0.0" },
      cwd: serverDir,
    });
  });

program
  .command("import")
  .description("Import historical sessions from ~/.claude/projects/")
  .option("--server <url>", "Remote server URL (omit for local import)")
  .option("--key <key>", "API key for remote server")
  .action(async (opts) => {
    if (opts.server) {
      console.log("Remote import not yet implemented — use local import for now.");
      process.exit(1);
    }
    const { execSync } = await import("child_process");
    execSync("npx tsx src/scripts/import.ts", { stdio: "inherit", cwd: process.cwd() });
  });

program.parse();
```

- [ ] **Step 3: Create setup command**

`src/cli/setup.ts`:

```typescript
import fs from "fs";
import path from "path";
import os from "os";
import crypto from "crypto";

interface DevTrackerConfig {
  server_url: string;
  api_key: string;
  machine_id: string;
  label: string;
}

const CONFIG_DIR = path.join(os.homedir(), ".dev-tracker");
const CONFIG_PATH = path.join(CONFIG_DIR, "config.json");
const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");

export async function setupCommand(opts: {
  server: string;
  key: string;
  label?: string;
}) {
  const hostname = os.hostname().toLowerCase().replace(/\.local$/, "");
  const suffix = crypto.randomBytes(2).toString("hex");
  const machineId = `${hostname}-${suffix}`;
  const label = opts.label || `${hostname} (${os.platform()})`;

  // 1. Write config
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const config: DevTrackerConfig = {
    server_url: opts.server.replace(/\/$/, ""),
    api_key: opts.key,
    machine_id: machineId,
    label,
  };
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  console.log(`Config written to ${CONFIG_PATH}`);

  // 2. Create queue directory
  fs.mkdirSync(path.join(CONFIG_DIR, "queue"), { recursive: true });

  // 3. Install Claude Code stop hook
  let claudeSettings: Record<string, unknown> = {};
  if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
    claudeSettings = JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"));
  }

  const hooks = (claudeSettings.hooks as Record<string, unknown[]>) || {};
  const stopHooks = (hooks.Stop as Array<Record<string, unknown>>) || [];

  // Remove existing dev-tracker hook if present
  const filtered = stopHooks.filter(
    (h) => typeof h.command === "string" && !h.command.includes("dev-tracker"),
  );

  // Add new hook
  filtered.push({
    type: "command",
    command: "npx dev-tracker hook session-end",
    timeout: 30,
  });

  hooks.Stop = filtered;
  claudeSettings.hooks = hooks;

  // Ensure .claude directory exists
  fs.mkdirSync(path.dirname(CLAUDE_SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(claudeSettings, null, 2));
  console.log(`Stop hook installed in ${CLAUDE_SETTINGS_PATH}`);

  // 4. Test connection
  console.log(`\nTesting connection to ${opts.server}...`);
  try {
    const res = await fetch(`${opts.server}/api/machines`, {
      headers: { "x-api-key": opts.key },
    });
    if (res.ok) {
      console.log("Connection successful!");
    } else {
      console.warn(`Warning: Server returned ${res.status}. Check your server URL and API key.`);
    }
  } catch {
    console.warn("Warning: Could not connect to server. Make sure it's running.");
  }

  console.log(`\nSetup complete!`);
  console.log(`  Machine ID: ${machineId}`);
  console.log(`  Label: ${label}`);
  console.log(`  Server: ${opts.server}`);
  console.log(`\nSession data will be sent to the server when Claude Code sessions end.`);
}
```

- [ ] **Step 4: Commit**

```bash
git add src/cli/index.ts src/cli/setup.ts package.json
git commit -m "feat: add CLI entry point and setup command"
```

---

### Task 12: CLI — Hook Session-End Handler

**Files:**
- Create: `src/cli/hook-session-end.ts`
- Create: `src/cli/queue.ts`

- [ ] **Step 1: Create offline queue manager**

`src/cli/queue.ts`:

```typescript
import fs from "fs";
import path from "path";
import os from "os";

const QUEUE_DIR = path.join(os.homedir(), ".dev-tracker", "queue");

export function queuePayload(sessionId: string, payload: unknown): void {
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
  const filePath = path.join(QUEUE_DIR, `${sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload));
}

export function getQueuedPayloads(): Array<{ path: string; payload: unknown }> {
  if (!fs.existsSync(QUEUE_DIR)) return [];
  const files = fs.readdirSync(QUEUE_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const filePath = path.join(QUEUE_DIR, f);
    return {
      path: filePath,
      payload: JSON.parse(fs.readFileSync(filePath, "utf-8")),
    };
  });
}

export function removeQueuedPayload(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // already removed
  }
}
```

- [ ] **Step 2: Create hook session-end handler**

`src/cli/hook-session-end.ts`:

```typescript
import fs from "fs";
import path from "path";
import os from "os";
import { queuePayload, getQueuedPayloads, removeQueuedPayload } from "./queue";

const CONFIG_PATH = path.join(os.homedir(), ".dev-tracker", "config.json");
const LOG_PATH = path.join(os.homedir(), ".dev-tracker", "hook.log");

interface HookStdin {
  session_id: string;
  transcript_path: string;
  cwd: string;
  [key: string]: unknown;
}

interface Config {
  server_url: string;
  api_key: string;
  machine_id: string;
  label: string;
}

function log(message: string): void {
  const entry = `[${new Date().toISOString()}] ${message}\n`;
  try {
    fs.appendFileSync(LOG_PATH, entry);
    // Keep last 100 lines
    const lines = fs.readFileSync(LOG_PATH, "utf-8").split("\n");
    if (lines.length > 100) {
      fs.writeFileSync(LOG_PATH, lines.slice(-100).join("\n"));
    }
  } catch {
    // logging failure is non-fatal
  }
}

async function sendPayload(
  serverUrl: string,
  apiKey: string,
  payload: unknown,
): Promise<boolean> {
  try {
    const res = await fetch(`${serverUrl}/api/ingest/session`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
      },
      body: JSON.stringify(payload),
    });
    if (res.status === 409) return true; // already exists = success
    return res.ok;
  } catch {
    return false;
  }
}

export async function hookSessionEnd(): Promise<void> {
  try {
    // Read config
    if (!fs.existsSync(CONFIG_PATH)) {
      log("ERROR: No config found. Run 'dev-tracker setup' first.");
      process.exit(1);
    }
    const config: Config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

    // Flush queued payloads first
    const queued = getQueuedPayloads();
    for (const item of queued) {
      const sent = await sendPayload(config.server_url, config.api_key, item.payload);
      if (sent) {
        removeQueuedPayload(item.path);
        log(`Flushed queued session: ${path.basename(item.path, ".json")}`);
      }
    }

    // Read stdin (Claude Code passes hook data as JSON)
    const stdinData = fs.readFileSync(0, "utf-8");
    const hookData: HookStdin = JSON.parse(stdinData);

    if (!hookData.transcript_path || !hookData.session_id) {
      log("ERROR: Missing transcript_path or session_id in hook data");
      process.exit(0); // exit 0 — data can't be recovered
    }

    // Read and parse JSONL transcript
    // We import the parser dynamically to reuse the same logic as the server
    const { parseJsonlFile } = await import("../lib/jsonl-parser");
    const parsed = await parseJsonlFile(hookData.transcript_path, hookData.session_id);

    if (!parsed || parsed.turns.length === 0) {
      log(`WARN: No turns parsed for session ${hookData.session_id}`);
      process.exit(0);
    }

    // Build the ingest payload
    const payload = {
      machine_id: config.machine_id,
      machine_meta: {
        hostname: os.hostname(),
        os: os.platform(),
        architecture: os.arch(),
      },
      session: {
        id: parsed.id,
        cwd: parsed.cwd,
        git_branch: parsed.git_branch,
        version: parsed.version,
        started_at: parsed.started_at,
        ended_at: parsed.ended_at,
        is_agent_session: parsed.is_agent_session,
        slug: parsed.slug,
        stop_reason: parsed.stop_reason,
        parent_session_id: parsed.parent_session_id,
        agent_name: parsed.agent_name,
        total_web_searches: parsed.total_web_searches,
        total_web_fetches: parsed.total_web_fetches,
        coding_active_ms: parsed.coding_active_ms,
        coding_idle_ms: parsed.coding_idle_ms,
        turns: parsed.turns.map((t) => ({
          turn_index: t.turn_index,
          prompt_text: t.prompt_text,
          response_text: t.response_text,
          prompt_timestamp: t.prompt_timestamp,
          response_timestamp: t.response_timestamp,
          duration_ms: t.duration_ms,
          actual_duration_ms: t.actual_duration_ms,
          input_tokens: t.input_tokens,
          output_tokens: t.output_tokens,
          cache_creation_tokens: t.cache_creation_tokens,
          cache_read_tokens: t.cache_read_tokens,
          cache_5m_tokens: t.cache_5m_tokens,
          cache_1h_tokens: t.cache_1h_tokens,
          model: t.model,
          service_tier: t.service_tier,
          inference_speed: t.inference_speed,
          stop_reason: t.stop_reason,
          has_thinking: t.has_thinking,
          message_count: t.message_count,
          tool_use_count: t.tool_uses.length,
          web_search_requests: t.web_search_requests,
          web_fetch_requests: t.web_fetch_requests,
          equivalent_cost_usd: 0, // server recalculates
          tool_uses: t.tool_uses.map((tu) => ({
            tool_name: tu.tool_name,
            tool_category: "",
            input_summary: tu.input_summary,
            is_error: tu.is_error,
            timestamp: tu.timestamp,
          })),
        })),
        file_changes: parsed.file_changes,
        hook_executions: parsed.hook_executions,
        compact_events: parsed.compact_events,
      },
    };

    // Send to server
    const sent = await sendPayload(config.server_url, config.api_key, payload);

    if (sent) {
      log(`Session ${hookData.session_id} sent successfully`);
    } else {
      // Queue for later
      queuePayload(hookData.session_id, payload);
      log(`Session ${hookData.session_id} queued (server unreachable)`);
    }

    process.exit(0);
  } catch (err) {
    log(`ERROR: ${(err as Error).message}`);
    process.exit(0); // exit 0 so Claude Code doesn't report hook failure
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/cli/hook-session-end.ts src/cli/queue.ts
git commit -m "feat: add hook session-end handler with offline queue"
```

---

### Task 13: Package.json — Bin Entry & Scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Add bin entry and commander dependency**

Add to `package.json`:

```json
{
  "bin": {
    "dev-tracker": "./bin/cli.js"
  }
}
```

Add `commander` to dependencies (already installed in Task 11).

- [ ] **Step 2: Create bin/cli.js entry point**

Create `bin/cli.js`:

```javascript
#!/usr/bin/env node
require("tsx/cjs");
require("../src/cli/index.ts");
```

- [ ] **Step 3: Add tsx as a dependency**

```bash
npm install tsx
```

- [ ] **Step 4: Commit**

```bash
git add bin/cli.js package.json package-lock.json
git commit -m "feat: add npm bin entry point for dev-tracker CLI"
```

---

### Task 14: Next.js Standalone Output & Docker

**Files:**
- Modify: `next.config.ts`
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: Enable standalone output**

In `next.config.ts`, add `output: 'standalone'`:

```typescript
const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["better-sqlite3"],
};
```

- [ ] **Step 2: Create Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3

ENV PORT=3020
ENV HOSTNAME=0.0.0.0
EXPOSE 3020
VOLUME ["/app/data"]

CMD ["node", "server.js"]
```

- [ ] **Step 3: Create docker-compose.yml**

```yaml
services:
  dev-tracker:
    build: .
    ports:
      - "3020:3020"
    volumes:
      - dev-tracker-data:/app/data
    environment:
      - DB_PATH=/app/data/dev-tracker.db
    restart: unless-stopped

volumes:
  dev-tracker-data:
```

- [ ] **Step 4: Verify build works**

```bash
npm run build
```

Expected: Build succeeds with standalone output in `.next/standalone/`.

- [ ] **Step 5: Commit**

```bash
git add next.config.ts Dockerfile docker-compose.yml
git commit -m "feat: add Docker support and standalone build output"
```

---

### Task 15: Update .gitignore & Documentation

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add CLI config files to .gitignore**

Ensure `.gitignore` includes:

```
# Dev tracker local data
data/
.dev-tracker/
```

- [ ] **Step 2: Update package.json version**

Bump version from `0.1.0` to `0.2.0`.

- [ ] **Step 3: Update CLAUDE.md with new architecture info**

Add to the Architecture section of `CLAUDE.md`:

```markdown
- `src/cli/` — CLI commands (setup, hook, start, import)
- `src/lib/auth.ts` — API key validation and machine management
- `src/app/api/ingest/session/` — Unified remote session ingest endpoint
- `src/app/api/machines/` — Machine management CRUD endpoints
```

- [ ] **Step 4: Commit**

```bash
git add .gitignore package.json CLAUDE.md
git commit -m "chore: update gitignore, version bump to 0.2.0, update docs"
```

---

## Execution Checklist

| Task | Description | Depends On |
|------|-------------|------------|
| 1 | DB schema — machines table + session column | — |
| 2 | TypeScript types | — |
| 3 | Auth middleware | 1 |
| 4 | Unified remote ingest endpoint | 1, 2, 3, 5 |
| 5 | Aggregator — machine daily stats | 1 |
| 6 | Auth on existing ingest endpoints | 3 |
| 7 | Machine management API | 1, 2 |
| 8 | Machine filter on query endpoints | 1, 2 |
| 9 | Sidebar machine selector | 7 |
| 10 | Machines settings page | 7 |
| 11 | CLI entry point & setup command | — |
| 12 | CLI hook session-end handler | 11 |
| 13 | Package.json bin entry | 11 |
| 14 | Docker & standalone build | — |
| 15 | Gitignore, version, docs | all |
