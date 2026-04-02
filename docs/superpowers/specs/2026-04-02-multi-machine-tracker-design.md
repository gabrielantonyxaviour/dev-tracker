# Multi-Machine Dev Tracker — Design Spec

**Date:** 2026-04-02
**Status:** Draft
**Scope:** Extend dev-tracker to collect and unify Claude Code usage data across multiple machines

## Problem

Dev-tracker currently runs on a single machine with a local SQLite database. Developers who use Claude Code across multiple machines (e.g., work Mac, personal Mac, Linux homelab) have fragmented usage data with no unified view.

## Solution

An open-source, self-hosted multi-machine usage tracker. One machine runs the server (Next.js + SQLite). Other machines push session data via Claude Code stop hooks. A setup CLI configures each machine in one command.

**Business model:** Open-source core (self-hosted). Paid hosted tier planned for later — users who don't want to run a server pay for managed infrastructure.

## Architecture

```
Machine A (Mac)                Machine B (Mac)
  Claude Code session ends       Claude Code session ends
  → Stop hook fires              → Stop hook fires
  → Reads JSONL transcript       → Reads JSONL transcript
  → Parses locally               → Parses locally
  → POST /api/ingest/session     → POST /api/ingest/session
       ↘                              ↙
        Server Machine (Linux, always-on)
          Next.js + SQLite
          Serves dashboard UI
          Accessible via Cloudflare Tunnel / Tailscale / LAN
```

### Components

1. **Server** — The existing dev-tracker Next.js app, extended with auth and machine tracking. Runs on one machine. Stores all data in local SQLite.

2. **Hook script** — A bundled script installed on each machine. Fires on Claude Code session end. Reads the JSONL transcript from the local filesystem, parses it into a structured payload, and POSTs it to the server.

3. **Setup CLI** — `dev-tracker setup` command that configures a machine as a client: generates machine ID, writes config, installs the stop hook into Claude Code settings.

### Deployment Options

Users choose how to run the server:

- **Docker:** `docker run -d -p 3020:3020 -v dev-tracker-data:/app/data ghcr.io/dev-tracker/dev-tracker`
- **npm:** `npm install -g @anthropic-community/dev-tracker && dev-tracker start`

Note: npm package name and GitHub org are placeholders — finalize before first publish. Check availability of `dev-tracker` on npm and `dev-tracker` GitHub org.

Both run the identical Next.js standalone app.

## Data Model

### New table: `machines`

```sql
CREATE TABLE machines (
  id TEXT PRIMARY KEY,              -- "gabriels-mbp-a3f2"
  hostname TEXT NOT NULL,
  os TEXT NOT NULL,                  -- "darwin" | "linux" | "win32"
  label TEXT,                        -- user-editable: "Work Mac", "Home Linux"
  architecture TEXT,                 -- "arm64" | "x64"
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### Modified table: `sessions`

Add one column:

```sql
ALTER TABLE sessions ADD COLUMN machine_id TEXT REFERENCES machines(id);
```

Nullable — existing/legacy sessions have `machine_id = NULL` (treated as "local/unknown").

### New table: `machine_daily_stats`

```sql
CREATE TABLE machine_daily_stats (
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
```

### Indexes

```sql
CREATE INDEX idx_sessions_machine ON sessions(machine_id);
CREATE INDEX idx_machine_daily_stats_date ON machine_daily_stats(date);
```

## Authentication

### API Key

- **Single shared key** for v1. No per-machine keys, no user accounts.
- On first server start, if no key exists, auto-generate a 32-byte hex key and print it to stdout. Store in `settings` table (key: `api_key`).
- Alternatively, set via `DEV_TRACKER_API_KEY` env var (takes precedence over DB).
- All `/api/ingest/*` endpoints require `X-API-Key` header.
- Dashboard/query endpoints (GET) are unauthenticated by default. Enable `REQUIRE_DASHBOARD_AUTH=true` env var to protect reads.
- Invalid or missing key returns `401 Unauthorized`.

### Machine Registration

- Machines self-register on first ingest request. The server creates the `machines` row from the payload metadata.
- No explicit registration step — the setup CLI only configures the client. The server learns about machines when they first report.
- `last_seen_at` updated on every ingest request from that machine.

## API Contract

### POST `/api/ingest/session` (new unified endpoint)

Replaces the current `session-end` for remote ingestion. The current `session-end` endpoint continues to work for local/legacy mode.

```typescript
// Request
{
  machine_id: string;           // "gabriels-mbp-a3f2"
  machine_meta: {               // sent on every request, server upserts
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
    turns: Array<{
      turn_index: number;
      prompt_text: string;
      response_text: string;
      prompt_timestamp: string;
      response_timestamp: string;
      duration_ms: number;
      actual_duration_ms: number;
      input_tokens: number;
      output_tokens: number;
      cache_creation_tokens: number;
      cache_read_tokens: number;
      cache_5m_tokens: number;
      cache_1h_tokens: number;
      model: string;
      service_tier: string;
      inference_speed: string;
      stop_reason: string | null;
      has_thinking: boolean;
      message_count: number;
      tool_use_count: number;
      web_search_requests: number;
      web_fetch_requests: number;
      equivalent_cost_usd: number;
      tool_uses: Array<{
        tool_name: string;
        tool_category: string;
        input_summary: string;
        is_error: boolean;
        timestamp: string;
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
    }>;
  };
}

// Response: 200
{ ok: true, session_id: string }

// Response: 401
{ error: "Unauthorized" }

// Response: 409
{ error: "Session already exists", session_id: string }
```

### Other ingest endpoints

`/api/ingest/prompt-start`, `/api/ingest/tool-use`, `/api/ingest/heartbeat`, `/api/ingest/event` — all gain:

- `X-API-Key` header (required)
- `machine_id` field in body (required)

Backward compatibility: if `machine_id` is missing and the request comes from localhost, treat as local machine (null machine_id). This preserves the existing hook scripts during migration.

### Query endpoints

All existing GET endpoints gain an optional `?machine_id=<id>` query parameter to filter by machine. Omitting it returns data from all machines (current behavior).

New endpoint:

- `GET /api/machines` — list all registered machines with last-seen times
- `PATCH /api/machines/:id` — update machine label
- `DELETE /api/machines/:id` — remove machine and optionally its sessions

## Setup CLI

### `dev-tracker setup`

Run on each client machine to configure it:

```bash
dev-tracker setup --server https://my-server:3020 --key abc123def456
```

**What it does:**

1. Generates `machine_id`: `<hostname>-<4-char-random-hex>` (e.g., `gabriels-mbp-a3f2`)
2. Prompts for a human label (e.g., "Work Mac") — or accepts `--label` flag
3. Writes `~/.dev-tracker/config.json`:
   ```json
   {
     "server_url": "https://my-server:3020",
     "api_key": "abc123def456",
     "machine_id": "gabriels-mbp-a3f2",
     "label": "Work Mac"
   }
   ```
4. Installs a Stop hook in `~/.claude/settings.json`:
   ```json
   {
     "hooks": {
       "Stop": [
         {
           "type": "command",
           "command": "dev-tracker hook session-end",
           "timeout": 30
         }
       ]
     }
   }
   ```
   - If existing Stop hooks are present, appends to the array (does not overwrite)
   - If an existing dev-tracker hook is found, updates it in place

5. Prints confirmation: machine ID, server URL, hook installed.

### `dev-tracker hook session-end`

The hook script invoked by Claude Code on session end:

1. Reads JSON from stdin (receives `session_id`, `transcript_path`, `cwd`, etc.)
2. Reads `~/.dev-tracker/config.json` for server URL, API key, machine ID
3. Reads the JSONL file at `transcript_path`
4. Parses it using the same logic as `jsonl-parser.ts` (ported to a standalone Node script or embedded in the CLI)
5. POSTs the parsed payload to `{server_url}/api/ingest/session`
6. Logs success/failure to `~/.dev-tracker/hook.log` (last 100 entries, rotated)
7. Exits 0 on success or successful queue (data is safe). Exits 1 only on unrecoverable errors (e.g., can't read transcript file, can't write to queue directory)

**Offline resilience:** If the server is unreachable, save the payload to `~/.dev-tracker/queue/` as a JSON file. On the next successful hook run, flush any queued payloads first (FIFO). This prevents data loss when the server is temporarily down.

### `dev-tracker start`

Starts the server:

```bash
dev-tracker start              # port 3020 (default)
dev-tracker start --port 8080  # custom port
```

Internally runs the Next.js standalone server with the appropriate env vars.

### `dev-tracker import`

Batch import historical sessions from `~/.claude/projects/`:

```bash
dev-tracker import                          # import to local server
dev-tracker import --server <url> --key <k> # import to remote server
```

When importing to a remote server, sessions are tagged with the current machine's `machine_id`.

## Hook Script Architecture

The hook script is a Node.js script bundled with the CLI package. It must be fast (< 30 seconds, the hook timeout).

```
Claude Code Stop event
  → stdin JSON: { session_id, transcript_path, cwd, ... }
  → dev-tracker hook session-end
    → read ~/.dev-tracker/config.json
    → flush any queued payloads from ~/.dev-tracker/queue/
    → read & parse transcript_path JSONL
    → calculate costs per turn
    → POST to server_url/api/ingest/session
    → on network failure: save to ~/.dev-tracker/queue/<session_id>.json
    → exit 0
```

**Parser reuse:** The JSONL parsing logic in `src/lib/jsonl-parser.ts` is extracted into a shared module that both the server-side ingestion and the CLI hook script can import. No duplication.

## Dashboard Changes

### Machine Selector

- Top-level filter in the sidebar: dropdown showing "All Machines" + each registered machine by label
- Persisted in URL query param `?machine=<id>` for shareability
- All dashboard pages, session lists, project views, and stat endpoints respect this filter

### Session Cards

- Small badge on each session card showing machine label (color-coded per machine)
- Machine icon: laptop for macOS, terminal/server for Linux, desktop for Windows

### Machines Settings Page

New page at `/settings/machines`:

- List of all registered machines: label, hostname, OS, architecture, first seen, last seen, session count
- Edit label inline
- Delete machine (with confirmation — warns that sessions will be orphaned, not deleted)
- Show the setup command for adding new machines (with the server's URL and API key pre-filled)

### Stats Pages

- Activity, costs, tokens pages gain machine breakdown charts
- Machine comparison view: side-by-side usage across machines

## Packaging

### npm Package

```json
{
  "name": "dev-tracker",
  "bin": {
    "dev-tracker": "./bin/cli.js"
  }
}
```

CLI entry point (`bin/cli.js`) handles subcommands:
- `start` — launch Next.js standalone server
- `setup` — configure client machine
- `hook` — run hook scripts (called by Claude Code, not by users directly)
- `import` — batch import historical data

**Install:** `npm install -g dev-tracker`

**Native dependency:** `better-sqlite3` compiles on install via node-gyp. Requires Node 18+ and a C++ compiler (pre-installed on macOS, `build-essential` on Linux). This is standard for SQLite-based Node tools.

### Docker Image

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN apk add --no-cache python3 make g++ && npm ci
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

**Published to:** GitHub Container Registry (org TBD — same as npm package)

### GitHub Releases

CLI binary published as npm package and as GitHub release assets. Docker image pushed on every tagged release.

## Project Structure Changes

```
src/
  app/
    api/
      ingest/
        session/route.ts        # NEW — unified ingest endpoint
        session-end/route.ts    # EXISTING — kept for backward compat
        prompt-start/route.ts   # MODIFIED — add auth + machine_id
        tool-use/route.ts       # MODIFIED — add auth + machine_id
        heartbeat/route.ts      # MODIFIED — add auth + machine_id
        event/route.ts          # MODIFIED — add auth + machine_id
      machines/
        route.ts                # NEW — list machines
        [id]/route.ts           # NEW — update/delete machine
    settings/
      machines/
        page.tsx                # NEW — machines management UI
  lib/
    auth.ts                     # NEW — API key validation middleware
    db.ts                       # MODIFIED — add machines table, machine_daily_stats
    jsonl-parser.ts             # EXISTING — refactored to be importable by CLI
    types.ts                    # MODIFIED — add Machine types, extend Session type
  cli/
    index.ts                    # NEW — CLI entry point (start, setup, hook, import)
    setup.ts                    # NEW — machine setup logic
    hook-session-end.ts         # NEW — stop hook handler
    queue.ts                    # NEW — offline queue management
bin/
  cli.js                        # NEW — npm bin entry point
Dockerfile                      # NEW
docker-compose.yml              # NEW — optional, for easy server setup
```

## Migration Path

For existing single-machine users upgrading:

1. Existing sessions get `machine_id = NULL` (displayed as "Local" in the UI)
2. Run `dev-tracker setup --server localhost:3020 --key <key>` to configure the local machine
3. Future sessions from that machine get a proper `machine_id`
4. Optional: batch-update old sessions to assign them to the local machine via a migration command

## Out of Scope (v1)

- **Paid hosted tier** — designed for but not built. The API contract supports it; the multi-tenant infra comes later.
- **Real-time streaming** — only session-end hook for v1. Live updates (prompt-start, tool-use, heartbeat) across machines can be added later.
- **Per-machine API keys** — single shared key for v1.
- **End-to-end encryption** — data is sent over HTTPS (via tunnel). No additional encryption layer.
- **Windows support** — technically works but untested. macOS and Linux are primary targets.
- **Web-based setup wizard** — setup is CLI-only for v1.
