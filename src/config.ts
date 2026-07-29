import { homedir } from "node:os";
import { join } from "node:path";
import type { ModelPricing } from "./types.js";

export const CLAUDE_HOME = join(homedir(), ".claude");

export const PATHS = {
  history: join(CLAUDE_HOME, "history.jsonl"),
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
  /** Collapse bursts of file-watcher events into a single refresh. */
  refreshDebounce: 400,
} as const;

/**
 * Cache rates are a fixed multiple of the input rate on every current model:
 * reads bill at ~0.1x, and writes to the default 5-minute cache at 1.25x.
 * (A 1-hour-TTL cache write is 2x, but Claude Code uses the 5-minute default.)
 */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

/** Round to cents-per-million so derived rates don't carry float noise. */
const round = (n: number): number => Math.round(n * 10_000) / 10_000;

function pricing(inputPerMillion: number, outputPerMillion: number): ModelPricing {
  return {
    inputPerMillion,
    outputPerMillion,
    cacheReadPerMillion: round(inputPerMillion * CACHE_READ_MULTIPLIER),
    cacheCreationPerMillion: round(inputPerMillion * CACHE_WRITE_MULTIPLIER),
  };
}

/**
 * Anthropic list pricing per million tokens, current as of 2026-07.
 *
 * Historical sessions can reference retired models, so older IDs are kept —
 * a conversation billed at the old Opus rate should still cost that much.
 *
 * Note: Sonnet 5 carries promotional pricing of $2/$10 through 2026-08-31.
 * The standard $3/$15 rate is used here so estimates stay correct after the
 * promotion ends rather than silently drifting on that date.
 */
export const MODEL_PRICING: Record<string, ModelPricing> = {
  // Mythos class
  "claude-fable-5": pricing(10, 50),
  "claude-mythos-5": pricing(10, 50),
  "claude-mythos-preview": pricing(10, 50),

  // Opus class
  "claude-opus-5": pricing(5, 25),
  "claude-opus-4-8": pricing(5, 25),
  "claude-opus-4-7": pricing(5, 25),
  "claude-opus-4-6": pricing(5, 25),
  "claude-opus-4-5": pricing(5, 25),
  "claude-opus-4-1": pricing(15, 75),
  "claude-opus-4-0": pricing(15, 75),
  "claude-3-opus": pricing(15, 75),

  // Sonnet class
  "claude-sonnet-5": pricing(3, 15),
  "claude-sonnet-4-6": pricing(3, 15),
  "claude-sonnet-4-5": pricing(3, 15),
  "claude-sonnet-4-0": pricing(3, 15),
  "claude-3-7-sonnet": pricing(3, 15),
  "claude-3-5-sonnet": pricing(3, 15),

  // Haiku class
  "claude-haiku-4-5": pricing(1, 5),
  "claude-3-5-haiku": pricing(0.8, 4),
  "claude-3-haiku": pricing(0.25, 1.25),
};

/**
 * Per-family fallbacks for model IDs newer than this table. Ordered most- to
 * least-specific so "claude-fable-5-preview" doesn't fall through to Sonnet.
 */
export const FAMILY_PRICING: ReadonlyArray<readonly [string, ModelPricing]> = [
  ["fable", MODEL_PRICING["claude-fable-5"]!],
  ["mythos", MODEL_PRICING["claude-mythos-5"]!],
  ["opus", MODEL_PRICING["claude-opus-5"]!],
  ["sonnet", MODEL_PRICING["claude-sonnet-5"]!],
  ["haiku", MODEL_PRICING["claude-haiku-4-5"]!],
];

/** Last resort for a completely unrecognized model name. */
export const DEFAULT_PRICING: ModelPricing = MODEL_PRICING["claude-sonnet-5"]!;
