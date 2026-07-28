import type { ConversationEntry, CostEstimate, TokenUsage } from "../types.js";
import { listProjectDirs, listSessionFileStats } from "../data/claude-home.js";
import { readJsonlCached } from "../data/conversation-cache.js";
import {
  accumulateToolStats,
  finalizeToolStats,
  type ToolStat,
  type ToolStatAccumulator,
} from "../data/tool-stats-reader.js";
import { addUsage, emptyUsage, estimateCost, sumCosts } from "./token-aggregator.js";

export interface TodayStats {
  /** Combined usage across every model used today. */
  tokens: TokenUsage;
  /** Cost summed per model, so mixed-model days price correctly. */
  cost: CostEstimate;
  /** Per-tool token attribution, most expensive first. */
  toolStats: ToolStat[];
}

/**
 * Scan today's conversations once, producing both token totals and per-tool
 * attribution.
 *
 * These were previously two independent full scans of every transcript in
 * ~/.claude/projects, repeated on every refresh. They now share a single pass,
 * transcripts last modified before midnight are skipped outright, and the rest
 * come from the parsed-entry cache — so a steady-state refresh reads almost
 * nothing from disk.
 */
export async function getTodayStats(): Promise<TodayStats> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startMs = startOfDay.getTime();
  const startTs = startOfDay.toISOString();

  const byModel = new Map<string, TokenUsage>();
  const toolStats: ToolStatAccumulator = new Map();

  const projectDirs = await listProjectDirs();

  for (const project of projectDirs) {
    const files = await listSessionFileStats(project);

    for (const file of files) {
      // A transcript untouched since before midnight cannot hold today's turns.
      if (file.mtimeMs < startMs) continue;

      const entries = await readJsonlCached(file.path);
      accumulateTodayTokens(entries, startTs, byModel);
      accumulateToolStats(entries, startTs, toolStats);
    }
  }

  const tokens = emptyUsage();
  const costs: CostEstimate[] = [];
  for (const [model, usage] of byModel) {
    addUsage(tokens, usage);
    costs.push(estimateCost(usage, model));
  }

  return {
    tokens,
    cost: sumCosts(costs),
    toolStats: finalizeToolStats(toolStats),
  };
}

function accumulateTodayTokens(
  entries: ConversationEntry[],
  startTs: string,
  byModel: Map<string, TokenUsage>
): void {
  for (const entry of entries) {
    if (
      entry.type !== "assistant" ||
      !entry.message?.usage ||
      entry.timestamp < startTs
    ) {
      continue;
    }

    const model = entry.message.model ?? "unknown";
    let usage = byModel.get(model);
    if (!usage) {
      usage = emptyUsage();
      byModel.set(model, usage);
    }
    addUsage(usage, entry.message.usage);
  }
}
