import { describe, it, expect, afterEach } from "vitest";
import {
  emptyUsage,
  addUsage,
  resolvePricing,
  estimateCost,
  sumCosts,
} from "./token-aggregator.js";
import {
  getDefaultPricing,
  getModelPricing,
  getFamilyPricing,
  applyPricingOverrides,
  resetPricingOverrides,
  pricingFromRates,
} from "../config.js";
import type { CostEstimate, TokenUsage } from "../types.js";

describe("emptyUsage", () => {
  it("returns all-zero fields", () => {
    expect(emptyUsage()).toEqual({
      input_tokens: 0,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
  });

  it("returns a fresh object every call", () => {
    const first = emptyUsage();
    first.input_tokens = 999;
    const second = emptyUsage();
    expect(second.input_tokens).toBe(0);
  });
});

describe("addUsage", () => {
  it("sums all four fields into the total in place", () => {
    const total = emptyUsage();
    addUsage(total, {
      input_tokens: 1,
      output_tokens: 2,
      cache_creation_input_tokens: 3,
      cache_read_input_tokens: 4,
    });
    addUsage(total, {
      input_tokens: 10,
      output_tokens: 20,
      cache_creation_input_tokens: 30,
      cache_read_input_tokens: 40,
    });
    expect(total).toEqual({
      input_tokens: 11,
      output_tokens: 22,
      cache_creation_input_tokens: 33,
      cache_read_input_tokens: 44,
    });
  });

  it("treats missing fields on the partial as 0", () => {
    const total = emptyUsage();
    addUsage(total, { input_tokens: 5 });
    expect(total).toEqual({
      input_tokens: 5,
      output_tokens: 0,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    });
  });
});

describe("resolvePricing", () => {
  it("returns the exact table entry with known: true", () => {
    const result = resolvePricing("claude-sonnet-5");
    expect(result.pricing).toBe(getModelPricing()["claude-sonnet-5"]);
    expect(result.known).toBe(true);
  });

  it("matches a vendor-prefixed id by substring", () => {
    const result = resolvePricing("anthropic.claude-opus-5");
    expect(result.pricing).toBe(getModelPricing()["claude-opus-5"]);
    expect(result.known).toBe(true);
  });

  it("matches a date-suffixed id by substring", () => {
    const result = resolvePricing("claude-sonnet-5-20260101");
    expect(result.pricing).toBe(getModelPricing()["claude-sonnet-5"]);
    expect(result.known).toBe(true);
  });

  it("falls back to the opus family rate for an unknown opus model", () => {
    const result = resolvePricing("claude-opus-6-speculative");
    const opusFamily = getFamilyPricing().find(([family]) => family === "opus")![1];
    expect(result.pricing).toBe(opusFamily);
    expect(result.known).toBe(false);
  });

  it("falls back to the fable family rate, not the sonnet default", () => {
    const result = resolvePricing("claude-fable-6");
    const fableFamily = getFamilyPricing().find(([family]) => family === "fable")![1];
    expect(result.pricing).toBe(fableFamily);
    expect(result.pricing).not.toBe(getDefaultPricing());
    expect(result.known).toBe(false);
  });

  it("falls back to getDefaultPricing() for undefined, unknown, or a foreign model id", () => {
    for (const model of [undefined, "unknown", "gpt-9"]) {
      const result = resolvePricing(model);
      expect(result.pricing).toBe(getDefaultPricing());
      expect(result.known).toBe(false);
    }
  });
});

describe("resolvePricing with overrides", () => {
  afterEach(() => {
    resetPricingOverrides();
  });

  it("returns an override with known: true, then falls back to family/default after reset", () => {
    const override = pricingFromRates(2, 4);
    applyPricingOverrides({ "claude-nova-7": override });

    const overridden = resolvePricing("claude-nova-7");
    expect(overridden.pricing).toBe(override);
    expect(overridden.known).toBe(true);

    resetPricingOverrides();

    const afterReset = resolvePricing("claude-nova-7");
    expect(afterReset.pricing).toBe(getDefaultPricing());
    expect(afterReset.known).toBe(false);
  });
});

describe("estimateCost", () => {
  it("computes exact per-bucket cost and total for a hand-computed case", () => {
    const tokens: TokenUsage = {
      input_tokens: 1_000_000,
      output_tokens: 2_000_000,
      cache_creation_input_tokens: 200_000,
      cache_read_input_tokens: 500_000,
    };

    // claude-sonnet-5: input 3, output 15, cache read 0.3, cache write 3.75 per million.
    const result = estimateCost(tokens, "claude-sonnet-5");

    expect(result.inputCost).toBeCloseTo(3);
    expect(result.outputCost).toBeCloseTo(30);
    expect(result.cacheReadCost).toBeCloseTo(0.15);
    expect(result.cacheCreationCost).toBeCloseTo(0.75);
    expect(result.total).toBeCloseTo(33.9);
    expect(result.pricingKnown).toBe(true);
  });

  it("mirrors resolvePricing's known flag for an unrecognized model", () => {
    const tokens = emptyUsage();
    const result = estimateCost(tokens, "gpt-9");
    expect(result.pricingKnown).toBe(false);
  });
});

describe("sumCosts", () => {
  it("returns all zeros with pricingKnown true for an empty list", () => {
    expect(sumCosts([])).toEqual({
      inputCost: 0,
      outputCost: 0,
      cacheReadCost: 0,
      cacheCreationCost: 0,
      total: 0,
      pricingKnown: true,
    });
  });

  it("sums totals across entries", () => {
    const a: CostEstimate = {
      inputCost: 1,
      outputCost: 2,
      cacheReadCost: 3,
      cacheCreationCost: 4,
      total: 10,
      pricingKnown: true,
    };
    const b: CostEstimate = {
      inputCost: 10,
      outputCost: 20,
      cacheReadCost: 30,
      cacheCreationCost: 40,
      total: 100,
      pricingKnown: true,
    };
    const result = sumCosts([a, b]);
    expect(result).toEqual({
      inputCost: 11,
      outputCost: 22,
      cacheReadCost: 33,
      cacheCreationCost: 44,
      total: 110,
      pricingKnown: true,
    });
  });

  it("is poisoned to pricingKnown false if any entry is unknown", () => {
    const known: CostEstimate = {
      inputCost: 1,
      outputCost: 1,
      cacheReadCost: 1,
      cacheCreationCost: 1,
      total: 4,
      pricingKnown: true,
    };
    const unknown: CostEstimate = {
      inputCost: 1,
      outputCost: 1,
      cacheReadCost: 1,
      cacheCreationCost: 1,
      total: 4,
      pricingKnown: false,
    };
    const result = sumCosts([known, unknown]);
    expect(result.pricingKnown).toBe(false);
  });

  it("ignores unknown pricing on an estimate that contributed no cost", () => {
    // Claude Code writes "<synthetic>" error placeholders with all-zero usage;
    // a $0 contribution must not mark the whole aggregate as estimated.
    const real = estimateCost(
      {
        input_tokens: 1_000_000,
        output_tokens: 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
      "claude-opus-5"
    );
    const synthetic = estimateCost(emptyUsage(), "<synthetic>");
    expect(synthetic.pricingKnown).toBe(false);

    const result = sumCosts([real, synthetic]);
    expect(result.pricingKnown).toBe(true);
    expect(result.total).toBeCloseTo(5);
  });
});
