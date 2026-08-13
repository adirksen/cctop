import type { CostEstimate, ModelPricing, TokenUsage } from "../types.js";
import {
  getDefaultPricing,
  getFamilyPricing,
  getModelPricing,
} from "../config.js";

/** A zero-valued usage record. Always returns a fresh object — safe to mutate. */
export function emptyUsage(): TokenUsage {
  return {
    input_tokens: 0,
    output_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_read_input_tokens: 0,
  };
}

/** Add `add` into `total` in place. */
export function addUsage(total: TokenUsage, add: Partial<TokenUsage>): void {
  total.input_tokens += add.input_tokens ?? 0;
  total.output_tokens += add.output_tokens ?? 0;
  total.cache_creation_input_tokens += add.cache_creation_input_tokens ?? 0;
  total.cache_read_input_tokens += add.cache_read_input_tokens ?? 0;
}

/** Estimate cost from token usage and model name. */
export function estimateCost(
  tokens: TokenUsage,
  model?: string
): CostEstimate {
  const { pricing, known } = resolvePricing(model);

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
    pricingKnown: known,
  };
}

/** Sum several already-computed estimates, preserving the confidence flag. */
export function sumCosts(estimates: CostEstimate[]): CostEstimate {
  const total: CostEstimate = {
    inputCost: 0,
    outputCost: 0,
    cacheReadCost: 0,
    cacheCreationCost: 0,
    total: 0,
    pricingKnown: true,
  };

  for (const e of estimates) {
    total.inputCost += e.inputCost;
    total.outputCost += e.outputCost;
    total.cacheReadCost += e.cacheReadCost;
    total.cacheCreationCost += e.cacheCreationCost;
    total.total += e.total;
    if (!e.pricingKnown) total.pricingKnown = false;
  }

  return total;
}

/**
 * Look up pricing for a model ID.
 *
 * `known` is false whenever the exact model wasn't in the table, so callers can
 * distinguish a real price from an inherited family rate. Conversation files
 * sometimes carry a dated or vendor-prefixed ID (`anthropic.claude-opus-5`,
 * `claude-opus-5-20260115`), so a substring match on a table key still counts
 * as an exact hit.
 */
export function resolvePricing(model?: string): {
  pricing: ModelPricing;
  known: boolean;
} {
  if (!model || model === "unknown") {
    return { pricing: getDefaultPricing(), known: false };
  }

  const modelPricing = getModelPricing();
  const exact = modelPricing[model];
  if (exact) return { pricing: exact, known: true };

  for (const [key, value] of Object.entries(modelPricing)) {
    if (model.includes(key)) return { pricing: value, known: true };
  }

  for (const [family, value] of getFamilyPricing()) {
    if (model.includes(family)) return { pricing: value, known: false };
  }

  return { pricing: getDefaultPricing(), known: false };
}
