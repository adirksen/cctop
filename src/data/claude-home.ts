import { readdir } from "node:fs/promises";
import { basename, sep } from "node:path";
import { PATHS } from "../config.js";

/**
 * Encode a filesystem path the way Claude Code does for project directories.
 * Replaces path separators and colons with dashes.
 * e.g. "C:\Users\adirksen\Dev" → "C--Users-adirksen-Dev"
 */
export function encodeProjectPath(fsPath: string): string {
  return fsPath.replace(/[:\\/]/g, "-");
}

/**
 * Decode an encoded project directory name back to a plausible filesystem path.
 * On Windows, the first segment looks like "C-" (from "C:"), rest uses backslashes.
 * On Unix, leading "-" becomes "/".
 */
export function decodeProjectPath(encoded: string): string {
  if (process.platform === "win32") {
    // Pattern: "C--Users-adirksen-..." → "C:\Users\adirksen\..."
    const match = /^([A-Z])-(-?.*)$/.exec(encoded);
    if (match?.[1] && match[2] !== undefined) {
      const drive = match[1];
      const rest = match[2].replace(/^-/, "").replace(/-/g, "\\");
      return `${drive}:\\${rest}`;
    }
  }
  // Unix: leading dash = root slash
  return encoded.replace(/^-/, "/").replace(/-/g, "/");
}

/** Extract a short project name from an encoded path (last meaningful segment). */
export function projectName(encoded: string): string {
  const decoded = decodeProjectPath(encoded);
  return basename(decoded);
}

/** List all encoded project directory names under ~/.claude/projects/. */
export async function listProjectDirs(): Promise<string[]> {
  try {
    const entries = await readdir(PATHS.projects, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }
}

/** List session JSONL files for a given encoded project path. */
export async function listSessionFiles(
  encodedProject: string
): Promise<string[]> {
  try {
    const projectDir = `${PATHS.projects}${sep}${encodedProject}`;
    const entries = await readdir(projectDir);
    return entries.filter((e) => e.endsWith(".jsonl"));
  } catch {
    return [];
  }
}
