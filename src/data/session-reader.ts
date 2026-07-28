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

/** Sessions idle longer than this are never considered alive. */
const ACTIVE_THRESHOLD_MS = 2 * 60 * 60 * 1000;

/** Most recently active sessions to track. */
const MAX_SESSIONS = 25;

/** Cap on external process-inspection commands. */
const PROBE_TIMEOUT_MS = 2_000;

export interface ClaudeProcess {
  pid: number;
  /** Working directory, when the platform can report it. */
  cwd?: string;
}

/**
 * Working directories of processes already looked up.
 *
 * A process's cwd is fixed in practice, and the lookup costs an lsof spawn, so
 * it is resolved once per PID and dropped when that PID disappears.
 */
const cwdByPid = new Map<number, string>();

/** Find running Claude Code processes, with working directories where available. */
export async function findClaudeProcesses(): Promise<ClaudeProcess[]> {
  const pids = await findClaudePids();
  if (pids.length === 0) {
    cwdByPid.clear();
    return [];
  }

  const live = new Set(pids);
  for (const pid of cwdByPid.keys()) {
    if (!live.has(pid)) cwdByPid.delete(pid);
  }

  const unknown = pids.filter((pid) => !cwdByPid.has(pid));
  if (unknown.length > 0) {
    for (const [pid, cwd] of await readProcessCwds(unknown)) {
      cwdByPid.set(pid, cwd);
    }
  }

  return pids.map((pid) => ({ pid, cwd: cwdByPid.get(pid) }));
}

/** Find running Claude Code PIDs on this platform. */
export async function findClaudePids(): Promise<number[]> {
  try {
    if (isWindows) {
      const { stdout } = await execFileAsync(
        "tasklist",
        ["/FI", "IMAGENAME eq claude.exe", "/FO", "CSV", "/NH"],
        { timeout: PROBE_TIMEOUT_MS }
      );
      return stdout
        .trim()
        .split("\n")
        .filter((line) => line.toLowerCase().includes("claude.exe"))
        .map((line) => {
          const parts = line.split(",");
          return parseInt(parts[1]?.replace(/"/g, "").trim() ?? "0", 10);
        })
        .filter((pid) => pid > 0);
    }

    const { stdout } = await execFileAsync("pgrep", ["-x", "claude"], {
      timeout: PROBE_TIMEOUT_MS,
    });
    return stdout
      .trim()
      .split("\n")
      .map(Number)
      .filter((n) => n > 0);
  } catch {
    return [];
  }
}

/**
 * Map PIDs to working directories via lsof.
 *
 * Returns an empty map when unavailable (Windows has no equivalent that reports
 * a process's cwd), which callers treat as "cannot attribute" rather than
 * guessing.
 */
async function readProcessCwds(pids: number[]): Promise<Map<number, string>> {
  const cwds = new Map<number, string>();
  if (isWindows) return cwds;

  try {
    const { stdout } = await execFileAsync(
      "lsof",
      ["-a", "-d", "cwd", "-p", pids.join(","), "-Fpn"],
      { timeout: PROBE_TIMEOUT_MS }
    );

    // Field-mode output: a "p<pid>" line, then "n<path>" for its cwd.
    let currentPid = 0;
    for (const line of stdout.split("\n")) {
      if (line.startsWith("p")) {
        currentPid = parseInt(line.slice(1), 10) || 0;
      } else if (line.startsWith("n") && currentPid > 0) {
        cwds.set(currentPid, line.slice(1));
        currentPid = 0;
      }
    }
  } catch {
    // lsof missing, restricted, or timed out — fall back to no attribution.
  }

  return cwds;
}

/**
 * Derive session records from history.jsonl.
 *
 * Claude Code no longer writes ~/.claude/sessions/*.json, so sessions are
 * reconstructed from history entries, which record a sessionId and project path
 * per command.
 */
export async function readSessions(): Promise<SessionFile[]> {
  const history = await historyReader.readAll();

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

  return Array.from(sessionMap.entries())
    .sort((a, b) => b[1].lastSeen - a[1].lastSeen)
    .slice(0, MAX_SESSIONS)
    .map(([sessionId, info]) => ({
      pid: 0, // Assigned in readSessionsWithLiveness
      sessionId,
      cwd: info.project,
      startedAt: info.firstSeen,
      lastSeenAt: info.lastSeen,
      kind: "interactive" as const,
    }));
}

/**
 * Read sessions and attach the process each one is running in.
 *
 * Sessions are matched to processes by working directory. Where two processes
 * share a directory, the more recently active sessions in that directory claim
 * them. A session with no matching process reports pid 0 and is not alive.
 *
 * When the platform can't report working directories, no PID is shown at all —
 * liveness falls back to "a Claude process exists and this session was active
 * recently", which is a guess, and pairing a guess with a concrete-looking PID
 * would misattribute one session's process to another.
 */
export async function readSessionsWithLiveness(): Promise<
  Array<SessionFile & { isAlive: boolean }>
> {
  const [sessions, processes] = await Promise.all([
    readSessions(),
    findClaudeProcesses(),
  ]);

  const now = Date.now();
  const recentlyActive = (s: SessionFile): boolean =>
    now - (s.lastSeenAt ?? s.startedAt) < ACTIVE_THRESHOLD_MS;

  const canAttribute = processes.some((p) => p.cwd);
  if (!canAttribute) {
    const liveCount = Math.min(processes.length, sessions.length);
    return sessions.map((session, idx) => ({
      ...session,
      pid: 0,
      isAlive: idx < liveCount && recentlyActive(session),
    }));
  }

  // Group unclaimed PIDs by working directory.
  const available = new Map<string, number[]>();
  for (const proc of processes) {
    if (!proc.cwd) continue;
    const list = available.get(proc.cwd) ?? [];
    list.push(proc.pid);
    available.set(proc.cwd, list);
  }

  // Sessions are already newest-first, so the most recent claims each PID.
  return sessions.map((session) => {
    const pid = available.get(session.cwd)?.shift() ?? 0;
    return {
      ...session,
      pid,
      isAlive: pid > 0 && recentlyActive(session),
    };
  });
}
