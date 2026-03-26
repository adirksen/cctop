import type { ProjectStats, TokenUsage } from "../types.js";
import {
  listProjectDirs,
  listSessionFiles,
  projectName,
} from "../data/claude-home.js";
import {
  readConversation,
  extractTokenUsage,
} from "../data/conversation-reader.js";

/** Aggregate activity stats across all projects. */
export async function aggregateProjects(): Promise<ProjectStats[]> {
  const dirs = await listProjectDirs();

  // Filter out worktree directories (they contain "--claude-worktrees-")
  const mainDirs = dirs.filter((d) => !d.includes("--claude-worktrees-"));

  const stats = await Promise.all(
    mainDirs.map(async (encodedPath) => {
      const sessionFiles = await listSessionFiles(encodedPath);
      const sessionCount = sessionFiles.length;

      // Aggregate tokens across all sessions (sample latest 5 for performance)
      const recentFiles = sessionFiles.slice(-5);
      const total: TokenUsage = {
        input_tokens: 0,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      };

      for (const file of recentFiles) {
        const sessionId = file.replace(".jsonl", "");
        const entries = await readConversation(encodedPath, sessionId);
        const tokens = extractTokenUsage(entries);
        total.input_tokens += tokens.input_tokens;
        total.output_tokens += tokens.output_tokens;
        total.cache_creation_input_tokens += tokens.cache_creation_input_tokens;
        total.cache_read_input_tokens += tokens.cache_read_input_tokens;
      }

      return {
        encodedPath,
        decodedPath: encodedPath, // We'll decode in display
        projectName: projectName(encodedPath),
        sessionCount,
        totalTokens: total,
      };
    })
  );

  // Sort by session count descending
  return stats.sort((a, b) => b.sessionCount - a.sessionCount);
}
