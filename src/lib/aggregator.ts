import { getDb } from "./db";

export function rebuildDailyStats() {
  const db = getDb();

  db.exec(`DELETE FROM daily_stats`);

  db.exec(`
    INSERT INTO daily_stats (
      date, session_count, prompt_count,
      total_input_tokens, total_output_tokens,
      total_cache_creation_tokens, total_cache_read_tokens,
      equivalent_cost_usd, active_duration_ms, wall_clock_duration_ms,
      tools_used, files_changed, first_activity, last_activity,
      primary_project, primary_model
    )
    SELECT
      date(s.started_at) as date,
      COUNT(DISTINCT s.id) as session_count,
      COALESCE(SUM(s.prompt_count), 0) as prompt_count,
      COALESCE(SUM(s.total_input_tokens), 0),
      COALESCE(SUM(s.total_output_tokens), 0),
      COALESCE(SUM(s.total_cache_creation_tokens), 0),
      COALESCE(SUM(s.total_cache_read_tokens), 0),
      COALESCE(SUM(s.equivalent_cost_usd), 0),
      COALESCE(SUM(s.active_duration_ms), 0),
      COALESCE(SUM(s.duration_ms), 0),
      (SELECT COUNT(*) FROM tool_uses tu WHERE tu.session_id IN (
        SELECT id FROM sessions WHERE date(started_at) = date(s.started_at) AND is_agent_session = 0
      )),
      (SELECT COUNT(*) FROM file_changes fc WHERE fc.session_id IN (
        SELECT id FROM sessions WHERE date(started_at) = date(s.started_at) AND is_agent_session = 0
      )),
      MIN(s.started_at),
      MAX(COALESCE(s.ended_at, s.started_at)),
      (SELECT p.display_name FROM sessions s2
        JOIN projects p ON s2.project_id = p.id
        WHERE date(s2.started_at) = date(s.started_at) AND s2.is_agent_session = 0
        GROUP BY s2.project_id ORDER BY SUM(s2.duration_ms) DESC LIMIT 1),
      (SELECT s3.primary_model FROM sessions s3
        WHERE date(s3.started_at) = date(s.started_at) AND s3.is_agent_session = 0
        GROUP BY s3.primary_model ORDER BY COUNT(*) DESC LIMIT 1)
    FROM sessions s
    WHERE s.is_agent_session = 0
    GROUP BY date(s.started_at)
  `);

  // Calculate streaks
  const dates = db
    .prepare(`SELECT date FROM daily_stats ORDER BY date`)
    .all() as { date: string }[];

  let streak = 0;
  for (let i = dates.length - 1; i >= 0; i--) {
    if (i === dates.length - 1) {
      streak = 1;
    } else {
      const curr = new Date(dates[i].date);
      const next = new Date(dates[i + 1].date);
      const diff = Math.round((next.getTime() - curr.getTime()) / 86400000);
      if (diff === 1) {
        streak++;
      } else {
        streak = 1;
      }
    }
    db.prepare(`UPDATE daily_stats SET streak_day = ? WHERE date = ?`).run(
      streak,
      dates[i].date,
    );
  }
}

export function rebuildProjectDailyStats() {
  const db = getDb();

  db.exec(`DELETE FROM project_daily_stats`);

  db.exec(`
    INSERT INTO project_daily_stats (
      project_id, date, session_count, prompt_count,
      total_input_tokens, total_output_tokens,
      equivalent_cost_usd, active_duration_ms
    )
    SELECT
      s.project_id,
      date(s.started_at) as date,
      COUNT(DISTINCT s.id),
      COALESCE(SUM(s.prompt_count), 0),
      COALESCE(SUM(s.total_input_tokens), 0),
      COALESCE(SUM(s.total_output_tokens), 0),
      COALESCE(SUM(s.equivalent_cost_usd), 0),
      COALESCE(SUM(s.active_duration_ms), 0)
    FROM sessions s
    WHERE s.is_agent_session = 0
    GROUP BY s.project_id, date(s.started_at)
  `);
}

export function rebuildModelDailyStats() {
  const db = getDb();

  db.exec(`DELETE FROM model_daily_stats`);

  db.exec(`
    INSERT INTO model_daily_stats (
      model, date, request_count,
      input_tokens, output_tokens,
      cache_creation_tokens, cache_read_tokens,
      equivalent_cost_usd, cache_hit_rate
    )
    SELECT
      t.model,
      date(t.prompt_timestamp) as date,
      COUNT(*),
      COALESCE(SUM(t.input_tokens), 0),
      COALESCE(SUM(t.output_tokens), 0),
      COALESCE(SUM(t.cache_creation_tokens), 0),
      COALESCE(SUM(t.cache_read_tokens), 0),
      COALESCE(SUM(t.equivalent_cost_usd), 0),
      CASE WHEN SUM(t.cache_read_tokens + t.input_tokens + t.cache_creation_tokens) > 0
        THEN CAST(SUM(t.cache_read_tokens) AS REAL) / SUM(t.cache_read_tokens + t.input_tokens + t.cache_creation_tokens)
        ELSE 0
      END
    FROM turns t
    JOIN sessions s ON t.session_id = s.id
    WHERE t.model IS NOT NULL AND s.is_agent_session = 0
    GROUP BY t.model, date(t.prompt_timestamp)
  `);
}

export function rebuildProjectTotals() {
  const db = getDb();

  db.exec(`
    UPDATE projects SET
      total_sessions = (SELECT COUNT(*) FROM sessions WHERE project_id = projects.id AND is_agent_session = 0),
      total_tokens_in = (SELECT COALESCE(SUM(total_input_tokens), 0) FROM sessions WHERE project_id = projects.id AND is_agent_session = 0),
      total_tokens_out = (SELECT COALESCE(SUM(total_output_tokens), 0) FROM sessions WHERE project_id = projects.id AND is_agent_session = 0),
      total_cost_usd = (SELECT COALESCE(SUM(equivalent_cost_usd), 0) FROM sessions WHERE project_id = projects.id AND is_agent_session = 0),
      first_seen_at = COALESCE((SELECT MIN(started_at) FROM sessions WHERE project_id = projects.id), projects.first_seen_at),
      last_seen_at = COALESCE((SELECT MAX(started_at) FROM sessions WHERE project_id = projects.id), projects.last_seen_at)
  `);
}

export function rebuildAllAggregates() {
  console.log("Rebuilding daily stats...");
  rebuildDailyStats();
  console.log("Rebuilding project daily stats...");
  rebuildProjectDailyStats();
  console.log("Rebuilding model daily stats...");
  rebuildModelDailyStats();
  console.log("Rebuilding project totals...");
  rebuildProjectTotals();
  console.log("All aggregates rebuilt.");
}
