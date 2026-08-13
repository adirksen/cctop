import { open, stat } from "node:fs/promises";
import { parseJsonlChunk } from "../util/jsonl.js";
import type { ConversationEntry } from "../types.js";

interface CachedFile {
  entries: ConversationEntry[];
  /** Byte offset just past the last complete line parsed. */
  offset: number;
  /** File size at that read. Tracked separately from `offset`, which stops at
   *  the last newline — a transcript whose final line is still being written
   *  has `offset < size` indefinitely and must not be re-read every cycle. */
  size: number;
  mtimeMs: number;
}

const cache = new Map<string, CachedFile>();

const NEWLINE = 0x0a;

/**
 * Read a JSONL transcript, reusing previously parsed entries.
 *
 * Transcripts are append-only and can reach tens of megabytes, while a refresh
 * cycle touches every one of them. Re-reading each file per cycle dominated
 * claudetui's cost, so entries are cached and validated against (mtime, size):
 * unchanged files return immediately, and a grown file parses only the bytes
 * appended since the last read.
 *
 * The stored offset always lands on a line boundary, so a partially written
 * trailing line is left for the next read rather than being parsed and lost —
 * and a chunk boundary can never split a multi-byte character.
 */
export async function readJsonlCached(
  filePath: string
): Promise<ConversationEntry[]> {
  let size: number;
  let mtimeMs: number;
  try {
    const info = await stat(filePath);
    size = info.size;
    mtimeMs = info.mtimeMs;
  } catch {
    cache.delete(filePath);
    return [];
  }

  const cached = cache.get(filePath);

  // Untouched since the last read.
  if (cached && cached.mtimeMs === mtimeMs && cached.size === size) {
    return cached.entries;
  }

  // Appended to: parse only the new bytes.
  if (cached && size > cached.offset) {
    const appended = await readRange(filePath, cached.offset, size);
    if (appended) {
      cached.entries.push(...parseJsonlChunk<ConversationEntry>(appended.text));
      cached.offset += appended.bytesConsumed;
      cached.size = size;
      cached.mtimeMs = mtimeMs;
      return cached.entries;
    }
  }

  // First read, or the file shrank (truncated/rewritten) — start over.
  const full = await readRange(filePath, 0, size);
  if (!full) {
    cache.delete(filePath);
    return [];
  }

  const entries = parseJsonlChunk<ConversationEntry>(full.text);
  cache.set(filePath, {
    entries,
    offset: full.bytesConsumed,
    size,
    mtimeMs,
  });
  return entries;
}

/** Drop a file from the cache (e.g. after a delete). */
export function invalidate(filePath: string): void {
  cache.delete(filePath);
}

/** Current number of cached transcripts — used for diagnostics. */
export function cachedFileCount(): number {
  return cache.size;
}

/**
 * Read `[start, end)` and truncate at the final newline so only complete lines
 * are returned. `bytesConsumed` is the length actually parsed, which the caller
 * adds to its offset.
 */
async function readRange(
  filePath: string,
  start: number,
  end: number
): Promise<{ text: string; bytesConsumed: number } | undefined> {
  const length = end - start;
  if (length <= 0) return { text: "", bytesConsumed: 0 };

  let handle;
  try {
    handle = await open(filePath, "r");
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, start);
    if (bytesRead <= 0) return { text: "", bytesConsumed: 0 };

    const lastNewline = buffer.lastIndexOf(NEWLINE, bytesRead - 1);
    if (lastNewline < 0) {
      // No complete line in this chunk — wait for the writer to finish it.
      return { text: "", bytesConsumed: 0 };
    }

    return {
      text: buffer.subarray(0, lastNewline + 1).toString("utf-8"),
      bytesConsumed: lastNewline + 1,
    };
  } catch {
    return undefined;
  } finally {
    await handle?.close().catch(() => {});
  }
}
