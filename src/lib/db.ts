import Database from "better-sqlite3";
import path from "path";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const dbPath =
    process.env.DB_PATH || path.join(process.cwd(), "data", "dev-tracker.db");

  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");
  _db.pragma("foreign_keys = ON");

  initSchema(_db);
  migrateSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL UNIQUE,
      encoded_path TEXT NOT NULL,
      display_name TEXT NOT NULL,
      category TEXT,
      first_seen_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      total_sessions INTEGER DEFAULT 0,
      total_tokens_in INTEGER DEFAULT 0,
      total_tokens_out INTEGER DEFAULT 0,
      total_cost_usd REAL DEFAULT 0.0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_projects_path ON projects(path);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id),
      jsonl_path TEXT,
      git_branch TEXT,
      title TEXT,
      started_at TEXT NOT NULL,
      ended_at TEXT,
      duration_ms INTEGER,
      active_duration_ms INTEGER,
      prompt_count INTEGER DEFAULT 0,
      response_count INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_cache_creation_tokens INTEGER DEFAULT 0,
      total_cache_read_tokens INTEGER DEFAULT 0,
      equivalent_cost_usd REAL DEFAULT 0.0,
      primary_model TEXT,
      entrypoint TEXT DEFAULT 'cli',
      version TEXT,
      is_agent_session INTEGER DEFAULT 0,
      slug TEXT,
      stop_reason TEXT,
      total_web_searches INTEGER DEFAULT 0,
      total_web_fetches INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_started ON sessions(started_at);
    CREATE INDEX IF NOT EXISTS idx_sessions_date ON sessions(date(started_at));

    CREATE TABLE IF NOT EXISTS turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      turn_index INTEGER NOT NULL,
      prompt_text TEXT,
      prompt_timestamp TEXT NOT NULL,
      response_timestamp TEXT,
      duration_ms INTEGER,
      actual_duration_ms INTEGER,
      message_count INTEGER,
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      stop_reason TEXT,
      has_thinking INTEGER DEFAULT 0,
      tool_use_count INTEGER DEFAULT 0,
      equivalent_cost_usd REAL DEFAULT 0.0,
      service_tier TEXT,
      inference_speed TEXT,
      cache_5m_tokens INTEGER DEFAULT 0,
      cache_1h_tokens INTEGER DEFAULT 0,
      web_search_requests INTEGER DEFAULT 0,
      web_fetch_requests INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_turns_session ON turns(session_id, turn_index);

    CREATE TABLE IF NOT EXISTS tool_uses (
      id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      tool_name TEXT NOT NULL,
      tool_category TEXT,
      input_summary TEXT,
      is_error INTEGER DEFAULT 0,
      timestamp TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_tool_uses_session ON tool_uses(session_id);
    CREATE INDEX IF NOT EXISTS idx_tool_uses_name ON tool_uses(tool_name);

    CREATE TABLE IF NOT EXISTS file_changes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      change_type TEXT,
      timestamp TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_file_changes_session ON file_changes(session_id);

    CREATE TABLE IF NOT EXISTS daily_stats (
      date TEXT PRIMARY KEY,
      session_count INTEGER DEFAULT 0,
      prompt_count INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      total_cache_creation_tokens INTEGER DEFAULT 0,
      total_cache_read_tokens INTEGER DEFAULT 0,
      equivalent_cost_usd REAL DEFAULT 0.0,
      active_duration_ms INTEGER DEFAULT 0,
      wall_clock_duration_ms INTEGER DEFAULT 0,
      tools_used INTEGER DEFAULT 0,
      files_changed INTEGER DEFAULT 0,
      first_activity TEXT,
      last_activity TEXT,
      streak_day INTEGER DEFAULT 0,
      primary_project TEXT,
      primary_model TEXT
    );

    CREATE TABLE IF NOT EXISTS project_daily_stats (
      project_id TEXT NOT NULL REFERENCES projects(id),
      date TEXT NOT NULL,
      session_count INTEGER DEFAULT 0,
      prompt_count INTEGER DEFAULT 0,
      total_input_tokens INTEGER DEFAULT 0,
      total_output_tokens INTEGER DEFAULT 0,
      equivalent_cost_usd REAL DEFAULT 0.0,
      active_duration_ms INTEGER DEFAULT 0,
      PRIMARY KEY (project_id, date)
    );

    CREATE TABLE IF NOT EXISTS model_daily_stats (
      model TEXT NOT NULL,
      date TEXT NOT NULL,
      request_count INTEGER DEFAULT 0,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      equivalent_cost_usd REAL DEFAULT 0.0,
      cache_hit_rate REAL DEFAULT 0.0,
      PRIMARY KEY (model, date)
    );

    CREATE TABLE IF NOT EXISTS import_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      files_processed INTEGER DEFAULT 0,
      files_total INTEGER DEFAULT 0,
      sessions_imported INTEGER DEFAULT 0,
      errors INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running'
    );

    CREATE TABLE IF NOT EXISTS hook_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      hook_command TEXT NOT NULL,
      duration_ms INTEGER,
      had_error INTEGER DEFAULT 0,
      error_message TEXT,
      timestamp TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_hook_executions_session ON hook_executions(session_id);

    CREATE TABLE IF NOT EXISTS compact_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
      trigger TEXT,
      pre_tokens INTEGER,
      content_length INTEGER,
      timestamp TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_compact_session ON compact_events(session_id);

    CREATE TABLE IF NOT EXISTS heartbeats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      context_remaining_pct REAL,
      context_used_pct REAL,
      model TEXT,
      cost_usd REAL,
      api_duration_ms INTEGER,
      lines_added INTEGER,
      lines_removed INTEGER,
      rate_limit_5h_pct REAL,
      rate_limit_7d_pct REAL,
      timestamp TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_heartbeats_session ON heartbeats(session_id);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    );
  `);
}

function migrateSchema(db: Database.Database) {
  // Helper: check if a column exists on a table
  function hasColumn(table: string, column: string): boolean {
    const cols = db.prepare(`PRAGMA table_info(${table})`).all() as {
      name: string;
    }[];
    return cols.some((c) => c.name === column);
  }

  // Sessions table — new columns
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

  // Turns table — new columns
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
}
