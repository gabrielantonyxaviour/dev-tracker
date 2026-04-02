import fs from "fs";
import path from "path";
import os from "os";

const QUEUE_DIR = path.join(os.homedir(), ".dev-tracker", "queue");

export function queuePayload(sessionId: string, payload: unknown): void {
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
  const filePath = path.join(QUEUE_DIR, `${sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload));
}

export function getQueuedPayloads(): Array<{ path: string; payload: unknown }> {
  if (!fs.existsSync(QUEUE_DIR)) return [];
  const files = fs.readdirSync(QUEUE_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const filePath = path.join(QUEUE_DIR, f);
    return {
      path: filePath,
      payload: JSON.parse(fs.readFileSync(filePath, "utf-8")),
    };
  });
}

export function removeQueuedPayload(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // already removed
  }
}
