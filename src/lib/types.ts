export interface Project {
  id: string;
  path: string;
  encoded_path: string;
  display_name: string;
  category: string | null;
  first_seen_at: string;
  last_seen_at: string;
  total_sessions: number;
  total_tokens_in: number;
  total_tokens_out: number;
  total_cost_usd: number;
}

export interface Session {
  id: string;
  project_id: string;
  jsonl_path: string | null;
  git_branch: string | null;
  title: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  active_duration_ms: number | null;
  prompt_count: number;
  response_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  equivalent_cost_usd: number;
  primary_model: string | null;
  entrypoint: string;
  version: string | null;
  is_agent_session: number;
  slug: string | null;
  stop_reason: string | null;
  total_web_searches: number;
  total_web_fetches: number;
  parent_session_id: string | null;
  agent_name: string | null;
  machine_id: string | null;
  compact_count: number;
}

export interface SessionWithProject extends Session {
  project_display_name: string;
  project_path: string;
}

export interface SessionWithProjectAndMachine extends SessionWithProject {
  machine_id: string | null;
  machine_label: string | null;
  machine_os: string | null;
}

export interface Turn {
  id: string;
  session_id: string;
  turn_index: number;
  prompt_text: string | null;
  response_text: string | null;
  prompt_timestamp: string;
  response_timestamp: string | null;
  duration_ms: number | null;
  actual_duration_ms: number | null;
  message_count: number | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  stop_reason: string | null;
  has_thinking: number;
  tool_use_count: number;
  equivalent_cost_usd: number;
  service_tier: string | null;
  inference_speed: string | null;
  cache_5m_tokens: number;
  cache_1h_tokens: number;
  web_search_requests: number;
  web_fetch_requests: number;
}

export interface HookExecution {
  id: number;
  session_id: string;
  hook_command: string;
  duration_ms: number | null;
  had_error: number;
  error_message: string | null;
  timestamp: string | null;
}

export interface ToolUse {
  id: string;
  turn_id: string;
  session_id: string;
  tool_name: string;
  tool_category: string;
  input_summary: string | null;
  is_error: number;
  timestamp: string | null;
}

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

export interface DailyStats {
  date: string;
  session_count: number;
  prompt_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cache_creation_tokens: number;
  total_cache_read_tokens: number;
  equivalent_cost_usd: number;
  active_duration_ms: number;
  wall_clock_duration_ms: number;
  tools_used: number;
  files_changed: number;
  first_activity: string | null;
  last_activity: string | null;
  streak_day: number;
  primary_project: string | null;
  primary_model: string | null;
}

export interface ProjectDailyStats {
  project_id: string;
  date: string;
  session_count: number;
  prompt_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  equivalent_cost_usd: number;
  active_duration_ms: number;
}

export interface ModelDailyStats {
  model: string;
  date: string;
  request_count: number;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  equivalent_cost_usd: number;
  cache_hit_rate: number;
}

export interface ImportRun {
  id: number;
  started_at: string;
  completed_at: string | null;
  files_processed: number;
  files_total: number;
  sessions_imported: number;
  errors: number;
  status: "running" | "completed" | "failed";
}

// JSONL parsing types
export interface CompactEvent {
  id?: number;
  session_id?: string;
  trigger: string;
  pre_tokens: number;
  content_length: number;
  timestamp: string;
}

export interface ParsedSession {
  id: string;
  cwd: string;
  git_branch: string | null;
  version: string | null;
  entrypoint: string;
  started_at: string;
  ended_at: string;
  is_agent_session: boolean;
  slug: string | null;
  stop_reason: string | null;
  total_web_searches: number;
  total_web_fetches: number;
  parent_session_id: string | null;
  agent_name: string | null;
  compact_events: CompactEvent[];
  coding_active_ms: number;
  coding_idle_ms: number;
  turns: ParsedTurn[];
  file_changes: string[];
  hook_executions: ParsedHookExecution[];
}

export interface ParsedTurn {
  id: string;
  turn_index: number;
  prompt_text: string | null;
  response_text: string | null;
  prompt_timestamp: string;
  response_timestamp: string | null;
  duration_ms: number | null;
  actual_duration_ms: number | null;
  message_count: number | null;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_creation_tokens: number;
  cache_read_tokens: number;
  stop_reason: string | null;
  has_thinking: boolean;
  service_tier: string | null;
  inference_speed: string | null;
  cache_5m_tokens: number;
  cache_1h_tokens: number;
  web_search_requests: number;
  web_fetch_requests: number;
  tool_uses: ParsedToolUse[];
}

export interface ParsedToolUse {
  id: string;
  tool_name: string;
  input_summary: string | null;
  is_error: boolean;
  timestamp: string | null;
}

export interface ParsedHookExecution {
  hook_command: string;
  duration_ms: number | null;
  had_error: boolean;
  error_message: string | null;
  timestamp: string | null;
}

// API response types
export interface DashboardData {
  today: {
    sessions: number;
    prompts: number;
    active_minutes: number;
    tokens_total: number;
    cost_usd: number;
    streak: number;
  };
  yesterday: {
    sessions: number;
    cost_usd: number;
    active_minutes: number;
  };
  weekly_avg: {
    sessions: number;
    cost_usd: number;
    active_minutes: number;
  };
  recent_sessions: SessionWithProjectAndMachine[];
  hourly_activity: { hour: number; prompts: number; project: string }[];
  project_split: { project: string; minutes: number; sessions: number }[];
  live_session: { project: string; started_at: string } | null;
}

export interface StatsQuery {
  period?: "day" | "week" | "month";
  from?: string;
  to?: string;
  project?: string;
}

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
