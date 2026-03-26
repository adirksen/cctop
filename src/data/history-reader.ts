import { PATHS } from "../config.js";
import type { HistoryEntry } from "../types.js";
import { JsonlReader } from "../util/jsonl.js";

const reader = new JsonlReader<HistoryEntry>(PATHS.history);

/** Read all history entries from ~/.claude/history.jsonl. */
export async function readAllHistory(): Promise<HistoryEntry[]> {
  return reader.readAll();
}

/** Read only new history entries since last read. */
export async function readNewHistory(): Promise<HistoryEntry[]> {
  return reader.readNew();
}

/** Get the N most recent history entries. */
export async function getRecentHistory(n: number): Promise<HistoryEntry[]> {
  const all = await readAllHistory();
  return all.slice(-n);
}
