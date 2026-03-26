import type { ActiveSession } from "../types.js";
import { readSessionsWithLiveness } from "../data/session-reader.js";
import {
  readConversation,
  extractTokenUsage,
  extractModel,
  countMessages,
} from "../data/conversation-reader.js";
import { readAgents } from "../data/agent-reader.js";
import {
  encodeProjectPath,
  listProjectDirs,
} from "../data/claude-home.js";
import { basename } from "node:path";

/** Build a full ActiveSession list with conversation stats. */
export async function aggregateSessions(): Promise<ActiveSession[]> {
  const sessions = await readSessionsWithLiveness();
  const projectDirs = await listProjectDirs();

  return Promise.all(
    sessions.map(async (session) => {
      const encodedCwd = encodeProjectPath(session.cwd);
      // Find matching project directory (could include worktree variants)
      const matchedProject =
        projectDirs.find((d) => d === encodedCwd) ??
        projectDirs.find((d) => d.startsWith(encodedCwd)) ??
        encodedCwd;

      const entries = await readConversation(matchedProject, session.sessionId);
      const agents = await readAgents(matchedProject, session.sessionId);

      return {
        ...session,
        projectName: basename(session.cwd),
        encodedProjectDir: matchedProject,
        duration: Date.now() - session.startedAt,
        messageCount: countMessages(entries),
        totalTokens: extractTokenUsage(entries),
        model: extractModel(entries),
        agentCount: agents.length,
      };
    })
  );
}

/** Get only alive sessions, sorted by start time (newest first). */
export async function getActiveSessions(): Promise<ActiveSession[]> {
  const all = await aggregateSessions();
  return all.filter((s) => s.isAlive).sort((a, b) => b.startedAt - a.startedAt);
}

/** Get all sessions (alive + dead), sorted by start time. */
export async function getAllSessions(): Promise<ActiveSession[]> {
  const all = await aggregateSessions();
  return all.sort((a, b) => b.startedAt - a.startedAt);
}
