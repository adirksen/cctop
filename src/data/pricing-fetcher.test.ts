import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseLiteLLMCatalog,
  isCacheFresh,
  readPricingCache,
  writePricingCache,
  fetchPricingCatalog,
  PRICING_CACHE_TTL_MS,
  LITELLM_PRICING_URL,
} from "./pricing-fetcher.js";

// Real catalog rows verified against the live LiteLLM catalog (2026-08-12).
const FIXTURE_CATALOG = {
  "claude-opus-5": {
    litellm_provider: "anthropic",
    input_cost_per_token: 5e-6,
    output_cost_per_token: 2.5e-5,
    cache_read_input_token_cost: 5e-7,
    cache_creation_input_token_cost: 6.25e-6,
  },
  "claude-sonnet-5": {
    litellm_provider: "anthropic",
    input_cost_per_token: 2e-6,
    output_cost_per_token: 1e-5,
    cache_read_input_token_cost: 2e-7,
    cache_creation_input_token_cost: 2.5e-6,
  },
};

const dirsToClean: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  while (dirsToClean.length > 0) {
    const dir = dirsToClean.pop();
    if (dir) await rm(dir, { recursive: true, force: true });
  }
});

async function makeTempCachePath(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "cctop-pricing-test-"));
  dirsToClean.push(dir);
  return join(dir, "pricing.json");
}

describe("parseLiteLLMCatalog", () => {
  it("converts fixture rows to expected per-million values", () => {
    const result = parseLiteLLMCatalog(FIXTURE_CATALOG);

    expect(result["claude-opus-5"]).toEqual({
      inputPerMillion: 5,
      outputPerMillion: 25,
      cacheReadPerMillion: 0.5,
      cacheCreationPerMillion: 6.25,
    });
    expect(result["claude-sonnet-5"]).toEqual({
      inputPerMillion: 2,
      outputPerMillion: 10,
      cacheReadPerMillion: 0.2,
      cacheCreationPerMillion: 2.5,
    });
  });

  it("skips rows whose litellm_provider is not anthropic", () => {
    const catalog = {
      "vertex_ai/claude-opus-5": {
        litellm_provider: "vertex_ai-anthropic_models",
        input_cost_per_token: 5e-6,
        output_cost_per_token: 2.5e-5,
      },
    };

    const result = parseLiteLLMCatalog(catalog);

    expect(result).toEqual({});
  });

  it("derives cache rates from input when cache fields are absent", () => {
    const catalog = {
      "claude-derived": {
        litellm_provider: "anthropic",
        input_cost_per_token: 1e-6,
        output_cost_per_token: 5e-6,
      },
    };

    const result = parseLiteLLMCatalog(catalog);

    expect(result["claude-derived"]).toEqual({
      inputPerMillion: 1,
      outputPerMillion: 5,
      cacheReadPerMillion: 0.1,
      cacheCreationPerMillion: 1.25,
    });
  });

  it("accepts a cache field below the 0.01 input/output floor, since cache bounds are (0, 1000]", () => {
    const catalog = {
      "cheap-cache": {
        litellm_provider: "anthropic",
        input_cost_per_token: 5e-6,
        output_cost_per_token: 2.5e-5,
        cache_read_input_token_cost: 1e-9, // 0.001/MTok, below the 0.01 floor
        cache_creation_input_token_cost: 6.25e-6,
      },
    };

    const result = parseLiteLLMCatalog(catalog);

    expect(result["cheap-cache"]?.cacheReadPerMillion).toBe(0.001);
  });

  it("rejects a zero-valued cache field, since the cache bound is exclusive of 0", () => {
    const catalog = {
      "zero-cache": {
        litellm_provider: "anthropic",
        input_cost_per_token: 5e-6,
        output_cost_per_token: 2.5e-5,
        cache_read_input_token_cost: 0,
        cache_creation_input_token_cost: 6.25e-6,
      },
    };

    const result = parseLiteLLMCatalog(catalog);

    // A zero cache_read_input_token_cost is out of bounds, so it falls back
    // to the derived rate (input × 0.1).
    expect(result["zero-cache"]?.cacheReadPerMillion).toBe(0.5);
  });

  it("skips rows with missing, non-numeric, or out-of-bounds input/output costs", () => {
    const catalog = {
      "missing-output": {
        litellm_provider: "anthropic",
        input_cost_per_token: 5e-6,
      },
      "zero-input": {
        litellm_provider: "anthropic",
        input_cost_per_token: 0,
        output_cost_per_token: 2.5e-5,
      },
      "negative-input": {
        litellm_provider: "anthropic",
        input_cost_per_token: -5e-6,
        output_cost_per_token: 2.5e-5,
      },
      "too-expensive": {
        litellm_provider: "anthropic",
        input_cost_per_token: 5e-6,
        output_cost_per_token: 2e-3, // 2000/MTok, over the 1000 bound
      },
      "string-cost": {
        litellm_provider: "anthropic",
        input_cost_per_token: "5e-6",
        output_cost_per_token: 2.5e-5,
      },
    };

    const result = parseLiteLLMCatalog(catalog);

    expect(result).toEqual({});
  });

  it("returns {} for non-object input", () => {
    expect(parseLiteLLMCatalog(null)).toEqual({});
    expect(parseLiteLLMCatalog(undefined)).toEqual({});
    expect(parseLiteLLMCatalog([])).toEqual({});
    expect(parseLiteLLMCatalog("a string")).toEqual({});
    expect(parseLiteLLMCatalog(42)).toEqual({});
  });
});

describe("cache round-trip", () => {
  it("write-then-read round-trips the pricing table", async () => {
    const path = await makeTempCachePath();
    const pricing = parseLiteLLMCatalog(FIXTURE_CATALOG);
    const fetchedAt = Date.now();

    await writePricingCache(pricing, fetchedAt, path);
    const result = await readPricingCache(path);

    expect(result).not.toBeNull();
    expect(result?.fetchedAt).toBe(fetchedAt);
    expect(result?.pricing).toEqual(pricing);
  });

  it("returns null for a missing path", async () => {
    const path = await makeTempCachePath(); // path never written to

    const result = await readPricingCache(path);

    expect(result).toBeNull();
  });

  it("returns null for malformed JSON", async () => {
    const { writeFile } = await import("node:fs/promises");
    const path = await makeTempCachePath();
    await writeFile(path, "{not valid json");

    const result = await readPricingCache(path);

    expect(result).toBeNull();
  });

  it("drops out-of-bounds entries and returns null when none survive", async () => {
    const { writeFile } = await import("node:fs/promises");
    const path = await makeTempCachePath();
    await writeFile(
      path,
      JSON.stringify({
        fetchedAt: Date.now(),
        pricing: {
          "bad-model": {
            inputPerMillion: 0,
            outputPerMillion: 25,
            cacheReadPerMillion: 0.5,
            cacheCreationPerMillion: 6.25,
          },
        },
      })
    );

    const result = await readPricingCache(path);

    expect(result).toBeNull();
  });

  it("drops out-of-bounds entries but keeps valid ones", async () => {
    const { writeFile } = await import("node:fs/promises");
    const path = await makeTempCachePath();
    await writeFile(
      path,
      JSON.stringify({
        fetchedAt: Date.now(),
        pricing: {
          "good-model": {
            inputPerMillion: 5,
            outputPerMillion: 25,
            cacheReadPerMillion: 0.5,
            cacheCreationPerMillion: 6.25,
          },
          "bad-model": {
            inputPerMillion: 2000,
            outputPerMillion: 25,
            cacheReadPerMillion: 0.5,
            cacheCreationPerMillion: 6.25,
          },
        },
      })
    );

    const result = await readPricingCache(path);

    expect(result).not.toBeNull();
    expect(Object.keys(result!.pricing)).toEqual(["good-model"]);
  });

  it("returns null when fetchedAt is not finite", async () => {
    const { writeFile } = await import("node:fs/promises");
    const path = await makeTempCachePath();
    await writeFile(
      path,
      JSON.stringify({
        fetchedAt: "not-a-number",
        pricing: {
          "good-model": {
            inputPerMillion: 5,
            outputPerMillion: 25,
            cacheReadPerMillion: 0.5,
            cacheCreationPerMillion: 6.25,
          },
        },
      })
    );

    const result = await readPricingCache(path);

    expect(result).toBeNull();
  });
});

describe("isCacheFresh", () => {
  it("is fresh within the TTL", () => {
    const now = 1_000_000;
    expect(isCacheFresh(now - PRICING_CACHE_TTL_MS + 1, now)).toBe(true);
  });

  it("is stale at exactly the TTL boundary", () => {
    const now = 1_000_000;
    expect(isCacheFresh(now - PRICING_CACHE_TTL_MS, now)).toBe(false);
  });

  it("is stale after the TTL", () => {
    const now = 1_000_000;
    expect(isCacheFresh(now - PRICING_CACHE_TTL_MS - 1, now)).toBe(false);
  });

  it("treats a non-finite fetchedAt as stale", () => {
    const now = 1_000_000;
    expect(isCacheFresh(NaN, now)).toBe(false);
    expect(isCacheFresh(Infinity, now)).toBe(false);
  });

  it("treats a fetchedAt far in the future as stale", () => {
    const now = 1_000_000;
    expect(isCacheFresh(now + PRICING_CACHE_TTL_MS + 1, now)).toBe(false);
  });

  it("respects a custom ttlMs", () => {
    const now = 1_000_000;
    expect(isCacheFresh(now - 500, now, 1000)).toBe(true);
    expect(isCacheFresh(now - 1500, now, 1000)).toBe(false);
  });
});

describe("fetchPricingCatalog", () => {
  it("uses LITELLM_PRICING_URL by default and returns parsed pricing on 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => FIXTURE_CATALOG,
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchPricingCatalog();

    expect(result).toEqual(parseLiteLLMCatalog(FIXTURE_CATALOG));
    expect(fetchMock).toHaveBeenCalledWith(
      LITELLM_PRICING_URL,
      expect.anything()
    );
  });

  it("returns null on non-2xx status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => FIXTURE_CATALOG,
      })
    );

    const result = await fetchPricingCatalog();

    expect(result).toBeNull();
  });

  it("returns null when fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));

    const result = await fetchPricingCatalog();

    expect(result).toBeNull();
  });

  it("returns null when json parsing fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error("bad json");
        },
      })
    );

    const result = await fetchPricingCatalog();

    expect(result).toBeNull();
  });

  it("returns null when the parse result is empty", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      })
    );

    const result = await fetchPricingCatalog();

    expect(result).toBeNull();
  });
});
