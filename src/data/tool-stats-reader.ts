import type { ConversationEntry } from "../types.js";
import { resolvePricing } from "../aggregators/token-aggregator.js";

export interface ToolStat {
  name: string;
  calls: number;
  /** Estimated input tokens from tool results (result chars / 4) */
  resultTokens: number;
  /** Output tokens Claude spent generating this tool call */
  outputTokens: number;
  /** Rough USD cost estimate (result input + output) */
  estimatedCost: number;
  /** False if any contributing call used a model with no known price. */
  pricingKnown: boolean;
}

export type ToolStatAccumulator = Map<string, ToolStat>;

type ToolUseBlock = { type: "tool_use"; id: string; name: string };
type ToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
};

/** Characters per token, used to size tool results that carry no usage data. */
const CHARS_PER_TOKEN = 4;

/**
 * Attribute token cost to each tool across one session's entries.
 *
 * Attribution model:
 *  - Output tokens: the assistant message's output_tokens split evenly across
 *    the tool calls in that message.
 *  - Input tokens: the tool_result's content length / 4, since results carry no
 *    usage of their own.
 *
 * Cost is priced with the model that actually produced each call rather than a
 * single global model, so a session mixing Opus and Haiku is costed correctly.
 */
export function accumulateToolStats(
  entries: ConversationEntry[],
  startTs: string,
  stats: ToolStatAccumulator
): void {
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (
      entry.type !== "assistant" ||
      !entry.timestamp ||
      entry.timestamp < startTs
    ) {
      continue;
    }

    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;

    const toolUses = content.filter(
      (b): b is ToolUseBlock => b.type === "tool_use" && !!b.name
    );
    if (toolUses.length === 0) continue;

    const { pricing, known } = resolvePricing(entry.message?.model);
    const outputPerCall = Math.round(
      (entry.message?.usage?.output_tokens ?? 0) / toolUses.length
    );

    const idToName = new Map<string, string>();
    for (const tu of toolUses) {
      const name = toolDisplayName(tu.name);
      idToName.set(tu.id, name);

      const s = statFor(stats, name);
      s.calls++;
      s.outputTokens += outputPerCall;
      s.estimatedCost +=
        (outputPerCall / 1_000_000) * pricing.outputPerMillion;
      if (!known) s.pricingKnown = false;
    }

    // Tool results arrive in the immediately following user message.
    const nextEntry = entries[i + 1];
    if (nextEntry?.type !== "user" || !Array.isArray(nextEntry.message?.content)) {
      continue;
    }

    const results = (nextEntry.message.content as ToolResultBlock[]).filter(
      (b) => b.type === "tool_result"
    );

    for (const result of results) {
      const toolName = idToName.get(result.tool_use_id);
      if (!toolName) continue;

      const tokens = Math.round(contentLength(result.content) / CHARS_PER_TOKEN);
      const s = statFor(stats, toolName);
      s.resultTokens += tokens;
      s.estimatedCost += (tokens / 1_000_000) * pricing.inputPerMillion;
    }
  }
}

/** Sort accumulated stats by cost, then call count. */
export function finalizeToolStats(stats: ToolStatAccumulator): ToolStat[] {
  return Array.from(stats.values()).sort(
    (a, b) => b.estimatedCost - a.estimatedCost || b.calls - a.calls
  );
}

function statFor(stats: ToolStatAccumulator, name: string): ToolStat {
  let s = stats.get(name);
  if (!s) {
    s = {
      name,
      calls: 0,
      resultTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      pricingKnown: true,
    };
    stats.set(name, s);
  }
  return s;
}

function contentLength(content: unknown): number {
  if (typeof content === "string") return content.length;
  if (Array.isArray(content)) {
    return content.reduce((n, item) => {
      if (typeof item === "string") return n + item.length;
      if (typeof item === "object" && item !== null && "text" in item) {
        return n + String((item as { text: unknown }).text).length;
      }
      return n;
    }, 0);
  }
  return 0;
}

/** Convert a raw tool name to a short display name. */
export function toolDisplayName(rawName: string): string {
  if (rawName.startsWith("mcp__")) {
    const parts = rawName.split("__");
    const plugin = (parts[1] ?? "mcp")
      .replace(/^plugin_/, "")
      .replace(/-cloud$/, "")
      .replace(/-/g, "");
    const tool = parts[2] ?? "";
    return tool ? `${plugin}:${tool}` : plugin;
  }
  return rawName;
}
