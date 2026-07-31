import { describe, it, expect } from "vitest";
import {
  MODEL_PRICING,
  FAMILY_PRICING,
  DEFAULT_PRICING,
} from "./config.js";

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

describe("FAMILY_PRICING ordering", () => {
  it("puts fable and mythos ahead of opus, and opus ahead of sonnet/haiku", () => {
    const families = FAMILY_PRICING.map(([family]) => family);
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

describe("DEFAULT_PRICING", () => {
  it("is the Sonnet 5 entry", () => {
    expect(DEFAULT_PRICING).toBe(MODEL_PRICING["claude-sonnet-5"]);
  });
});
