import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { PATHS } from "../config.js";
import type { AgentInfo, AgentMeta, ConversationEntry } from "../types.js";
import { extractTokenUsage } from "./conversation-reader.js";
import { parseJsonlChunk } from "../util/jsonl.js";

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
        const entries = await readAgentEntries(dir, jsonlFile);

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

async function readAgentMeta(
  dir: string,
  metaFile: string
): Promise<AgentMeta> {
  try {
    const content = await readFile(join(dir, metaFile), "utf-8");
    return JSON.parse(content) as AgentMeta;
  } catch {
    return { agentType: "unknown", description: "" };
  }
}

async function readAgentEntries(
  dir: string,
  jsonlFile: string
): Promise<ConversationEntry[]> {
  try {
    const content = await readFile(join(dir, jsonlFile), "utf-8");
    return parseJsonlChunk<ConversationEntry>(content);
  } catch {
    return [];
  }
}
