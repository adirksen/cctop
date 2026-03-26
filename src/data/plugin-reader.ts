import { readFile } from "node:fs/promises";
import { PATHS } from "../config.js";
import type { InstalledPlugin } from "../types.js";

/**
 * Read the installed plugins registry.
 * File format: { version: 2, plugins: { "name@scope": [{ scope, installPath, version, ... }] } }
 */
export async function readInstalledPlugins(): Promise<InstalledPlugin[]> {
  try {
    const content = await readFile(PATHS.plugins, "utf-8");
    const data = JSON.parse(content) as {
      version?: number;
      plugins?: Record<string, Array<{ scope: string; version: string; installPath: string; installedAt: string; lastUpdated: string; gitCommitSha?: string }>>;
    };

    const pluginsMap = data.plugins;
    if (!pluginsMap || typeof pluginsMap !== "object") return [];

    const result: InstalledPlugin[] = [];
    for (const [key, entries] of Object.entries(pluginsMap)) {
      if (!Array.isArray(entries)) continue;
      // key is "name@scope" e.g. "typescript-lsp@claude-plugins-official"
      const name = key.split("@")[0] ?? key;
      const scope = key.split("@")[1] ?? "";
      for (const entry of entries) {
        result.push({
          name,
          scope: entry.scope ?? scope,
          version: entry.version ?? "?",
          installPath: entry.installPath ?? "",
          installedAt: entry.installedAt ?? "",
          lastUpdated: entry.lastUpdated ?? "",
          gitCommitSha: entry.gitCommitSha,
        });
      }
    }

    return result;
  } catch {
    return [];
  }
}
