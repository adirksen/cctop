import type {
  ConversationEntry,
  CostEstimate,
  ModelPricing,
  TokenBucket,
  TokenUsage,
} from "../types.js";
import { readConversation } from "../data/conversation-reader.js";
import { listProjectDirs, listSessionFiles } from "../data/claude-home.js";
import { DEFAULT_PRICING, MODEL_PRICING } from "../config.js";

const EMPTY_USAGE: TokenUsage = {
  input_tokens: 0,
  output_tokens: 0,
  cache_creation_input_tokens: 0,
  cache_read_input_tokens: 0,
};

/** Get today's total token usage across all projects and sessions. */
export async function getTodayTokens(): Promise<TokenUsage> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startTs = startOfDay.toISOString();

  const total = { ...EMPTY_USAGE };
  const projectDirs = await listProjectDirs();

  for (const proj of projectDirs) {
    const sessionFiles = await listSessionFiles(proj);
    for (const file of sessionFiles) {
      const sessionId = file.replace(".jsonl", "");
      const entries = await readConversation(proj, sessionId);

      for (const entry of entries) {
        if (
          entry.type === "assistant" &&
          entry.message?.usage &&
          entry.timestamp >= startTs
        ) {
          const u = entry.message.usage;
          total.input_tokens += u.input_tokens ?? 0;
          total.output_tokens += u.output_tokens ?? 0;
          total.cache_creation_input_tokens +=
            u.cache_creation_input_tokens ?? 0;
          total.cache_read_input_tokens += u.cache_read_input_tokens ?? 0;
        }
      }
    }
  }

  return total;
}

/**
 * Build a time series of token usage for the last N minutes, bucketed by minute.
 * Used for the sparkline chart.
 */
export async function getTokenTimeSeries(
  entries: ConversationEntry[],
  minutes = 60
): Promise<TokenBucket[]> {
  const now = Date.now();
  const startTime = now - minutes * 60 * 1000;

  // Initialize buckets
  const buckets: TokenBucket[] = [];
  for (let i = 0; i < minutes; i++) {
    buckets.push({
      timestamp: startTime + i * 60 * 1000,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheCreation: 0,
    });
  }

  // Fill buckets from entries
  for (const entry of entries) {
    if (entry.type !== "assistant" || !entry.message?.usage) continue;

    const ts = new Date(entry.timestamp).getTime();
    if (ts < startTime) continue;

    const bucketIndex = Math.min(
      Math.floor((ts - startTime) / (60 * 1000)),
      minutes - 1
    );
    const bucket = buckets[bucketIndex];
    if (!bucket) continue;

    const u = entry.message.usage;
    bucket.input += u.input_tokens ?? 0;
    bucket.output += u.output_tokens ?? 0;
    bucket.cacheRead += u.cache_read_input_tokens ?? 0;
    bucket.cacheCreation += u.cache_creation_input_tokens ?? 0;
  }

  return buckets;
}

/** Estimate cost from token usage and model name. */
export function estimateCost(
  tokens: TokenUsage,
  model?: string
): CostEstimate {
  const pricing = findPricing(model);

  const inputCost = (tokens.input_tokens / 1_000_000) * pricing.inputPerMillion;
  const outputCost =
    (tokens.output_tokens / 1_000_000) * pricing.outputPerMillion;
  const cacheReadCost =
    (tokens.cache_read_input_tokens / 1_000_000) * pricing.cacheReadPerMillion;
  const cacheCreationCost =
    (tokens.cache_creation_input_tokens / 1_000_000) *
    pricing.cacheCreationPerMillion;

  return {
    inputCost,
    outputCost,
    cacheReadCost,
    cacheCreationCost,
    total: inputCost + outputCost + cacheReadCost + cacheCreationCost,
  };
}

function findPricing(model?: string): ModelPricing {
  if (!model) return DEFAULT_PRICING;

  // Try exact match first, then prefix match
  if (MODEL_PRICING[model]) return MODEL_PRICING[model];

  for (const [key, pricing] of Object.entries(MODEL_PRICING)) {
    if (model.startsWith(key) || model.includes(key)) return pricing;
  }

  // Match by family name
  if (model.includes("opus")) return MODEL_PRICING["claude-opus-4-6"]!;
  if (model.includes("haiku")) return MODEL_PRICING["claude-haiku-4-5"]!;

  return DEFAULT_PRICING;
}
