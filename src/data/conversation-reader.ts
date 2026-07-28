import { join } from "node:path";
import { PATHS } from "../config.js";
import type { ConversationEntry, TokenUsage } from "../types.js";
import { readJsonlCached } from "./conversation-cache.js";
import { addUsage, emptyUsage } from "../aggregators/token-aggregator.js";

/** Absolute path to a session's transcript. */
export function conversationPath(
  encodedProject: string,
  sessionId: string
): string {
  return join(PATHS.projects, encodedProject, `${sessionId}.jsonl`);
}

/** Read all conversation entries for a session. */
export async function readConversation(
  encodedProject: string,
  sessionId: string
): Promise<ConversationEntry[]> {
  return readJsonlCached(conversationPath(encodedProject, sessionId));
}

/** Extract token usage from conversation entries. */
export function extractTokenUsage(entries: ConversationEntry[]): TokenUsage {
  const total = emptyUsage();

  for (const entry of entries) {
    if (entry.type === "assistant" && entry.message?.usage) {
      addUsage(total, entry.message.usage);
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
