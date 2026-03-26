import { homedir } from "node:os";
import { join } from "node:path";
import type { ModelPricing } from "./types.js";

export const CLAUDE_HOME = join(homedir(), ".claude");

export const PATHS = {
  history: join(CLAUDE_HOME, "history.jsonl"),
  sessions: join(CLAUDE_HOME, "sessions"),
  projects: join(CLAUDE_HOME, "projects"),
  settings: join(CLAUDE_HOME, "settings.json"),
  plugins: join(CLAUDE_HOME, "plugins", "installed_plugins.json"),
  mcpAuth: join(CLAUDE_HOME, "mcp-needs-auth-cache.json"),
  debug: join(CLAUDE_HOME, "debug"),
  fileHistory: join(CLAUDE_HOME, "file-history"),
} as const;

export const INTERVALS = {
  pidCheck: 5_000,
  systemResources: 2_000,
  fileWatch: 1_000,
} as const;

// Anthropic public pricing (per million tokens) as of 2025
export const MODEL_PRICING: Record<string, ModelPricing> = {
  "claude-opus-4-6": {
    inputPerMillion: 15,
    outputPerMillion: 75,
    cacheReadPerMillion: 1.5,
    cacheCreationPerMillion: 18.75,
  },
  "claude-sonnet-4-6": {
    inputPerMillion: 3,
    outputPerMillion: 15,
    cacheReadPerMillion: 0.3,
    cacheCreationPerMillion: 3.75,
  },
  "claude-haiku-4-5": {
    inputPerMillion: 0.8,
    outputPerMillion: 4,
    cacheReadPerMillion: 0.08,
    cacheCreationPerMillion: 1,
  },
};

// Fallback for unknown models — use Sonnet pricing as a reasonable middle ground
export const DEFAULT_PRICING: ModelPricing = MODEL_PRICING["claude-sonnet-4-6"]!;
