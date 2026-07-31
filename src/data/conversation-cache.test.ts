import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, appendFile, writeFile, open, utimes, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readJsonlCached,
  invalidate,
  cachedFileCount,
} from "./conversation-cache.js";

// Each test gets its own temp dir + file path since the cache is module-global.
async function makeTempFile(): Promise<{ dir: string; file: string }> {
  const dir = await mkdtemp(join(tmpdir(), "cctop-cache-test-"));
  const file = join(dir, "transcript.jsonl");
  return { dir, file };
}

function entry(uuid: string): string {
  return JSON.stringify({
    type: "user",
    uuid,
    parentUuid: null,
    timestamp: new Date().toISOString(),
    sessionId: "session-1",
    isSidechain: false,
  });
}

const dirsToClean: string[] = [];

afterEach(async () => {
  while (dirsToClean.length > 0) {
    const dir = dirsToClean.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

describe("readJsonlCached", () => {
  it("parses all complete lines on first read", async () => {
    const { dir, file } = await makeTempFile();
    dirsToClean.push(dir);
    await writeFile(file, `${entry("a")}\n${entry("b")}\n${entry("c")}\n`);

    const entries = await readJsonlCached(file);

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.uuid)).toEqual(["a", "b", "c"]);
  });

  it("returns an empty array for a missing file without throwing", async () => {
    const { dir } = await makeTempFile();
    dirsToClean.push(dir);
    const missing = join(dir, "does-not-exist.jsonl");

    await expect(readJsonlCached(missing)).resolves.toEqual([]);
  });

  it("returns the same array reference on a second read of an unchanged file", async () => {
    const { dir, file } = await makeTempFile();
    dirsToClean.push(dir);
    await writeFile(file, `${entry("a")}\n${entry("b")}\n`);

    const first = await readJsonlCached(file);
    const second = await readJsonlCached(file);

    expect(second).toEqual(first);
    expect(second).toBe(first);
  });

  it("parses only appended bytes and preserves prior entries", async () => {
    const { dir, file } = await makeTempFile();
    dirsToClean.push(dir);
    await writeFile(file, `${entry("a")}\n${entry("b")}\n`);

    const first = await readJsonlCached(file);
    expect(first).toHaveLength(2);

    await appendFile(file, `${entry("c")}\n${entry("d")}\n${entry("e")}\n`);
    const second = await readJsonlCached(file);

    expect(second).toHaveLength(5);
    expect(second.map((e) => e.uuid)).toEqual(["a", "b", "c", "d", "e"]);
    // The first two entries (same objects) are preserved at the front.
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });

  it("does not parse or lose an unterminated trailing line, then picks it up once completed", async () => {
    const { dir, file } = await makeTempFile();
    dirsToClean.push(dir);
    // Two complete lines, then an unterminated third (no trailing newline).
    await writeFile(
      file,
      `${entry("a")}\n${entry("b")}\n{"type":"user","uuid":"c","partial":true`
    );

    const first = await readJsonlCached(file);
    expect(first).toHaveLength(2);
    expect(first.map((e) => e.uuid)).toEqual(["a", "b"]);

    // Complete the third line.
    await appendFile(file, `,"finished":true}\n`);
    const second = await readJsonlCached(file);

    expect(second).toHaveLength(3);
    expect(second[2]!.uuid).toBe("c");
  });

  it("never splits a multi-byte UTF-8 character across a partial-line read", async () => {
    const { dir, file } = await makeTempFile();
    dirsToClean.push(dir);

    const firstLine = `${entry("a")}\n`;
    // "🪙" is a 4-byte UTF-8 character (surrogate pair in UTF-16).
    const coinLine = JSON.stringify({
      type: "user",
      uuid: "b",
      parentUuid: null,
      timestamp: new Date().toISOString(),
      sessionId: "session-1",
      isSidechain: false,
      slug: "🪙 coin",
    });
    const coinLineBuf = Buffer.from(coinLine, "utf-8");
    const emojiIndex = coinLine.indexOf("🪙");
    // Byte offset of the emoji within the JSON string, then cut 1 byte into
    // its 4-byte encoding so the split lands mid-character.
    const emojiByteOffset = Buffer.byteLength(
      coinLine.slice(0, emojiIndex),
      "utf-8"
    );
    const cutAt = emojiByteOffset + 1;

    const initialBuf = Buffer.concat([
      Buffer.from(firstLine, "utf-8"),
      coinLineBuf.subarray(0, cutAt),
    ]);
    await writeFile(file, initialBuf);

    const first = await readJsonlCached(file);
    // The trailing (unterminated, mid-character) line must not be parsed.
    expect(first).toHaveLength(1);
    expect(first[0]!.uuid).toBe("a");

    // Append the rest of the emoji line's bytes plus the terminating newline.
    const rest = Buffer.concat([
      coinLineBuf.subarray(cutAt),
      Buffer.from("\n", "utf-8"),
    ]);
    const handle = await open(file, "a");
    await handle.write(rest);
    await handle.close();

    const second = await readJsonlCached(file);
    expect(second).toHaveLength(2);
    expect(second[1]!.uuid).toBe("b");
    expect(second[1]!.slug).toBe("🪙 coin");
  });

  it("re-reads fully when the file is truncated and rewritten shorter", async () => {
    const { dir, file } = await makeTempFile();
    dirsToClean.push(dir);
    await writeFile(file, `${entry("a")}\n${entry("b")}\n${entry("c")}\n`);

    const first = await readJsonlCached(file);
    expect(first).toHaveLength(3);

    // Rewrite with different, shorter content (simulates truncate + rewrite).
    await writeFile(file, `${entry("z")}\n`);
    const second = await readJsonlCached(file);

    expect(second).toHaveLength(1);
    expect(second[0]!.uuid).toBe("z");
  });

  it("re-parses correctly after invalidate, and cachedFileCount reflects removal/re-addition", async () => {
    const { dir, file } = await makeTempFile();
    dirsToClean.push(dir);
    await writeFile(file, `${entry("a")}\n${entry("b")}\n`);

    const before = cachedFileCount();
    await readJsonlCached(file);
    expect(cachedFileCount()).toBe(before + 1);

    invalidate(file);
    expect(cachedFileCount()).toBe(before);

    const reread = await readJsonlCached(file);
    expect(reread).toHaveLength(2);
    expect(reread.map((e) => e.uuid)).toEqual(["a", "b"]);
    expect(cachedFileCount()).toBe(before + 1);
  });

  it("skips malformed lines while keeping valid ones, end-to-end through the cache", async () => {
    const { dir, file } = await makeTempFile();
    dirsToClean.push(dir);
    await writeFile(
      file,
      `${entry("a")}\nnot valid json\n${entry("b")}\n   \n${entry("c")}\n`
    );

    const entries = await readJsonlCached(file);

    expect(entries).toHaveLength(3);
    expect(entries.map((e) => e.uuid)).toEqual(["a", "b", "c"]);
  });

  it("still returns correct content when mtime changes but size does not", async () => {
    const { dir, file } = await makeTempFile();
    dirsToClean.push(dir);
    await writeFile(file, `${entry("a")}\n${entry("b")}\n`);

    const first = await readJsonlCached(file);

    // Bump mtime without changing size or content, via fs.utimes rather than
    // a real sleep (mtime granularity is coarse on some filesystems). Since
    // (mtime, size) no longer both match, this skips the cache-hit
    // short-circuit and falls back to a full re-parse — content must still
    // come out correct even though it's not the identical array reference.
    const info = await stat(file);
    const bumped = new Date(info.mtimeMs + 5000);
    await utimes(file, bumped, bumped);

    const second = await readJsonlCached(file);

    expect(second).toEqual(first);
  });
});
