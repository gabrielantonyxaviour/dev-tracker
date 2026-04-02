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
const CLAUDE_SETTINGS_PATH = path.join(
  os.homedir(),
  ".claude",
  "settings.json",
);

export async function setupCommand(opts: {
  server: string;
  key: string;
  label?: string;
}) {
  const hostname = os
    .hostname()
    .toLowerCase()
    .replace(/\.local$/, "");
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

  fs.mkdirSync(path.dirname(CLAUDE_SETTINGS_PATH), { recursive: true });
  fs.writeFileSync(
    CLAUDE_SETTINGS_PATH,
    JSON.stringify(claudeSettings, null, 2),
  );
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
      console.warn(
        `Warning: Server returned ${res.status}. Check your server URL and API key.`,
      );
    }
  } catch {
    console.warn(
      "Warning: Could not connect to server. Make sure it's running.",
    );
  }

  console.log(`\nSetup complete!`);
  console.log(`  Machine ID: ${machineId}`);
  console.log(`  Label: ${label}`);
  console.log(`  Server: ${opts.server}`);
  console.log(
    `\nSession data will be sent to the server when Claude Code sessions end.`,
  );
}
