import { watch, type FSWatcher } from "chokidar";
import { join } from "node:path";
import { PATHS } from "../config.js";
import { EventEmitter } from "node:events";

export type WatchEvent =
  | "sessions-changed"
  | "history-changed"
  | "conversation-changed"
  | "plugins-changed"
  | "settings-changed"
  | "mcp-changed";

/**
 * Watches ~/.claude/ for file changes and emits typed events
 * so aggregators and panels can refresh immediately.
 */
export class ClaudeFileWatcher extends EventEmitter {
  private watchers: FSWatcher[] = [];

  async start(): Promise<void> {
    // Watch session files (creation/removal = new/ended sessions)
    this.watchers.push(
      watch(join(PATHS.sessions, "*.json"), {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 300 },
      }).on("all", () => this.emit("sessions-changed"))
    );

    // Watch history.jsonl for new commands
    this.watchers.push(
      watch(PATHS.history, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 300 },
      }).on("change", () => this.emit("history-changed"))
    );

    // Watch project conversation files
    this.watchers.push(
      watch(join(PATHS.projects, "**", "*.jsonl"), {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500 },
        depth: 3,
      }).on("all", () => this.emit("conversation-changed"))
    );

    // Watch plugin and settings files
    this.watchers.push(
      watch(
        [PATHS.plugins, PATHS.settings, PATHS.mcpAuth].filter(Boolean),
        {
          ignoreInitial: true,
          awaitWriteFinish: { stabilityThreshold: 500 },
        }
      )
        .on("change", (path) => {
          if (path.includes("installed_plugins"))
            this.emit("plugins-changed");
          else if (path.includes("settings")) this.emit("settings-changed");
          else if (path.includes("mcp")) this.emit("mcp-changed");
        })
    );
  }

  async stop(): Promise<void> {
    await Promise.all(this.watchers.map((w) => w.close()));
    this.watchers = [];
  }
}
