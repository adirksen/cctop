import type { ActiveSession, AgentInfo } from "../types.js";
import { readAgents } from "../data/agent-reader.js";

/**
 * Collect subagents across the given sessions.
 *
 * Sessions already carry the project directory resolved during aggregation, so
 * this reuses it rather than re-deriving the encoded path per session.
 */
export async function aggregateAgents(
  sessions: ActiveSession[]
): Promise<AgentInfo[]> {
  const perSession = await Promise.all(
    sessions.map((session) =>
      readAgents(session.encodedProjectDir, session.sessionId)
    )
  );

  return perSession.flat();
}
