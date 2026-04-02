import Database from "better-sqlite3";
import { readdirSync, statSync, existsSync } from "fs";
import path from "path";
import { v4 as uuid } from "uuid";
import { parseJsonlFile } from "../lib/jsonl-parser";
import { calculateCost } from "../lib/cost-calculator";
import {
  getToolCategory,
  categorizeProject,
  deriveDisplayName,
} from "../lib/constants";
import { rebuildAllAggregates } from "../lib/aggregator";

const DB_PATH =
  process.env.DB_PATH || path.join(process.cwd(), "data", "dev-tracker.db");
const CLAUDE_PROJECTS_DIR =
  process.env.CLAUDE_PROJECTS_DIR ||
  path.join(process.env.HOME || "", ".claude", "projects");

function initDb(): Database.Database {
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
  db.pragma("foreign_keys = ON");

  // Create schema (same as db.ts but standalone for the script)
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY, path TEXT NOT NULL UNIQUE, encoded_path TEXT NOT NULL,
      display_name TEXT NOT NULL, category TEXT, first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL, total_sessions INTEGER DEFAULT 0,
      total_tokens_in INTEGER DEFAULT 0, total_tokens_out INTEGER DEFAULT 0,
      total_cost_usd REAL DEFAULT 0.0, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
      jsonl_path TEXT, git_branch TEXT, title TEXT, started_at TEXT NOT NULL,
      ended_at TEXT, duration_ms INTEGER, active_duration_ms INTEGER,
      prompt_count INTEGER DEFAULT 0, response_count INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0, total_output_tokens INTEGER DEFAULT 0,
      total_cache_creation_tokens INTEGER DEFAULT 0, total_cache_read_tokens INTEGER DEFAULT 0,
      equivalent_cost_usd REAL DEFAULT 0.0, primary_model TEXT,
      entrypoint TEXT DEFAULT 'cli', version TEXT, is_agent_session INTEGER DEFAULT 0,
      slug TEXT, stop_reason TEXT,
      total_web_searches INTEGER DEFAULT 0, total_web_fetches INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date(started_at));

    CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      turn_index INTEGER NOT NULL, prompt_text TEXT, prompt_timestamp TEXT NOT NULL,
      response_timestamp TEXT, duration_ms INTEGER, actual_duration_ms INTEGER,
      message_count INTEGER, model TEXT,
      input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0, cache_read_tokens INTEGER DEFAULT 0,
      stop_reason TEXT, has_thinking INTEGER DEFAULT 0, tool_use_count INTEGER DEFAULT 0,
      equivalent_cost_usd REAL DEFAULT 0.0,
      service_tier TEXT, inference_speed TEXT,
      cache_5m_tokens INTEGER DEFAULT 0, cache_1h_tokens INTEGER DEFAULT 0,
      web_search_requests INTEGER DEFAULT 0, web_fetch_requests INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, turn_index);

    CREATE TABLE IF NOT EXISTS tool_uses (
      id TEXT PRIMARY KEY, turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL, tool_category TEXT, input_summary TEXT,
      is_error INTEGER DEFAULT 0, timestamp TEXT, created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tool_uses_session ON tool_uses(session_id);
    CREATE INDEX IF NOT EXISTS idx_tool_uses_name ON tool_uses(tool_name);

    CREATE TABLE IF NOT EXISTS file_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL, change_type TEXT, timestamp TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_file_changes_session ON file_changes(session_id);

    CREATE TABLE IF NOT EXISTS hook_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      hook_command TEXT NOT NULL, duration_ms INTEGER,
      had_error INTEGER DEFAULT 0, error_message TEXT, timestamp TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_hook_executions_session ON hook_executions(session_id);

    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY, session_count INTEGER DEFAULT 0, prompt_count INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0, total_output_tokens INTEGER DEFAULT 0,
      total_cache_creation_tokens INTEGER DEFAULT 0, total_cache_read_tokens INTEGER DEFAULT 0,
      equivalent_cost_usd REAL DEFAULT 0.0, active_duration_ms INTEGER DEFAULT 0,
      wall_clock_duration_ms INTEGER DEFAULT 0, tools_used INTEGER DEFAULT 0,
      files_changed INTEGER DEFAULT 0, first_activity TEXT, last_activity TEXT,
      streak_day INTEGER DEFAULT 0, primary_project TEXT, primary_model TEXT
    );

    CREATE TABLE IF NOT EXISTS project_daily_stats (
      project_id TEXT NOT NULL REFERENCES projects(id), date TEXT NOT NULL,
      session_count INTEGER DEFAULT 0, prompt_count INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0, total_output_tokens INTEGER DEFAULT 0,
      equivalent_cost_usd REAL DEFAULT 0.0, active_duration_ms INTEGER DEFAULT 0,
      PRIMARY KEY (project_id, date)
    );

    CREATE TABLE IF NOT EXISTS model_daily_stats (
      model TEXT NOT NULL, date TEXT NOT NULL, request_count INTEGER DEFAULT 0,
      input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0, cache_read_tokens INTEGER DEFAULT 0,
      equivalent_cost_usd REAL DEFAULT 0.0, cache_hit_rate REAL DEFAULT 0.0,
      PRIMARY KEY (model, date)
    );

    CREATE TABLE IF NOT EXISTS import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT, started_at TEXT NOT NULL,
      completed_at TEXT, files_processed INTEGER DEFAULT 0,
      files_total INTEGER DEFAULT 0, sessions_imported INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0, status TEXT DEFAULT 'running'
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY, value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);

  // Run migrations for existing databases
  migrateImportDb(db);

  return db;
}

function migrateImportDb(db: Database.Database) {
  function hasColumn(table: string, column: string): boolean {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
    }[];
    return cols.some((c) => c.name === column);
  }

  const sessionCols: [string, string][] = [
    ["slug", "TEXT"],
    ["stop_reason", "TEXT"],
    ["total_web_searches", "INTEGER DEFAULT 0"],
    ["total_web_fetches", "INTEGER DEFAULT 0"],
    ["parent_session_id", "TEXT"],
    ["agent_name", "TEXT"],
    ["compact_count", "INTEGER DEFAULT 0"],
    ["coding_active_ms", "INTEGER DEFAULT 0"],
    ["coding_idle_ms", "INTEGER DEFAULT 0"],
  ];
  for (const [col, def] of sessionCols) {
    if (!hasColumn("sessions", col)) {
      db.exec(`ALTER TABLE sessions ADD COLUMN ${col} ${def}`);
    }
  }

  const turnCols: [string, string][] = [
    ["actual_duration_ms", "INTEGER"],
    ["message_count", "INTEGER"],
    ["service_tier", "TEXT"],
    ["inference_speed", "TEXT"],
    ["cache_5m_tokens", "INTEGER DEFAULT 0"],
    ["cache_1h_tokens", "INTEGER DEFAULT 0"],
    ["web_search_requests", "INTEGER DEFAULT 0"],
    ["web_fetch_requests", "INTEGER DEFAULT 0"],
    ["response_text", "TEXT"],
  ];
  for (const [col, def] of turnCols) {
    if (!hasColumn("turns", col)) {
      db.exec(`ALTER TABLE turns ADD COLUMN ${col} ${def}`);
    }
  }

  // Compact events table
  db.exec(`
    CREATE TABLE IF NOT EXISTS compact_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      trigger TEXT,
      pre_tokens INTEGER,
      content_length INTEGER,
      timestamp TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_compact_session ON compact_events(session_id);
  `);
}

interface FoundFile {
  filePath: string;
  sessionId: string;
  dirPath: string;
  parentSessionId: string | null;
  agentName: string | null;
}

function findJsonlFiles(): FoundFile[] {
  const files: FoundFile[] = [];

  if (!existsSync(CLAUDE_PROJECTS_DIR)) {
    console.error(`Projects directory not found: ${CLAUDE_PROJECTS_DIR}`);
    return files;
  }

  const dirs = readdirSync(CLAUDE_PROJECTS_DIR);

  for (const dir of dirs) {
    const dirPath = path.join(CLAUDE_PROJECTS_DIR, dir);
    const stat = statSync(dirPath);
    if (!stat.isDirectory()) continue;

    const dirFiles = readdirSync(dirPath);
    for (const file of dirFiles) {
      const fullPath = path.join(dirPath, file);

      if (file.endsWith(".jsonl")) {
        // Top-level session JSONL
        const sessionId = file.replace(".jsonl", "");
        files.push({
          filePath: fullPath,
          sessionId,
          dirPath: dir,
          parentSessionId: null,
          agentName: null,
        });
      } else {
        try {
          if (!statSync(fullPath).isDirectory()) continue;
        } catch {
          continue;
        }
        // This is a {sessionId}/ directory — check for subagents/
        const subagentsDir = path.join(fullPath, "subagents");
        if (existsSync(subagentsDir)) {
          const parentSessionId = file; // directory name IS the parent session ID
          try {
            const subFiles = readdirSync(subagentsDir);
            for (const subFile of subFiles) {
              if (!subFile.endsWith(".jsonl")) continue;
              const agentSessionId = subFile.replace(".jsonl", "");
              // Extract agent name from filename pattern: agent-{id}.jsonl
              const agentNameMatch = subFile.match(/^(agent-[a-z0-9]+)/);
              const agentName = agentNameMatch ? agentNameMatch[1] : null;

              files.push({
                filePath: path.join(subagentsDir, subFile),
                sessionId: agentSessionId,
                dirPath: dir,
                parentSessionId,
                agentName,
              });
            }
          } catch {
            // Skip unreadable subagents directories
          }
        }
      }
    }
  }

  return files;
}

function getOrCreateProject(
  db: Database.Database,
  cwd: string,
  encodedPath: string,
  timestamp: string,
  projectCache: Map<string, string>,
): string {
  // Use CWD as project key, fall back to encoded path
  const key = cwd || encodedPath;

  if (projectCache.has(key)) return projectCache.get(key)!;

  // Check DB
  const existing = db
    .prepare(`SELECT id FROM projects WHERE path = ?`)
    .get(key) as { id: string } | undefined;

  if (existing) {
    projectCache.set(key, existing.id);
    return existing.id;
  }

  const id = uuid();
  const displayName = deriveDisplayName(key);
  const category = categorizeProject(key);

  db.prepare(
    `INSERT INTO projects (id, path, encoded_path, display_name, category, first_seen_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, key, encodedPath, displayName, category, timestamp, timestamp);

  projectCache.set(key, id);
  return id;
}

async function main() {
  console.log("=== Dev-Tracker Import ===\n");
  console.log(`DB: ${DB_PATH}`);
  console.log(`Source: ${CLAUDE_PROJECTS_DIR}\n`);

  const db = initDb();

  // Find all JSONL files
  console.log("Scanning for JSONL files...");
  const allFiles = findJsonlFiles();
  console.log(`Found ${allFiles.length} JSONL files\n`);

  // Check which sessions are already imported
  const existingSessions = new Set<string>();
  const rows = db.prepare(`SELECT id FROM sessions`).all() as { id: string }[];
  for (const row of rows) existingSessions.add(row.id);

  const newFiles = allFiles.filter((f) => !existingSessions.has(f.sessionId));
  // Sort: parent sessions first, then child (agent) sessions
  // This ensures parent_session_id FK references are valid on insert
  newFiles.sort((a, b) => {
    if (a.parentSessionId === null && b.parentSessionId !== null) return -1;
    if (a.parentSessionId !== null && b.parentSessionId === null) return 1;
    return 0;
  });
  const agentCount = newFiles.filter((f) => f.parentSessionId !== null).length;
  console.log(
    `${existingSessions.size} already imported, ${newFiles.length} new to import (${agentCount} agent sessions)\n`,
  );

  if (newFiles.length === 0) {
    console.log("Nothing to import. Running aggregation...");
    // Use the standalone db for aggregation
    process.env.DB_PATH = DB_PATH;
    rebuildAllAggregates();
    console.log("Done!");
    return;
  }

  // Create import run record
  const importRun = db
    .prepare(`INSERT INTO import_runs (started_at, files_total) VALUES (?, ?)`)
    .run(new Date().toISOString(), newFiles.length);
  const importRunId = importRun.lastInsertRowid;

  // Prepare statements
  const insertSession = db.prepare(`
    INSERT OR REPLACE INTO sessions (
      id, project_id, jsonl_path, git_branch, title, started_at, ended_at,
      duration_ms, active_duration_ms, prompt_count, response_count,
      total_input_tokens, total_output_tokens, total_cache_creation_tokens,
      total_cache_read_tokens, equivalent_cost_usd, primary_model,
      entrypoint, version, is_agent_session, slug, stop_reason,
      total_web_searches, total_web_fetches,
      parent_session_id, agent_name, compact_count, coding_active_ms, coding_idle_ms
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertTurn = db.prepare(`
    INSERT OR REPLACE INTO turns (
      id, session_id, turn_index, prompt_text, prompt_timestamp, response_timestamp,
      duration_ms, model, input_tokens, output_tokens, cache_creation_tokens,
      cache_read_tokens, stop_reason, has_thinking, tool_use_count, equivalent_cost_usd,
      actual_duration_ms, message_count, service_tier, inference_speed,
      cache_5m_tokens, cache_1h_tokens, web_search_requests, web_fetch_requests,
      response_text
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertHookExecution = db.prepare(`
    INSERT INTO hook_executions (session_id, hook_command, duration_ms, had_error, error_message, timestamp)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertCompactEvent = db.prepare(`
    INSERT INTO compact_events (session_id, trigger, pre_tokens, content_length, timestamp)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertToolUse = db.prepare(`
    INSERT OR REPLACE INTO tool_uses (
      id, turn_id, session_id, tool_name, tool_category, input_summary, is_error, timestamp
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFileChange = db.prepare(`
    INSERT INTO file_changes (session_id, file_path, change_type, timestamp)
    VALUES (?, ?, ?, ?)
  `);

  const projectCache = new Map<string, string>();
  let processed = 0;
  let imported = 0;
  let errors = 0;
  const startTime = Date.now();

  // Process in batches — parse async, insert sync
  const BATCH_SIZE = 50;

  for (let batch = 0; batch < newFiles.length; batch += BATCH_SIZE) {
    const batchFiles = newFiles.slice(batch, batch + BATCH_SIZE);

    // Phase 1: Parse all files in batch (async)
    const parsedBatch: {
      file: (typeof batchFiles)[0];
      parsed: Awaited<ReturnType<typeof parseJsonlFile>>;
    }[] = [];
    for (const file of batchFiles) {
      try {
        const parsed = await parseJsonlFile(file.filePath, file.sessionId);
        parsedBatch.push({ file, parsed });
      } catch (err) {
        errors++;
        processed++;
        if (errors <= 10) {
          console.error(
            `  Parse error ${file.sessionId}: ${(err as Error).message}`,
          );
        }
      }
    }

    // Phase 2: Insert all parsed results in a sync transaction
    const insertBatch = db.transaction(() => {
      for (const { file, parsed } of parsedBatch) {
        processed++;

        try {
          if (!parsed || parsed.turns.length === 0) {
            errors++;
            continue;
          }

          // Determine project
          const projectId = getOrCreateProject(
            db,
            parsed.cwd,
            file.dirPath,
            parsed.started_at,
            projectCache,
          );

          // Calculate session-level aggregates
          let totalInputTokens = 0;
          let totalOutputTokens = 0;
          let totalCacheCreate = 0;
          let totalCacheRead = 0;
          let activeDuration = 0;
          const modelCounts: Record<string, number> = {};

          for (const turn of parsed.turns) {
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
            Object.entries(modelCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ||
            null;

          const sessionCost = calculateCost({
            input_tokens: totalInputTokens,
            output_tokens: totalOutputTokens,
            cache_creation_tokens: totalCacheCreate,
            cache_read_tokens: totalCacheRead,
            model: primaryModel || "claude-sonnet-4-6",
          });

          const durationMs =
            new Date(parsed.ended_at).getTime() -
            new Date(parsed.started_at).getTime();

          // Generate title — try multiple sources
          let title: string | null = null;
          // 1. First real user prompt
          for (const turn of parsed.turns) {
            if (turn.prompt_text) {
              const clean = turn.prompt_text
                .replace(/<[^>]+>/g, "")
                .replace(/\s+/g, " ")
                .trim();
              if (
                clean.length > 5 &&
                !clean.startsWith("Base directory") &&
                !clean.startsWith("[Request interrupted")
              ) {
                title = clean.slice(0, 80);
                break;
              }
            }
          }
          // 2. Fall back to slug (human-readable)
          if (!title && parsed.slug) {
            title = parsed.slug.replace(/-/g, " ");
          }
          // 3. Fall back to timestamp-based
          if (!title) {
            const d = new Date(parsed.started_at);
            title = `Session ${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
          }

          // Calculate web totals
          let totalWebSearches = 0;
          let totalWebFetches = 0;
          for (const turn of parsed.turns) {
            totalWebSearches += turn.web_search_requests;
            totalWebFetches += turn.web_fetch_requests;
          }

          // Set agent lineage from directory structure
          const isAgent =
            parsed.is_agent_session || file.parentSessionId !== null;
          const parentSessionId = file.parentSessionId;
          const agentName = file.agentName || parsed.agent_name;

          // Insert session (29 params)
          insertSession.run(
            parsed.id,
            projectId,
            file.filePath,
            parsed.git_branch,
            title,
            parsed.started_at,
            parsed.ended_at,
            durationMs > 0 ? durationMs : null,
            activeDuration > 0 ? activeDuration : null,
            parsed.turns.length,
            parsed.turns.length,
            totalInputTokens,
            totalOutputTokens,
            totalCacheCreate,
            totalCacheRead,
            sessionCost,
            primaryModel,
            parsed.entrypoint,
            parsed.version,
            isAgent ? 1 : 0,
            parsed.slug,
            parsed.stop_reason,
            totalWebSearches,
            totalWebFetches,
            parentSessionId,
            agentName,
            parsed.compact_events.length,
            parsed.coding_active_ms,
            parsed.coding_idle_ms,
          );

          // Insert hook executions
          for (const hook of parsed.hook_executions) {
            insertHookExecution.run(
              parsed.id,
              hook.hook_command,
              hook.duration_ms,
              hook.had_error ? 1 : 0,
              hook.error_message,
              hook.timestamp,
            );
          }

          // Insert compact events
          for (const ce of parsed.compact_events) {
            insertCompactEvent.run(
              parsed.id,
              ce.trigger,
              ce.pre_tokens,
              ce.content_length,
              ce.timestamp,
            );
          }

          // Insert turns and tool uses
          for (const turn of parsed.turns) {
            const turnCost = calculateCost({
              input_tokens: turn.input_tokens,
              output_tokens: turn.output_tokens,
              cache_creation_tokens: turn.cache_creation_tokens,
              cache_read_tokens: turn.cache_read_tokens,
              model: turn.model || primaryModel || "claude-sonnet-4-6",
            });

            insertTurn.run(
              turn.id,
              parsed.id,
              turn.turn_index,
              turn.prompt_text,
              turn.prompt_timestamp,
              turn.response_timestamp,
              turn.duration_ms,
              turn.model,
              turn.input_tokens,
              turn.output_tokens,
              turn.cache_creation_tokens,
              turn.cache_read_tokens,
              turn.stop_reason,
              turn.has_thinking ? 1 : 0,
              turn.tool_uses.length,
              turnCost,
              turn.actual_duration_ms,
              turn.message_count,
              turn.service_tier,
              turn.inference_speed,
              turn.cache_5m_tokens,
              turn.cache_1h_tokens,
              turn.web_search_requests,
              turn.web_fetch_requests,
              turn.response_text,
            );

            for (const tool of turn.tool_uses) {
              insertToolUse.run(
                tool.id,
                turn.id,
                parsed.id,
                tool.tool_name,
                getToolCategory(tool.tool_name),
                tool.input_summary,
                tool.is_error ? 1 : 0,
                tool.timestamp,
              );
            }
          }

          // Insert file changes
          for (const filePath of parsed.file_changes) {
            insertFileChange.run(
              parsed.id,
              filePath,
              "modified",
              parsed.ended_at,
            );
          }

          imported++;
        } catch (err) {
          errors++;
          if (processed <= 5 || errors <= 10) {
            console.error(
              `  Error processing ${file.sessionId}: ${(err as Error).message}`,
            );
          }
        }
      }
    });

    insertBatch();

    // Update import run progress
    db.prepare(
      `UPDATE import_runs SET files_processed = ?, sessions_imported = ?, errors = ? WHERE id = ?`,
    ).run(processed, imported, errors, importRunId);

    // Progress
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = processed / elapsed;
    const eta = (newFiles.length - processed) / rate;
    process.stdout.write(
      `\r  ${processed}/${newFiles.length} files | ${imported} imported | ${errors} errors | ${rate.toFixed(0)} files/s | ETA ${eta.toFixed(0)}s`,
    );
  }

  console.log("\n");

  // Complete import run
  db.prepare(
    `UPDATE import_runs SET completed_at = ?, status = 'completed', files_processed = ?, sessions_imported = ?, errors = ? WHERE id = ?`,
  ).run(new Date().toISOString(), processed, imported, errors, importRunId);

  console.log(`Import complete: ${imported} sessions, ${errors} errors\n`);

  // Rebuild aggregates
  console.log("Rebuilding aggregates...");
  process.env.DB_PATH = DB_PATH;
  rebuildAllAggregates();

  // Print summary
  const totalSessions = db
    .prepare(`SELECT COUNT(*) as c FROM sessions`)
    .get() as { c: number };
  const totalTurns = db.prepare(`SELECT COUNT(*) as c FROM turns`).get() as {
    c: number;
  };
  const totalTools = db
    .prepare(`SELECT COUNT(*) as c FROM tool_uses`)
    .get() as { c: number };
  const totalProjects = db
    .prepare(`SELECT COUNT(*) as c FROM projects`)
    .get() as { c: number };

  console.log(`\n=== Summary ===`);
  console.log(`Projects: ${totalProjects.c}`);
  console.log(`Sessions: ${totalSessions.c}`);
  console.log(`Turns: ${totalTurns.c}`);
  console.log(`Tool uses: ${totalTools.c}`);
  console.log(`Time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  db.close();
}

main().catch(console.error);
