// Model pricing (USD per million tokens) — equivalent cost for Max plan users
export const MODEL_PRICING: Record<
  string,
  {
    input: number;
    output: number;
    cache_write: number;
    cache_read: number;
    display_name: string;
  }
> = {
  "claude-opus-4-6": {
    input: 15,
    output: 75,
    cache_write: 18.75,
    cache_read: 3.75,
    display_name: "Opus 4.6",
  },
  "claude-opus-4-20250415": {
    input: 15,
    output: 75,
    cache_write: 18.75,
    cache_read: 3.75,
    display_name: "Opus 4",
  },
  "claude-sonnet-4-6": {
    input: 3,
    output: 15,
    cache_write: 3.75,
    cache_read: 0.3,
    display_name: "Sonnet 4.6",
  },
  "claude-sonnet-4-20250514": {
    input: 3,
    output: 15,
    cache_write: 3.75,
    cache_read: 0.3,
    display_name: "Sonnet 4",
  },
  "claude-haiku-4-5-20251001": {
    input: 0.8,
    output: 4,
    cache_write: 1,
    cache_read: 0.08,
    display_name: "Haiku 4.5",
  },
  "claude-3-5-sonnet-20241022": {
    input: 3,
    output: 15,
    cache_write: 3.75,
    cache_read: 0.3,
    display_name: "Sonnet 3.5",
  },
  "claude-opus-4-5-20251101": {
    input: 15,
    output: 75,
    cache_write: 18.75,
    cache_read: 3.75,
    display_name: "Opus 4.5",
  },
  "<synthetic>": {
    input: 0,
    output: 0,
    cache_write: 0,
    cache_read: 0,
    display_name: "System (internal)",
  },
};

// Tool categories for grouping
export const TOOL_CATEGORIES: Record<string, string> = {
  Read: "file_read",
  Glob: "search",
  Grep: "search",
  Edit: "file_edit",
  Write: "file_edit",
  MultiEdit: "file_edit",
  Bash: "bash",
  Agent: "agent",
  TodoWrite: "task",
  TaskCreate: "task",
  TaskUpdate: "task",
  TaskList: "task",
  TaskGet: "task",
  TaskOutput: "task",
  TaskStop: "task",
  Skill: "skill",
  ToolSearch: "system",
  EnterPlanMode: "system",
  ExitPlanMode: "system",
  NotebookEdit: "file_edit",
  WebFetch: "web",
  WebSearch: "web",
  AskUserQuestion: "interaction",
  SendMessage: "agent",
  TeamCreate: "agent",
  TeamDelete: "agent",
  CronCreate: "system",
  CronDelete: "system",
  CronList: "system",
};

export function getToolCategory(toolName: string): string {
  if (TOOL_CATEGORIES[toolName]) return TOOL_CATEGORIES[toolName];
  if (toolName.startsWith("mcp__playwright")) return "mcp_playwright";
  if (toolName.startsWith("mcp__brave")) return "mcp_search";
  if (toolName.startsWith("mcp__faucet")) return "mcp_faucet";
  if (toolName.startsWith("mcp__global-memory")) return "mcp_memory";
  if (toolName.startsWith("mcp__")) return "mcp_other";
  return "other";
}

// Category display names and colors
export const CATEGORY_COLORS: Record<string, { label: string; color: string }> =
  {
    file_read: { label: "File Read", color: "#60a5fa" },
    file_edit: { label: "File Edit", color: "#34d399" },
    search: { label: "Search", color: "#fbbf24" },
    bash: { label: "Bash", color: "#f87171" },
    agent: { label: "Agent", color: "#a78bfa" },
    task: { label: "Task", color: "#fb923c" },
    skill: { label: "Skill", color: "#2dd4bf" },
    system: { label: "System", color: "#94a3b8" },
    web: { label: "Web", color: "#f472b6" },
    interaction: { label: "Interaction", color: "#e879f9" },
    mcp_playwright: { label: "Playwright", color: "#4ade80" },
    mcp_search: { label: "Brave Search", color: "#38bdf8" },
    mcp_faucet: { label: "Faucet", color: "#facc15" },
    mcp_memory: { label: "Memory", color: "#c084fc" },
    mcp_other: { label: "MCP Other", color: "#fb7185" },
    other: { label: "Other", color: "#6b7280" },
  };

// Default project directory patterns for categorization.
// Users can customize these via the settings page or by editing this list.
// Patterns match against the full project path from ~/.claude/projects.
export const DEFAULT_PROJECT_CATEGORIES: [RegExp, string][] = [
  [/\/hackathons\//, "hackathon"],
  [/\/products\//, "product"],
  [/\/agents\//, "agent"],
  [/\/infra\//, "infra"],
  [/\/starters\//, "starter"],
  [/\/archived\//, "archived"],
  [/\/demo\//, "demo"],
  [/\/conductor-workspaces\//, "conductor"],
  [/-private-tmp/, "agent_session"],
];

export function categorizeProject(
  path: string,
  categories: [RegExp, string][] = DEFAULT_PROJECT_CATEGORIES,
): string {
  for (const [pattern, category] of categories) {
    if (pattern.test(path)) return category;
  }
  return "other";
}

// Derive a display name from an absolute project path.
// Strips the user's home directory prefix (cross-platform) to produce a short name.
export function deriveDisplayName(path: string): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  let clean = path;
  if (home && clean.startsWith(home)) {
    clean = clean.slice(home.length);
  }
  // Also strip common prefixes like /Documents/ or /projects/
  clean = clean.replace(/^\/(?:Documents|projects)\//, "");
  const parts = clean.split("/").filter(Boolean);
  if (parts.length >= 2) return parts.slice(0, 2).join("/");
  if (parts.length === 1) return parts[0];
  return path.split("/").pop() || path;
}
