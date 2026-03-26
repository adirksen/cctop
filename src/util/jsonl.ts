import { readFile, stat } from "node:fs/promises";

/**
 * Tracks byte offset into a JSONL file so we only read new lines on subsequent calls.
 */
export class JsonlReader<T> {
  private offset = 0;

  constructor(private readonly filePath: string) {}

  /** Read all lines from the beginning. */
  async readAll(): Promise<T[]> {
    this.offset = 0;
    return this.readNew();
  }

  /** Read only lines appended since the last read. */
  async readNew(): Promise<T[]> {
    try {
      const fileStat = await stat(this.filePath);
      if (fileStat.size <= this.offset) return [];

      const buffer = await readFile(this.filePath);
      const chunk = buffer.subarray(this.offset).toString("utf-8");
      this.offset = fileStat.size;

      return parseJsonlChunk<T>(chunk);
    } catch {
      return [];
    }
  }

  /** Reset offset to re-read from beginning next time. */
  reset(): void {
    this.offset = 0;
  }
}

/** Parse a chunk of JSONL text into typed objects, skipping malformed lines. */
export function parseJsonlChunk<T>(chunk: string): T[] {
  const results: T[] = [];
  const lines = chunk.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      results.push(JSON.parse(trimmed) as T);
    } catch {
      // Skip malformed lines
    }
  }

  return results;
}
