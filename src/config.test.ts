import { describe, it, expect, afterEach } from "vitest";
import {
  MODEL_PRICING,
  pricingFromRates,
  applyPricingOverrides,
  getModelPricing,
  getFamilyPricing,
  getDefaultPricing,
  resetPricingOverrides,
} from "./config.js";

afterEach(() => {
  resetPricingOverrides();
});

describe("MODEL_PRICING table invariants", () => {
  for (const [model, rate] of Object.entries(MODEL_PRICING)) {
    it(`${model}: cache read is ~0.1x input and cache write is ~1.25x input`, () => {
      expect(rate.cacheReadPerMillion).toBeCloseTo(rate.inputPerMillion * 0.1);
      expect(rate.cacheCreationPerMillion).toBeCloseTo(rate.inputPerMillion * 1.25);
    });
  }
});

describe("pinned flagship rates (regression guard)", () => {
  it("claude-opus-5 is 5/25", () => {
    expect(MODEL_PRICING["claude-opus-5"]).toMatchObject({
      inputPerMillion: 5,
      outputPerMillion: 25,
    });
  });

  it("claude-fable-5 is 10/50", () => {
    expect(MODEL_PRICING["claude-fable-5"]).toMatchObject({
      inputPerMillion: 10,
      outputPerMillion: 50,
    });
  });

  it("claude-sonnet-5 is 3/15", () => {
    expect(MODEL_PRICING["claude-sonnet-5"]).toMatchObject({
      inputPerMillion: 3,
      outputPerMillion: 15,
    });
  });

  it("claude-haiku-4-5 is 1/5", () => {
    expect(MODEL_PRICING["claude-haiku-4-5"]).toMatchObject({
      inputPerMillion: 1,
      outputPerMillion: 5,
    });
  });

  it("legacy claude-opus-4-1 is still 15/75", () => {
    expect(MODEL_PRICING["claude-opus-4-1"]).toMatchObject({
      inputPerMillion: 15,
      outputPerMillion: 75,
    });
  });
});

describe("getFamilyPricing ordering", () => {
  it("puts fable and mythos ahead of opus, and opus ahead of sonnet/haiku", () => {
    const families = getFamilyPricing().map(([family]) => family);
    const fableIndex = families.indexOf("fable");
    const mythosIndex = families.indexOf("mythos");
    const opusIndex = families.indexOf("opus");
    const sonnetIndex = families.indexOf("sonnet");
    const haikuIndex = families.indexOf("haiku");

    expect(fableIndex).toBeGreaterThanOrEqual(0);
    expect(mythosIndex).toBeGreaterThanOrEqual(0);
    expect(opusIndex).toBeGreaterThanOrEqual(0);
    expect(sonnetIndex).toBeGreaterThanOrEqual(0);
    expect(haikuIndex).toBeGreaterThanOrEqual(0);

    expect(fableIndex).toBeLessThan(opusIndex);
    expect(mythosIndex).toBeLessThan(opusIndex);
    expect(opusIndex).toBeLessThan(sonnetIndex);
    expect(opusIndex).toBeLessThan(haikuIndex);
  });
});

describe("getDefaultPricing", () => {
  it("is the Sonnet 5 entry", () => {
    expect(getDefaultPricing()).toBe(getModelPricing()["claude-sonnet-5"]);
  });
});

describe("pricingFromRates", () => {
  it("derives cache read at 0.1x input and cache write at 1.25x input", () => {
    expect(pricingFromRates(5, 25)).toEqual({
      inputPerMillion: 5,
      outputPerMillion: 25,
      cacheReadPerMillion: 0.5,
      cacheCreationPerMillion: 6.25,
    });
  });
});

describe("pricing overrides", () => {
  it("changes what getModelPricing() returns for the overridden key while leaving others baked", () => {
    applyPricingOverrides({
      "claude-sonnet-5": pricingFromRates(1, 2),
    });

    expect(getModelPricing()["claude-sonnet-5"]).toEqual(pricingFromRates(1, 2));
    expect(getModelPricing()["claude-opus-5"]).toBe(MODEL_PRICING["claude-opus-5"]);
  });

  it("can introduce a brand-new model key", () => {
    const novel = pricingFromRates(2, 4);
    applyPricingOverrides({ "claude-nova-7": novel });

    expect(getModelPricing()["claude-nova-7"]).toBe(novel);
  });

  it("a second call replaces the first, reverting keys absent from the new call", () => {
    applyPricingOverrides({
      "claude-sonnet-5": pricingFromRates(1, 2),
    });
    applyPricingOverrides({
      "claude-opus-5": pricingFromRates(9, 18),
    });

    expect(getModelPricing()["claude-sonnet-5"]).toBe(MODEL_PRICING["claude-sonnet-5"]);
    expect(getModelPricing()["claude-opus-5"]).toEqual(pricingFromRates(9, 18));
  });

  it("getFamilyPricing reflects an overridden anchor", () => {
    const override = pricingFromRates(9, 18);
    applyPricingOverrides({ "claude-opus-5": override });

    const opusFamily = getFamilyPricing().find(([family]) => family === "opus")![1];
    expect(opusFamily).toEqual(override);
  });

  it("getDefaultPricing reflects an overridden claude-sonnet-5", () => {
    const override = pricingFromRates(1, 2);
    applyPricingOverrides({ "claude-sonnet-5": override });

    expect(getDefaultPricing()).toEqual(override);
  });

  it("resetPricingOverrides restores baked values", () => {
    applyPricingOverrides({
      "claude-sonnet-5": pricingFromRates(1, 2),
    });
    resetPricingOverrides();

    expect(getModelPricing()["claude-sonnet-5"]).toBe(MODEL_PRICING["claude-sonnet-5"]);
  });

  it("after reset, getModelPricing() deep-equals MODEL_PRICING", () => {
    applyPricingOverrides({
      "claude-sonnet-5": pricingFromRates(1, 2),
      "claude-nova-7": pricingFromRates(2, 4),
    });
    resetPricingOverrides();

    expect(getModelPricing()).toEqual(MODEL_PRICING);
  });
});
