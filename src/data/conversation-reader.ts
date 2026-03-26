import { join } from "node:path";
import { PATHS } from "../config.js";
import type { ConversationEntry, TokenUsage } from "../types.js";
import { JsonlReader } from "../util/jsonl.js";

const readers = new Map<string, JsonlReader<ConversationEntry>>();

function getReader(
  encodedProject: string,
  sessionId: string
): JsonlReader<ConversationEntry> {
  const key = `${encodedProject}/${sessionId}`;
  let reader = readers.get(key);
  if (!reader) {
    const filePath = join(
      PATHS.projects,
      encodedProject,
      `${sessionId}.jsonl`
    );
    reader = new JsonlReader<ConversationEntry>(filePath);
    readers.set(key, reader);
  }
  return reader;
}

/** Read all conversation entries for a session. */
export async function readConversation(
  encodedProject: string,
  sessionId: string
): Promise<ConversationEntry[]> {
  return getReader(encodedProject, sessionId).readAll();
}

/** Read new conversation entries since last read. */
export async function readNewConversation(
  encodedProject: string,
  sessionId: string
): Promise<ConversationEntry[]> {
  return getReader(encodedProject, sessionId).readNew();
}

/** Extract token usage from conversation entries. */
export function extractTokenUsage(entries: ConversationEntry[]): TokenUsage {
  const total: TokenUsage = {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };

  for (const entry of entries) {
    if (entry.type === "assistant" && entry.message?.usage) {
      const u = entry.message.usage;
      total.input_tokens += u.input_tokens ?? 0;
      total.output_tokens += u.output_tokens ?? 0;
      total.cache_creation_input_tokens +=
        u.cache_creation_input_tokens ?? 0;
      total.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
    }
  }

  return total;
}

/** Extract the model name from the first assistant message that has one. */
export function extractModel(entries: ConversationEntry[]): string {
  for (const entry of entries) {
    if (entry.type === "assistant" && entry.message?.model) {
      return entry.message.model;
    }
  }
  return "unknown";
}

/** Count messages by type. */
export function countMessages(
  entries: ConversationEntry[],
  type?: ConversationEntry["type"]
): number {
  if (!type) return entries.length;
  return entries.filter((e) => e.type === type).length;
}
