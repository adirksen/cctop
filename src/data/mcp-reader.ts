import { readFile } from "node:fs/promises";
import { PATHS } from "../config.js";
import type { McpAuthEntry } from "../types.js";

/** Read MCP servers that need authentication. */
export async function readMcpAuthIssues(): Promise<McpAuthEntry[]> {
  try {
    const content = await readFile(PATHS.mcpAuth, "utf-8");
    const data = JSON.parse(content) as Record<
      string,
      { timestamp: number }
    >;

    return Object.entries(data).map(([name, value]) => ({
      name,
      timestamp: value.timestamp,
    }));
  } catch {
    return [];
  }
}
