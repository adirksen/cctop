import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PATHS } from "../config.js";
import { JsonlReader } from "../util/jsonl.js";
import type { HistoryEntry, SessionFile } from "../types.js";

// Dedicated reader instance — never share with history-reader.ts to avoid
// offset-tracking race conditions when both are called in Promise.all.
const historyReader = new JsonlReader<HistoryEntry>(PATHS.history);

const execFileAsync = promisify(execFile);
const isWindows = process.platform === "win32";

/** Find running Claude Code PIDs on this platform. */
export async function findClaudePids(): Promise<number[]> {
  try {
    if (isWindows) {
      const { stdout } = await execFileAsync("tasklist", [
        "/FI", "IMAGENAME eq claude.exe",
        "/FO", "CSV",
        "/NH",
      ]);
      return stdout.trim().split("\n")
        .filter((line) => line.toLowerCase().includes("claude.exe"))
        .map((line) => {
          const parts = line.split(",");
          return parseInt(parts[1]?.replace(/"/g, "").trim() ?? "0", 10);
        })
        .filter((pid) => pid > 0);
    } else {
      const { stdout } = await execFileAsync("pgrep", ["-x", "claude"]);
      return stdout.trim().split("\n").map(Number).filter((n) => n > 0);
    }
  } catch {
    return [];
  }
}

/**
 * Derive session records from history.jsonl + running Claude processes.
 *
 * Claude Code no longer writes ~/.claude/sessions/*.json in recent versions.
 * Instead we reconstruct sessions from history entries (which record sessionId
 * and project path per command) and match running claude.exe PIDs to the
 * most-recently-active sessions.
 */
export async function readSessions(): Promise<SessionFile[]> {
  const history = await historyReader.readAll();

  // Build map: sessionId → { project, firstSeen, lastSeen }
  const sessionMap = new Map<
    string,
    { project: string; firstSeen: number; lastSeen: number }
  >();

  for (const entry of history) {
    if (!entry.sessionId || !entry.project) continue;
    const existing = sessionMap.get(entry.sessionId);
    if (!existing) {
      sessionMap.set(entry.sessionId, {
        project: entry.project,
        firstSeen: entry.timestamp,
        lastSeen: entry.timestamp,
      });
    } else {
      if (entry.timestamp > existing.lastSeen) existing.lastSeen = entry.timestamp;
      if (entry.timestamp < existing.firstSeen) existing.firstSeen = entry.timestamp;
    }
  }

  // Sort by lastSeen descending (most recent activity first)
  return Array.from(sessionMap.entries())
    .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
    .slice(0, 25)
    .map(([sessionId, info]) => ({
      pid: 0, // Assigned in readSessionsWithLiveness
      sessionId,
      cwd: info.project,
      startedAt: info.firstSeen,
      lastSeenAt: info.lastSeen,
      kind: "interactive" as const,
    }));
}

/** Read sessions and check which PIDs are alive. */
export async function readSessionsWithLiveness(): Promise<
  Array<SessionFile & { isAlive: boolean }>
> {
  const [sessions, claudePids] = await Promise.all([
    readSessions(),
    findClaudePids(),
  ]);

  const now = Date.now();
  const ACTIVE_THRESHOLD = 2 * 60 * 60 * 1000; // 2 hours

  return sessions.map((session, idx) => {
    const lastActivity = session.lastSeenAt ?? session.startedAt;
    const recentEnough = now - lastActivity < ACTIVE_THRESHOLD;
    const isAlive = claudePids.length > 0 && idx < claudePids.length && recentEnough;
    return {
      ...session,
      pid: claudePids[idx] ?? claudePids[0] ?? 0,
      isAlive,
    };
  });
}
