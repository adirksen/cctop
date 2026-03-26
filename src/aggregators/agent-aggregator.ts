import type { AgentInfo } from "../types.js";
import { readAgents } from "../data/agent-reader.js";
import { encodeProjectPath, listProjectDirs } from "../data/claude-home.js";
import type { ActiveSession } from "../types.js";

/** Get all agents for active sessions. */
export async function aggregateAgents(
  sessions: ActiveSession[]
): Promise<AgentInfo[]> {
  const projectDirs = await listProjectDirs();
  const allAgents: AgentInfo[] = [];

  for (const session of sessions) {
    const encodedCwd = encodeProjectPath(session.cwd);
    const matchedProject =
      projectDirs.find((d) => d === encodedCwd) ??
      projectDirs.find((d) => d.startsWith(encodedCwd)) ??
      encodedCwd;

    const agents = await readAgents(matchedProject, session.sessionId);
    allAgents.push(...agents);
  }

  return allAgents;
}

/** Get agents grouped by session. */
export async function getAgentsBySession(
  sessions: ActiveSession[]
): Promise<Map<string, AgentInfo[]>> {
  const agents = await aggregateAgents(sessions);
  const bySession = new Map<string, AgentInfo[]>();

  for (const agent of agents) {
    const existing = bySession.get(agent.sessionId) ?? [];
    existing.push(agent);
    bySession.set(agent.sessionId, existing);
  }

  return bySession;
}
