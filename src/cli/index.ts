#!/usr/bin/env node

import { Command } from "commander";
import { setupCommand } from "./setup";
import { hookSessionEnd } from "./hook-session-end";

const program = new Command();

program
  .name("dev-tracker")
  .description("Multi-machine Claude Code usage tracker")
  .version("0.2.0");

program
  .command("setup")
  .description(
    "Configure this machine to send session data to a dev-tracker server",
  )
  .requiredOption(
    "--server <url>",
    "Server URL (e.g., http://192.168.1.10:3020)",
  )
  .requiredOption("--key <key>", "API key from the server")
  .option("--label <label>", "Human-readable label for this machine")
  .action(setupCommand);

const hookCmd = program
  .command("hook")
  .description("Hook handlers (called by Claude Code, not directly)");

hookCmd
  .command("session-end")
  .description("Process session-end hook data from stdin")
  .action(hookSessionEnd);

program
  .command("start")
  .description("Start the dev-tracker server")
  .option("--port <port>", "Port to listen on", "3020")
  .action(async (opts) => {
    const { execSync } = await import("child_process");
    const path = await import("path");
    const serverDir = path.resolve(__dirname, "..");
    try {
      execSync(`node ${path.join(serverDir, ".next/standalone/server.js")}`, {
        stdio: "inherit",
        env: { ...process.env, PORT: opts.port, HOSTNAME: "0.0.0.0" },
        cwd: serverDir,
      });
    } catch {
      console.error("Failed to start server. Run 'npm run build' first.");
      process.exit(1);
    }
  });

program.parse();
