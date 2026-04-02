import { createReadStream } from "fs";
import { createInterface } from "readline";
import { v4 as uuid } from "uuid";
import type {
  ParsedSession,
  ParsedTurn,
  ParsedToolUse,
  ParsedHookExecution,
} from "./types";
import { getToolCategory } from "./constants";

// Extract meaningful user text, skipping system-generated content
function extractUserText(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  // Skip system reminders, hook outputs, and generated prefixes
  if (text.startsWith("<system-reminder>")) return null;
  if (text.startsWith("<local-command-")) return null;
  if (text.startsWith("<command-")) return null;
  if (text.startsWith("<task-notification>")) return null;
  if (text.startsWith("<user-prompt-submit-hook>")) return null;
  if (text.startsWith("Caveat: The messages below")) return null;
  if (text.startsWith("<EXTREMELY_IMPORTANT>")) return null;
  // Strip any leading XML tags to find real text
  const stripped = text.replace(/^<[^>]+>[\s\S]*?<\/[^>]+>\s*/g, "").trim();
  if (stripped.length > 3 && !stripped.startsWith("<")) return stripped;
  // If still has tags, try to find text after all tags
  const afterTags = text
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (afterTags.length > 10) return afterTags;
  return null;
}

interface RawEntry {
  type: string;
  timestamp?: string;
  sessionId?: string;
  cwd?: string;
  gitBranch?: string;
  version?: string;
  entrypoint?: string;
  userType?: string;
  promptId?: string;
  uuid?: string;
  slug?: string;
  parentUuid?: string;
  message?: {
    role?: string;
    model?: string;
    id?: string;
    content?: unknown;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      cache_creation_input_tokens?: number;
      cache_read_input_tokens?: number;
      server_tool_use?: {
        web_search_requests?: number;
        web_fetch_requests?: number;
      };
      service_tier?: string;
      cache_creation?: {
        ephemeral_5m_input_tokens?: number;
        ephemeral_1h_input_tokens?: number;
      };
      speed?: string;
    };
    stop_reason?: string;
  };
  subtype?: string;
  // turn_duration fields
  durationMs?: number;
  messageCount?: number;
  // stop_hook_summary fields
  hookCount?: number;
  hookInfos?: { command: string; durationMs?: number }[];
  hookErrors?: { command?: string; error?: string }[];
  stopReason?: string;
  preventedContinuation?: boolean;
  data?: Record<string, unknown>;
  isSidechain?: boolean;
}

export async function parseJsonlFile(
  filePath: string,
  sessionId: string,
): Promise<ParsedSession | null> {
  const entries: RawEntry[] = [];

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf-8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line));
    } catch {
      // Skip malformed lines
    }
  }

  if (entries.length === 0) return null;

  // Extract session metadata from first meaningful entry
  let cwd = "";
  let gitBranch: string | null = null;
  let version: string | null = null;
  let entrypoint = "cli";
  let isAgentSession = false;
  let slug: string | null = null;
  let sessionStopReason: string | null = null;

  for (const entry of entries) {
    if (entry.cwd && !cwd) cwd = entry.cwd;
    if (entry.gitBranch && !gitBranch) gitBranch = entry.gitBranch;
    if (entry.version && !version) version = entry.version;
    if (entry.entrypoint) entrypoint = entry.entrypoint;
    if (entry.userType === "ai") isAgentSession = true;
    if (entry.slug && !slug) slug = entry.slug;
    if (cwd && gitBranch && version && slug) break;
  }

  // Extract stop_hook_summary and hook_executions
  const hookExecutions: ParsedHookExecution[] = [];
  const turnDurations: {
    timestamp: string;
    durationMs: number;
    messageCount: number;
    parentUuid?: string;
  }[] = [];

  for (const entry of entries) {
    if (entry.type === "system" && entry.subtype === "stop_hook_summary") {
      if (entry.stopReason !== undefined)
        sessionStopReason = entry.stopReason || "normal";

      if (Array.isArray(entry.hookInfos)) {
        for (const hook of entry.hookInfos) {
          hookExecutions.push({
            hook_command: hook.command || "unknown",
            duration_ms: hook.durationMs ?? null,
            had_error: false,
            error_message: null,
            timestamp: entry.timestamp || null,
          });
        }
      }
      if (Array.isArray(entry.hookErrors)) {
        for (const hookErr of entry.hookErrors) {
          hookExecutions.push({
            hook_command: hookErr.command || "unknown",
            duration_ms: null,
            had_error: true,
            error_message: hookErr.error || null,
            timestamp: entry.timestamp || null,
          });
        }
      }
    }

    if (entry.type === "system" && entry.subtype === "turn_duration") {
      if (entry.durationMs != null && entry.timestamp) {
        turnDurations.push({
          timestamp: entry.timestamp,
          durationMs: entry.durationMs,
          messageCount: entry.messageCount ?? 0,
          parentUuid: entry.parentUuid,
        });
      }
    }
  }

  // Find timestamps
  const timestamps = entries
    .map((e) => e.timestamp)
    .filter(Boolean) as string[];
  if (timestamps.length === 0) return null;

  const startedAt = timestamps[0];
  const endedAt = timestamps[timestamps.length - 1];

  // Group user messages (turns) — use promptId if available, fall back to uuid or index
  const userMessages: {
    index: number;
    entry: RawEntry;
    promptId: string;
  }[] = [];

  entries.forEach((entry, index) => {
    if (entry.type === "user" && entry.message?.role === "user") {
      const promptId = entry.promptId || entry.uuid || `turn-${index}`;
      userMessages.push({ index, entry, promptId });
    }
  });

  // Collect all assistant messages, deduplicated by message.id
  const assistantByMsgId = new Map<
    string,
    { entry: RawEntry; index: number }
  >();

  entries.forEach((entry, index) => {
    if (entry.type === "assistant" && entry.message) {
      const msgId = entry.message.id;
      if (msgId) {
        const existing = assistantByMsgId.get(msgId);
        // Keep the one with stop_reason set, or the last one
        if (!existing || entry.message.stop_reason || index > existing.index) {
          assistantByMsgId.set(msgId, { entry, index });
        }
      }
    }
  });

  // Build turns
  const turns: ParsedTurn[] = [];

  for (let i = 0; i < userMessages.length; i++) {
    const userMsg = userMessages[i];
    const nextUserIndex =
      i + 1 < userMessages.length ? userMessages[i + 1].index : entries.length;

    // Extract prompt text — skip system-generated content
    let promptText: string | null = null;
    const content = userMsg.entry.message?.content;
    if (typeof content === "string") {
      const cleaned = extractUserText(content);
      if (cleaned) promptText = cleaned.slice(0, 500);
    } else if (Array.isArray(content)) {
      for (const block of content) {
        if (
          typeof block === "object" &&
          block !== null &&
          "type" in block &&
          block.type === "text" &&
          "text" in block
        ) {
          const cleaned = extractUserText(String(block.text));
          if (cleaned) {
            promptText = cleaned.slice(0, 500);
            break;
          }
        }
      }
    }

    // Find assistant responses in this turn's range
    let totalInput = 0;
    let totalOutput = 0;
    let totalCacheCreate = 0;
    let totalCacheRead = 0;
    let model: string | null = null;
    let stopReason: string | null = null;
    let hasThinking = false;
    let responseTimestamp: string | null = null;
    let serviceTier: string | null = null;
    let inferenceSpeed: string | null = null;
    let cache5mTokens = 0;
    let cache1hTokens = 0;
    let webSearchRequests = 0;
    let webFetchRequests = 0;
    const toolUses: ParsedToolUse[] = [];
    const responseTextParts: string[] = [];
    const seenToolIds = new Set<string>();
    const seenMsgIds = new Set<string>();

    for (let j = userMsg.index; j < nextUserIndex; j++) {
      const entry = entries[j];

      if (entry.type === "assistant" && entry.message) {
        const msgId = entry.message.id;
        const isNewMsg = !msgId || !seenMsgIds.has(msgId);
        if (msgId) seenMsgIds.add(msgId);

        // For usage/model/stop_reason: use the deduplicated (final) version only for NEW messages
        if (isNewMsg) {
          const deduped = msgId ? assistantByMsgId.get(msgId) : null;
          const msg = deduped ? deduped.entry.message! : entry.message;

          if (msg.model) model = msg.model;
          if (msg.stop_reason) stopReason = msg.stop_reason;
          if (entry.timestamp) responseTimestamp = entry.timestamp;

          const usage = msg.usage;
          if (usage) {
            totalInput += usage.input_tokens || 0;
            totalOutput += usage.output_tokens || 0;
            totalCacheCreate += usage.cache_creation_input_tokens || 0;
            totalCacheRead += usage.cache_read_input_tokens || 0;

            if (usage.service_tier) serviceTier = usage.service_tier;
            if (usage.speed) inferenceSpeed = usage.speed;
            if (usage.cache_creation) {
              cache5mTokens +=
                usage.cache_creation.ephemeral_5m_input_tokens || 0;
              cache1hTokens +=
                usage.cache_creation.ephemeral_1h_input_tokens || 0;
            }
            if (usage.server_tool_use) {
              webSearchRequests +=
                usage.server_tool_use.web_search_requests || 0;
              webFetchRequests += usage.server_tool_use.web_fetch_requests || 0;
            }
          }
        }

        // ALWAYS scan content blocks for tool_use and thinking — even on duplicate message IDs
        // because streaming chunks spread tool_use blocks across multiple entries
        const msg = entry.message;
        if (Array.isArray(msg.content)) {
          for (const block of msg.content) {
            if (typeof block !== "object" || block === null) continue;
            const b = block as Record<string, unknown>;
            if (b.type === "thinking") hasThinking = true;
            if (
              b.type === "text" &&
              typeof b.text === "string" &&
              b.text.trim()
            ) {
              responseTextParts.push(b.text.trim());
            }
            if (b.type === "tool_use") {
              const toolId = String(b.id || uuid());
              if (seenToolIds.has(toolId)) continue; // skip duplicate streaming chunks
              seenToolIds.add(toolId);

              const toolName = String(b.name || "unknown");
              let inputSummary: string | null = null;

              if (b.input && typeof b.input === "object") {
                const inp = b.input as Record<string, unknown>;
                if (inp.file_path)
                  inputSummary = String(inp.file_path).slice(0, 200);
                else if (inp.command)
                  inputSummary = String(inp.command).slice(0, 200);
                else if (inp.pattern)
                  inputSummary = String(inp.pattern).slice(0, 200);
                else if (inp.prompt)
                  inputSummary = String(inp.prompt).slice(0, 100);
              }

              toolUses.push({
                id: toolId,
                tool_name: toolName,
                input_summary: inputSummary,
                is_error: false,
                timestamp: entry.timestamp || null,
              });
            }
          }
        }
      }
    }

    // Calculate duration from timestamps
    let durationMs: number | null = null;
    if (responseTimestamp && userMsg.entry.timestamp) {
      durationMs =
        new Date(responseTimestamp).getTime() -
        new Date(userMsg.entry.timestamp).getTime();
      if (durationMs < 0) durationMs = null;
    }

    // Match turn_duration entries to this turn by timestamp proximity
    // The turn_duration entry follows the turn's response, so find the one
    // whose timestamp is closest after the response timestamp
    let actualDurationMs: number | null = null;
    let messageCount: number | null = null;
    if (responseTimestamp) {
      const responseTime = new Date(responseTimestamp).getTime();
      const nextUserTime =
        i + 1 < userMessages.length && userMessages[i + 1].entry.timestamp
          ? new Date(userMessages[i + 1].entry.timestamp!).getTime()
          : Infinity;

      for (const td of turnDurations) {
        const tdTime = new Date(td.timestamp).getTime();
        if (tdTime >= responseTime && tdTime <= nextUserTime) {
          actualDurationMs = td.durationMs;
          messageCount = td.messageCount;
          break;
        }
      }
    }

    // Build response_text from collected text blocks, truncated to 2000 chars
    const rawResponseText = responseTextParts.join("\n\n");
    const responseText = rawResponseText
      ? rawResponseText.slice(0, 2000)
      : null;

    turns.push({
      id: userMsg.promptId || uuid(),
      turn_index: i,
      prompt_text: promptText,
      response_text: responseText,
      prompt_timestamp: userMsg.entry.timestamp || startedAt,
      response_timestamp: responseTimestamp,
      duration_ms: durationMs,
      actual_duration_ms: actualDurationMs,
      message_count: messageCount,
      model,
      input_tokens: totalInput,
      output_tokens: totalOutput,
      cache_creation_tokens: totalCacheCreate,
      cache_read_tokens: totalCacheRead,
      stop_reason: stopReason,
      has_thinking: hasThinking,
      service_tier: serviceTier,
      inference_speed: inferenceSpeed,
      cache_5m_tokens: cache5mTokens,
      cache_1h_tokens: cache1hTokens,
      web_search_requests: webSearchRequests,
      web_fetch_requests: webFetchRequests,
      tool_uses: toolUses,
    });
  }

  // Collect file changes from file-history-snapshot entries
  const fileChanges = new Set<string>();
  for (const entry of entries) {
    if (entry.type === "file-history-snapshot") {
      const snapshot = (entry as unknown as Record<string, unknown>).snapshot;
      if (snapshot && typeof snapshot === "object") {
        for (const filePath of Object.keys(
          snapshot as Record<string, unknown>,
        )) {
          fileChanges.add(filePath);
        }
      }
    }
  }

  // Aggregate session-level web search/fetch totals
  let totalWebSearches = 0;
  let totalWebFetches = 0;
  for (const turn of turns) {
    totalWebSearches += turn.web_search_requests;
    totalWebFetches += turn.web_fetch_requests;
  }

  // Collect compact_boundary events
  const compactEvents: {
    trigger: string;
    pre_tokens: number;
    content_length: number;
    timestamp: string;
  }[] = [];
  for (const entry of entries) {
    if (entry.type === "system" && entry.subtype === "compact_boundary") {
      const meta = (entry as unknown as Record<string, unknown>)
        .compactMetadata as Record<string, unknown> | undefined;
      const content = (entry as unknown as Record<string, unknown>).content;
      compactEvents.push({
        trigger: String(meta?.trigger || "unknown"),
        pre_tokens: Number(meta?.preTokens || 0),
        content_length: typeof content === "string" ? content.length : 0,
        timestamp: entry.timestamp || "",
      });
    }
  }

  // Compute active vs idle time from prompt intervals
  // Active = intervals between consecutive prompts that are < 5 minutes
  // Idle = intervals >= 5 minutes (user stepped away)
  let codingActiveMs = 0;
  let codingIdleMs = 0;
  const IDLE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  for (let i = 1; i < turns.length; i++) {
    const prevTime = new Date(turns[i - 1].prompt_timestamp).getTime();
    const currTime = new Date(turns[i].prompt_timestamp).getTime();
    const gap = currTime - prevTime;
    if (gap > 0 && gap < IDLE_THRESHOLD_MS) {
      codingActiveMs += gap;
    } else if (gap >= IDLE_THRESHOLD_MS) {
      codingIdleMs += gap;
    }
  }

  return {
    id: sessionId,
    cwd,
    git_branch: gitBranch,
    version,
    entrypoint,
    started_at: startedAt,
    ended_at: endedAt,
    is_agent_session: isAgentSession,
    slug,
    stop_reason: sessionStopReason,
    total_web_searches: totalWebSearches,
    total_web_fetches: totalWebFetches,
    parent_session_id: null,
    agent_name: null,
    turns,
    file_changes: Array.from(fileChanges),
    hook_executions: hookExecutions,
    compact_events: compactEvents,
    coding_active_ms: codingActiveMs,
    coding_idle_ms: codingIdleMs,
  };
}

export function getToolInputSummary(
  toolName: string,
  toolUse: ParsedToolUse,
): string | null {
  return toolUse.input_summary;
}

export function categorizeTool(toolName: string): string {
  return getToolCategory(toolName);
}
