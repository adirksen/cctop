import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { PATHS } from "../config.js";
import type { AgentInfo, AgentMeta } from "../types.js";
import { extractTokenUsage } from "./conversation-reader.js";
import { readJsonlCached } from "./conversation-cache.js";

/** Get the subagents directory for a session. */
function subagentsDir(encodedProject: string, sessionId: string): string {
  return join(PATHS.projects, encodedProject, sessionId, "subagents");
}

/** Read all agent info for a given session. */
export async function readAgents(
  encodedProject: string,
  sessionId: string
): Promise<AgentInfo[]> {
  const dir = subagentsDir(encodedProject, sessionId);

  try {
    const files = await readdir(dir);
    const metaFiles = files.filter((f) => f.endsWith(".meta.json"));

    return Promise.all(
      metaFiles.map(async (metaFile) => {
        const agentId = metaFile.replace(".meta.json", "").replace("agent-", "");
        const meta = await readAgentMeta(dir, metaFile);
        const jsonlFile = metaFile.replace(".meta.json", ".jsonl");
        const entries = await readJsonlCached(join(dir, jsonlFile));

        return {
          agentId,
          sessionId,
          agentType: meta.agentType,
          description: meta.description,
          messageCount: entries.length,
          totalTokens: extractTokenUsage(entries),
        };
      })
    );
  } catch {
    return [];
  }
}

/**
 * Agent metadata is written once when the subagent spawns, so it is cached by
 * path and revalidated against mtime rather than re-read every refresh.
 */
const metaCache = new Map<string, { meta: AgentMeta; mtimeMs: number }>();

async function readAgentMeta(
  dir: string,
  metaFile: string
): Promise<AgentMeta> {
  const path = join(dir, metaFile);
  try {
    const { mtimeMs } = await stat(path);
    const cached = metaCache.get(path);
    if (cached && cached.mtimeMs === mtimeMs) return cached.meta;

    const content = await readFile(path, "utf-8");
    const meta = JSON.parse(content) as AgentMeta;
    metaCache.set(path, { meta, mtimeMs });
    return meta;
  } catch {
    return { agentType: "unknown", description: "" };
  }
}
