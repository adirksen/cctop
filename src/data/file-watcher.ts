import { watch, type FSWatcher } from "chokidar";
import { EventEmitter } from "node:events";
import { PATHS } from "../config.js";

export type WatchEvent =
  | "history-changed"
  | "conversation-changed"
  | "plugins-changed"
  | "settings-changed"
  | "mcp-changed";

/**
 * Watches ~/.claude/ for file changes and emits typed events so aggregators and
 * panels can refresh immediately.
 *
 * chokidar 4 removed glob support: passing "dir/**\/*.jsonl" now watches a
 * literal path by that name, which never exists, so the watcher silently never
 * fires. Directories are watched directly instead and paths are filtered here.
 */
export class ClaudeFileWatcher extends EventEmitter {
  private watchers: FSWatcher[] = [];

  async start(): Promise<void> {
    // Conversation transcripts: ~/.claude/projects/<encoded-project>/<session>.jsonl
    // Subagent transcripts live one level deeper, hence depth 3.
    this.watchers.push(
      watch(PATHS.projects, {
        ignoreInitial: true,
        depth: 3,
        awaitWriteFinish: { stabilityThreshold: 500 },
      }).on("all", (_event, path) => {
        if (path.endsWith(".jsonl")) this.emit("conversation-changed");
      })
    );

    // history.jsonl gains a line per user command
    this.watchers.push(
      watch(PATHS.history, {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 300 },
      }).on("all", () => this.emit("history-changed"))
    );

    // Config files. These may not exist yet, so listen for "add" as well as
    // "change" — a plugin installed while cctop is running creates the file.
    this.watchers.push(
      watch([PATHS.plugins, PATHS.settings, PATHS.mcpAuth], {
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 500 },
      }).on("all", (_event, path) => {
        if (path.includes("installed_plugins")) this.emit("plugins-changed");
        else if (path.includes("mcp")) this.emit("mcp-changed");
        else if (path.includes("settings")) this.emit("settings-changed");
      })
    );

    // Surface watcher failures instead of degrading to poll-only silently.
    for (const w of this.watchers) {
      w.on("error", (err) =>
        this.emit("watch-error", err instanceof Error ? err : new Error(String(err)))
      );
    }
  }

  async stop(): Promise<void> {
    await Promise.all(this.watchers.map((w) => w.close()));
    this.watchers = [];
  }
}
