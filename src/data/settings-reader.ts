import { readFile } from "node:fs/promises";
import { PATHS } from "../config.js";
import type { ClaudeSettings } from "../types.js";

/** Read Claude Code settings. */
export async function readSettings(): Promise<ClaudeSettings> {
  try {
    const content = await readFile(PATHS.settings, "utf-8");
    return JSON.parse(content) as ClaudeSettings;
  } catch {
    return {};
  }
}
