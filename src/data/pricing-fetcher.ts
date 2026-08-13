import { mkdir, readFile, writeFile as writeFileFs } from "node:fs/promises";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

import type { ModelPricing } from "../types.js";

/** Community-maintained LiteLLM pricing catalog (per-token USD costs). */
export const LITELLM_PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

/** On-disk location for the cached, parsed pricing table. */
export const PRICING_CACHE_PATH = join(homedir(), ".cache", "cctop", "pricing.json");

/** How long a cached pricing table is considered fresh. */
export const PRICING_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Sane bounds for a per-million-token USD rate; anything outside is rejected. */
const MIN_PER_MILLION = 0.01;
const MAX_PER_MILLION = 1000;

/** Cache-read/write rates as a multiple of the input rate, used when the
 * catalog row has no explicit cache pricing. Mirrors config.ts. */
const CACHE_READ_MULTIPLIER = 0.1;
const CACHE_WRITE_MULTIPLIER = 1.25;

/** Round to 4 decimal places, same as config.ts's local rounding helper. */
const round = (n: number): number => Math.round(n * 10_000) / 10_000;

/**
 * Keys that must never be written via `obj[key] = value` on a plain object —
 * doing so hits the inherited `__proto__` accessor (or shadows `constructor`
 * / `prototype`) instead of creating an own property, silently corrupting
 * the object. Catalog and cache keys come from upstream/on-disk JSON, so
 * they're skipped outright rather than trusted.
 */
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

interface LiteLLMRow {
  litellm_provider?: unknown;
  input_cost_per_token?: unknown;
  output_cost_per_token?: unknown;
  cache_read_input_token_cost?: unknown;
  cache_creation_input_token_cost?: unknown;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/** Convert a per-token USD cost to per-million-token, or null if out of the
 * [0.01, 1000] bounds used for input/output costs. */
function perMillionInBounds(perToken: unknown): number | null {
  if (!isFiniteNumber(perToken)) return null;
  const perMillion = perToken * 1_000_000;
  if (perMillion < MIN_PER_MILLION || perMillion > MAX_PER_MILLION) return null;
  return round(perMillion);
}

/** Same conversion as perMillionInBounds, but for cache fields, which use a
 * (0, 1000] bound (no 0.01 floor) when read directly off a catalog row. */
function cachePerMillionInBounds(perToken: unknown): number | null {
  if (!isFiniteNumber(perToken)) return null;
  const perMillion = perToken * 1_000_000;
  if (perMillion <= 0 || perMillion > MAX_PER_MILLION) return null;
  return round(perMillion);
}

/** Like perMillionInBounds, but for an already-converted per-million value
 * (used when re-validating cached entries). Bounds are inclusive. */
function isValidPerMillion(value: unknown): value is number {
  return (
    isFiniteNumber(value) && value >= MIN_PER_MILLION && value <= MAX_PER_MILLION
  );
}

/**
 * Parse LiteLLM's community pricing catalog into cctop's ModelPricing table,
 * keeping only Anthropic-provider rows with sane, finite costs. Any row that
 * fails validation is skipped silently — one bad row never rejects the whole
 * catalog.
 */
export function parseLiteLLMCatalog(json: unknown): Record<string, ModelPricing> {
  const result: Record<string, ModelPricing> = {};
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return result;
  }

  for (const [modelId, rawRow] of Object.entries(json as Record<string, unknown>)) {
    if (DANGEROUS_KEYS.has(modelId)) continue;
    if (typeof rawRow !== "object" || rawRow === null) continue;
    const row = rawRow as LiteLLMRow;

    if (row.litellm_provider !== "anthropic") continue;

    const inputPerMillion = perMillionInBounds(row.input_cost_per_token);
    const outputPerMillion = perMillionInBounds(row.output_cost_per_token);
    if (inputPerMillion === null || outputPerMillion === null) continue;

    const cacheReadCandidate = cachePerMillionInBounds(row.cache_read_input_token_cost);
    const cacheCreationCandidate = cachePerMillionInBounds(
      row.cache_creation_input_token_cost
    );

    const cacheReadPerMillion =
      cacheReadCandidate !== null
        ? cacheReadCandidate
        : round(inputPerMillion * CACHE_READ_MULTIPLIER);
    const cacheCreationPerMillion =
      cacheCreationCandidate !== null
        ? cacheCreationCandidate
        : round(inputPerMillion * CACHE_WRITE_MULTIPLIER);

    result[modelId] = {
      inputPerMillion,
      outputPerMillion,
      cacheReadPerMillion,
      cacheCreationPerMillion,
    };
  }

  return result;
}

/**
 * Whether a cache fetched at `fetchedAt` is still fresh, given the current
 * time and TTL. A non-finite fetchedAt, or one further than `ttlMs` in the
 * future, is treated as stale.
 */
export function isCacheFresh(
  fetchedAt: number,
  nowMs: number = Date.now(),
  ttlMs: number = PRICING_CACHE_TTL_MS
): boolean {
  if (!Number.isFinite(fetchedAt)) return false;
  const age = nowMs - fetchedAt;
  if (age >= ttlMs) return false;
  if (age <= -ttlMs) return false; // too far in the future
  return true;
}

interface PricingCacheFile {
  fetchedAt: number;
  pricing: Record<string, ModelPricing>;
}

/**
 * Read and validate the on-disk pricing cache. Returns null when the file is
 * missing, unparseable, has a non-finite fetchedAt, or when zero entries
 * survive re-validation (a corrupt cache must never poison costs).
 */
export async function readPricingCache(
  path: string = PRICING_CACHE_PATH
): Promise<{ fetchedAt: number; pricing: Record<string, ModelPricing> } | null> {
  let raw: string;
  try {
    raw = await readFile(path, "utf-8");
  } catch {
    return null;
  }

  let parsed: PricingCacheFile;
  try {
    parsed = JSON.parse(raw) as PricingCacheFile;
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  if (!Number.isFinite(parsed.fetchedAt)) return null;
  if (
    typeof parsed.pricing !== "object" ||
    parsed.pricing === null ||
    Array.isArray(parsed.pricing)
  ) {
    return null;
  }

  const pricing: Record<string, ModelPricing> = {};
  for (const [modelId, entry] of Object.entries(parsed.pricing)) {
    if (DANGEROUS_KEYS.has(modelId)) continue;
    if (typeof entry !== "object" || entry === null) continue;
    const p = entry as ModelPricing;
    if (
      isValidPerMillion(p.inputPerMillion) &&
      isValidPerMillion(p.outputPerMillion) &&
      isValidPerMillion(p.cacheReadPerMillion) &&
      isValidPerMillion(p.cacheCreationPerMillion)
    ) {
      pricing[modelId] = {
        inputPerMillion: p.inputPerMillion,
        outputPerMillion: p.outputPerMillion,
        cacheReadPerMillion: p.cacheReadPerMillion,
        cacheCreationPerMillion: p.cacheCreationPerMillion,
      };
    }
  }

  if (Object.keys(pricing).length === 0) return null;

  return { fetchedAt: parsed.fetchedAt, pricing };
}

/**
 * Best-effort write of the pricing cache to disk. Creates the parent
 * directory as needed and swallows all errors (a failed write should never
 * crash the caller).
 */
export async function writePricingCache(
  pricing: Record<string, ModelPricing>,
  fetchedAt: number,
  path: string = PRICING_CACHE_PATH
): Promise<void> {
  try {
    await mkdir(dirname(path), { recursive: true });
    await writeFileFs(path, JSON.stringify({ fetchedAt, pricing }));
  } catch {
    // best-effort; ignore write failures
  }
}

/**
 * Fetch and parse the LiteLLM pricing catalog over the network. Returns null
 * on any failure — network error, timeout, non-2xx status, JSON parse
 * failure, or an empty parse result — and never throws.
 */
export async function fetchPricingCatalog(
  url: string = LITELLM_PRICING_URL,
  timeoutMs = 5000
): Promise<Record<string, ModelPricing> | null> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return null;
  }

  const pricing = parseLiteLLMCatalog(json);
  if (Object.keys(pricing).length === 0) return null;

  return pricing;
}

/** Options for {@link initLivePricing}. */
export interface InitLivePricingOptions {
  /** Apply an overrides table on top of the baked-in pricing. */
  apply: (overrides: Record<string, ModelPricing>) => void;
  /** Fired once, after a successful background fetch has been applied. */
  onLiveUpdate?: () => void;
  cachePath?: string;
  url?: string;
  now?: () => number;
}

/**
 * Wire live pricing into app startup. Applies a fresh on-disk cache
 * synchronously (if present), then kicks off a background network fetch
 * without waiting for it. A stale or invalid cache is ignored, leaving the
 * baked-in table in effect until the fetch (if any) completes.
 *
 * Never rejects: cache and fetch failures are both silent, since a pricing
 * hiccup should never be visible in the TUI or block startup.
 */
export async function initLivePricing(opts: InitLivePricingOptions): Promise<void> {
  const {
    apply,
    onLiveUpdate,
    cachePath = PRICING_CACHE_PATH,
    url = LITELLM_PRICING_URL,
    now = Date.now,
  } = opts;

  try {
    const cached = await readPricingCache(cachePath);
    if (cached !== null && isCacheFresh(cached.fetchedAt, now())) {
      apply(cached.pricing);
    }
  } catch {
    // best-effort; the baked-in table remains in effect
  }

  // Fire-and-forget: startup must never block on the network.
  void (async () => {
    try {
      const result = await fetchPricingCatalog(url);
      if (result !== null) {
        apply(result);
        await writePricingCache(result, now(), cachePath);
        onLiveUpdate?.();
      }
    } catch {
      // silent — the TUI never sees background fetch failures
    }
  })();
}
