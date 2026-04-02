import { getDb } from "./db";
import type {
  Session,
  SessionWithProject,
  Turn,
  ToolUse,
  DailyStats,
  Project,
  HookExecution,
  CompactEvent,
} from "./types";

// Sessions
export function getRecentSessions(
  limit: number = 10,
  offset: number = 0,
  filters?: {
    project_id?: string;
    date?: string;
    model?: string;
    search?: string;
    sort?: string;
    include_agents?: boolean;
    min_prompts?: number;
  },
): { sessions: SessionWithProject[]; total: number } {
  const db = getDb();
  const conditions: string[] = [];
  const params: unknown[] = [];

  if (!filters?.include_agents) {
    conditions.push("s.is_agent_session = 0");
  }
  // Always exclude ghost sessions (created by prompt-start hook but never completed)
  conditions.push(
    "(s.total_input_tokens + s.total_output_tokens + s.total_cache_creation_tokens + s.total_cache_read_tokens) > 0",
  );
  if (filters?.min_prompts) {
    conditions.push("s.prompt_count >= ?");
    params.push(filters.min_prompts);
  }
  if (filters?.project_id) {
    conditions.push("s.project_id = ?");
    params.push(filters.project_id);
  }
  if (filters?.date) {
    conditions.push("date(s.started_at) = ?");
    params.push(filters.date);
  }
  if (filters?.model) {
    conditions.push("s.primary_model = ?");
    params.push(filters.model);
  }
  if (filters?.search) {
    conditions.push(
      "EXISTS (SELECT 1 FROM turns t WHERE t.session_id = s.id AND t.prompt_text LIKE ?)",
    );
    params.push(`%${filters.search}%`);
  }

  const where =
    conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  let orderBy = "s.started_at DESC";
  if (filters?.sort === "longest") orderBy = "s.duration_ms DESC";
  if (filters?.sort === "tokens")
    orderBy =
      "(s.total_input_tokens + s.total_output_tokens + s.total_cache_creation_tokens + s.total_cache_read_tokens) DESC";
  if (filters?.sort === "cost") orderBy = "s.equivalent_cost_usd DESC";
  if (filters?.sort === "oldest") orderBy = "s.started_at ASC";

  const total = db
    .prepare(`SELECT COUNT(*) as count FROM sessions s ${where}`)
    .get(...params) as { count: number };

  const sessions = db
    .prepare(
      `SELECT s.*, p.display_name as project_display_name, p.path as project_path
     FROM sessions s
     JOIN projects p ON s.project_id = p.id
     ${where}
     ORDER BY ${orderBy}
     LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as SessionWithProject[];

  return { sessions, total: total.count };
}

export function getSessionById(
  id: string,
): (SessionWithProject & { turns: (Turn & { tools: ToolUse[] })[] }) | null {
  const db = getDb();

  const session = db
    .prepare(
      `SELECT s.*, p.display_name as project_display_name, p.path as project_path
     FROM sessions s
     JOIN projects p ON s.project_id = p.id
     WHERE s.id = ?`,
    )
    .get(id) as SessionWithProject | undefined;

  if (!session) return null;

  const turns = db
    .prepare(`SELECT * FROM turns WHERE session_id = ? ORDER BY turn_index`)
    .all(id) as Turn[];

  const turnsWithTools = turns.map((turn) => {
    const tools = db
      .prepare(`SELECT * FROM tool_uses WHERE turn_id = ?`)
      .all(turn.id) as ToolUse[];
    return { ...turn, tools };
  });

  return { ...session, turns: turnsWithTools };
}

// Dashboard
export function getTodayStats(): {
  sessions: number;
  prompts: number;
  active_minutes: number;
  tokens_total: number;
  cost_usd: number;
} {
  const db = getDb();
  const today = new Date().toISOString().split("T")[0];

  const result = db
    .prepare(
      `SELECT
      COUNT(DISTINCT s.id) as sessions,
      COALESCE(SUM(s.prompt_count), 0) as prompts,
      COALESCE(SUM(s.active_duration_ms), 0) as active_ms,
      COALESCE(SUM(s.total_input_tokens + s.total_output_tokens + s.total_cache_creation_tokens + s.total_cache_read_tokens), 0) as tokens_total,
      COALESCE(SUM(s.equivalent_cost_usd), 0) as cost_usd
    FROM sessions s
    WHERE date(s.started_at) = ? AND s.is_agent_session = 0`,
    )
    .get(today) as {
    sessions: number;
    prompts: number;
    active_ms: number;
    tokens_total: number;
    cost_usd: number;
  };

  return {
    sessions: result.sessions,
    prompts: result.prompts,
    active_minutes: Math.round(result.active_ms / 60000),
    tokens_total: result.tokens_total,
    cost_usd: result.cost_usd,
  };
}

export function getYesterdayStats(): {
  sessions: number;
  cost_usd: number;
  active_minutes: number;
} {
  const db = getDb();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  const result = db
    .prepare(
      `SELECT
      COUNT(DISTINCT id) as sessions,
      COALESCE(SUM(equivalent_cost_usd), 0) as cost_usd,
      COALESCE(SUM(active_duration_ms), 0) as active_ms
    FROM sessions WHERE date(started_at) = ? AND is_agent_session = 0`,
    )
    .get(yesterday) as {
    sessions: number;
    cost_usd: number;
    active_ms: number;
  };

  return {
    sessions: result.sessions,
    cost_usd: result.cost_usd,
    active_minutes: Math.round(result.active_ms / 60000),
  };
}

export function getWeeklyAvgStats(): {
  sessions: number;
  cost_usd: number;
  active_minutes: number;
} {
  const db = getDb();
  const weekAgo = new Date(Date.now() - 7 * 86400000)
    .toISOString()
    .split("T")[0];

  const result = db
    .prepare(
      `SELECT
      COUNT(DISTINCT id) / 7.0 as avg_sessions,
      COALESCE(SUM(equivalent_cost_usd), 0) / 7.0 as avg_cost,
      COALESCE(SUM(active_duration_ms), 0) / 7.0 as avg_active_ms
    FROM sessions WHERE date(started_at) >= ? AND is_agent_session = 0`,
    )
    .get(weekAgo) as {
    avg_sessions: number;
    avg_cost: number;
    avg_active_ms: number;
  };

  return {
    sessions: Math.round(result.avg_sessions),
    cost_usd: result.avg_cost,
    active_minutes: Math.round(result.avg_active_ms / 60000),
  };
}

export function getCurrentStreak(): number {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT date(started_at) as d
     FROM sessions WHERE is_agent_session = 0
     ORDER BY d DESC LIMIT 365`,
    )
    .all() as { d: string }[];

  if (rows.length === 0) return 0;

  let streak = 0;
  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  // Start from today or yesterday
  if (rows[0].d !== today && rows[0].d !== yesterday) return 0;

  let expected = new Date(rows[0].d);
  for (const row of rows) {
    const d = new Date(row.d);
    const diff = Math.round((expected.getTime() - d.getTime()) / 86400000);
    if (diff > 1) break;
    streak++;
    expected = d;
  }

  return streak;
}

export function getHourlyActivity(
  date: string,
): { hour: number; prompts: number; project: string }[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
      CAST(strftime('%H', t.prompt_timestamp) AS INTEGER) as hour,
      COUNT(*) as prompts,
      p.display_name as project
    FROM turns t
    JOIN sessions s ON t.session_id = s.id
    JOIN projects p ON s.project_id = p.id
    WHERE date(t.prompt_timestamp) = ? AND s.is_agent_session = 0
    GROUP BY hour, p.display_name
    ORDER BY hour`,
    )
    .all(date) as { hour: number; prompts: number; project: string }[];

  return rows;
}

export function getProjectSplit(date: string): {
  project: string;
  project_id: string;
  minutes: number;
  sessions: number;
}[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
      p.display_name as project,
      p.id as project_id,
      COALESCE(SUM(s.duration_ms), 0) / 60000.0 as minutes,
      COUNT(DISTINCT s.id) as sessions
    FROM sessions s
    JOIN projects p ON s.project_id = p.id
    WHERE date(s.started_at) = ? AND s.is_agent_session = 0
    GROUP BY p.id
    ORDER BY minutes DESC`,
    )
    .all(date) as {
    project: string;
    project_id: string;
    minutes: number;
    sessions: number;
  }[];
}

// Projects
export function getAllProjects(): Project[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM projects ORDER BY last_seen_at DESC`)
    .all() as Project[];
}

export function getProjectById(id: string): Project | null {
  const db = getDb();
  return (
    (db.prepare(`SELECT * FROM projects WHERE id = ?`).get(id) as Project) ||
    null
  );
}

// Stats
export function getTokenTimeSeries(
  from: string,
  to: string,
  period: "day" | "week" | "month" = "day",
): {
  date: string;
  input: number;
  output: number;
  cache_create: number;
  cache_read: number;
  cost: number;
}[] {
  const db = getDb();
  const groupBy =
    period === "week"
      ? "strftime('%Y-W%W', date)"
      : period === "month"
        ? "strftime('%Y-%m', date)"
        : "date";

  return db
    .prepare(
      `SELECT
      ${groupBy} as date,
      SUM(total_input_tokens) as input,
      SUM(total_output_tokens) as output,
      SUM(total_cache_creation_tokens) as cache_create,
      SUM(total_cache_read_tokens) as cache_read,
      SUM(equivalent_cost_usd) as cost
    FROM daily_stats
    WHERE date >= ? AND date <= ?
    GROUP BY ${groupBy}
    ORDER BY date`,
    )
    .all(from, to) as {
    date: string;
    input: number;
    output: number;
    cache_create: number;
    cache_read: number;
    cost: number;
  }[];
}

export function getToolStats(
  from: string,
  to: string,
  projectId?: string,
): {
  tool_name: string;
  tool_category: string;
  count: number;
  errors: number;
}[] {
  const db = getDb();
  const projectFilter = projectId
    ? "AND tu.session_id IN (SELECT id FROM sessions WHERE project_id = ?)"
    : "";
  const params: unknown[] = [from, to];
  if (projectId) params.push(projectId);

  return db
    .prepare(
      `SELECT
      tu.tool_name,
      tu.tool_category,
      COUNT(*) as count,
      SUM(tu.is_error) as errors
    FROM tool_uses tu
    JOIN sessions s ON tu.session_id = s.id
    WHERE date(s.started_at) >= ? AND date(s.started_at) <= ?
    ${projectFilter}
    AND s.is_agent_session = 0
    GROUP BY tu.tool_name, tu.tool_category
    ORDER BY count DESC`,
    )
    .all(...params) as {
    tool_name: string;
    tool_category: string;
    count: number;
    errors: number;
  }[];
}

export function getModelStats(
  from: string,
  to: string,
): {
  model: string;
  requests: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  cost: number;
  cache_hit_rate: number;
}[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
      model,
      SUM(request_count) as requests,
      SUM(input_tokens) as input_tokens,
      SUM(output_tokens) as output_tokens,
      SUM(cache_creation_tokens) as cache_creation_tokens,
      SUM(cache_read_tokens) as cache_read_tokens,
      SUM(equivalent_cost_usd) as cost,
      CASE WHEN SUM(cache_read_tokens + input_tokens + cache_creation_tokens) > 0
        THEN CAST(SUM(cache_read_tokens) AS REAL) / SUM(cache_read_tokens + input_tokens + cache_creation_tokens)
        ELSE 0
      END as cache_hit_rate
    FROM model_daily_stats
    WHERE date >= ? AND date <= ?
    GROUP BY model
    ORDER BY cost DESC`,
    )
    .all(from, to) as {
    model: string;
    requests: number;
    input_tokens: number;
    output_tokens: number;
    cache_creation_tokens: number;
    cache_read_tokens: number;
    cost: number;
    cache_hit_rate: number;
  }[];
}

export function getActivityHeatmap(
  from: string,
  to: string,
): { date: string; sessions: number; active_minutes: number }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
      date,
      session_count as sessions,
      active_duration_ms / 60000 as active_minutes
    FROM daily_stats
    WHERE date >= ? AND date <= ?
    ORDER BY date`,
    )
    .all(from, to) as {
    date: string;
    sessions: number;
    active_minutes: number;
  }[];
}

export function getStreakHistory(): {
  current: number;
  longest: number;
  longest_start: string | null;
  longest_end: string | null;
} {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT DISTINCT date(started_at) as d
     FROM sessions WHERE is_agent_session = 0
     ORDER BY d`,
    )
    .all() as { d: string }[];

  if (rows.length === 0)
    return { current: 0, longest: 0, longest_start: null, longest_end: null };

  let longestStreak = 0;
  let longestStart = rows[0].d;
  let longestEnd = rows[0].d;
  let currentStreak = 1;
  let streakStart = rows[0].d;

  for (let i = 1; i < rows.length; i++) {
    const prev = new Date(rows[i - 1].d);
    const curr = new Date(rows[i].d);
    const diff = Math.round((curr.getTime() - prev.getTime()) / 86400000);

    if (diff === 1) {
      currentStreak++;
    } else {
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak;
        longestStart = streakStart;
        longestEnd = rows[i - 1].d;
      }
      currentStreak = 1;
      streakStart = rows[i].d;
    }
  }

  if (currentStreak > longestStreak) {
    longestStreak = currentStreak;
    longestStart = streakStart;
    longestEnd = rows[rows.length - 1].d;
  }

  return {
    current: getCurrentStreak(),
    longest: longestStreak,
    longest_start: longestStart,
    longest_end: longestEnd,
  };
}

export function getDailyStats(from: string, to: string): DailyStats[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM daily_stats WHERE date >= ? AND date <= ? ORDER BY date`,
    )
    .all(from, to) as DailyStats[];
}

// Hook executions
export function getHookExecutions(sessionId: string): HookExecution[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM hook_executions WHERE session_id = ? ORDER BY id`)
    .all(sessionId) as HookExecution[];
}

// Child agent sessions
export function getChildSessions(parentId: string): SessionWithProject[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT s.*, p.display_name as project_display_name, p.path as project_path
     FROM sessions s
     JOIN projects p ON s.project_id = p.id
     WHERE s.parent_session_id = ?
     ORDER BY s.started_at ASC`,
    )
    .all(parentId) as SessionWithProject[];
}

// Skill invocations (Skill tool calls with input_summary = skill name)
export function getSkillStats(
  from: string,
  to: string,
): { skill_name: string; count: number; last_used: string }[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT
      tu.input_summary as skill_name,
      COUNT(*) as count,
      MAX(tu.timestamp) as last_used
    FROM tool_uses tu
    JOIN sessions s ON tu.session_id = s.id
    WHERE tu.tool_name = 'Skill'
      AND tu.input_summary IS NOT NULL
      AND tu.input_summary != ''
      AND date(s.started_at) >= ? AND date(s.started_at) <= ?
      AND s.is_agent_session = 0
    GROUP BY tu.input_summary
    ORDER BY count DESC`,
    )
    .all(from, to) as {
    skill_name: string;
    count: number;
    last_used: string;
  }[];
}

// Compact events
export function getCompactEvents(sessionId: string): CompactEvent[] {
  const db = getDb();
  return db
    .prepare(`SELECT * FROM compact_events WHERE session_id = ? ORDER BY id`)
    .all(sessionId) as CompactEvent[];
}
