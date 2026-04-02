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
    if (res.status === 409) return true;
    return res.ok;
  } catch {
    return false;
  }
}

export async function hookSessionEnd(): Promise<void> {
  try {
    if (!fs.existsSync(CONFIG_PATH)) {
      log("ERROR: No config found. Run 'dev-tracker setup' first.");
      process.exit(1);
    }
    const config: Config = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));

    // Flush queued payloads first
    const queued = getQueuedPayloads();
    for (const item of queued) {
      const sent = await sendPayload(
        config.server_url,
        config.api_key,
        item.payload,
      );
      if (sent) {
        removeQueuedPayload(item.path);
        log(`Flushed queued session: ${path.basename(item.path, ".json")}`);
      }
    }

    // Read stdin
    const stdinData = fs.readFileSync(0, "utf-8");
    const hookData: HookStdin = JSON.parse(stdinData);

    if (!hookData.transcript_path || !hookData.session_id) {
      log("ERROR: Missing transcript_path or session_id in hook data");
      process.exit(0);
    }

    const { parseJsonlFile } = await import("../lib/jsonl-parser");
    const parsed = await parseJsonlFile(
      hookData.transcript_path,
      hookData.session_id,
    );

    if (!parsed || parsed.turns.length === 0) {
      log(`WARN: No turns parsed for session ${hookData.session_id}`);
      process.exit(0);
    }

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
          equivalent_cost_usd: 0,
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

    const sent = await sendPayload(config.server_url, config.api_key, payload);

    if (sent) {
      log(`Session ${hookData.session_id} sent successfully`);
    } else {
      queuePayload(hookData.session_id, payload);
      log(`Session ${hookData.session_id} queued (server unreachable)`);
    }

    process.exit(0);
  } catch (err) {
    log(`ERROR: ${(err as Error).message}`);
    process.exit(0);
  }
}
