import { describe, it, expect } from "vitest";
import {
  accumulateToolStats,
  finalizeToolStats,
  toolDisplayName,
  type ToolStat,
  type ToolStatAccumulator,
} from "./tool-stats-reader.js";
import type { ConversationEntry } from "../types.js";

let uuidCounter = 0;
function nextId(): string {
  uuidCounter += 1;
  return `uuid-${uuidCounter}`;
}

function assistantEntry(params: {
  timestamp: string;
  model?: string;
  outputTokens?: number;
  toolUses?: Array<{ id: string; name: string }>;
  textOnly?: boolean;
}): ConversationEntry {
  const content: unknown[] = params.textOnly
    ? [{ type: "text", text: "hello" }]
    : (params.toolUses ?? []).map((t) => ({
        type: "tool_use",
        id: t.id,
        name: t.name,
      }));

  return {
    type: "assistant",
    uuid: nextId(),
    parentUuid: null,
    timestamp: params.timestamp,
    sessionId: "session-1",
    isSidechain: false,
    message: {
      role: "assistant",
      model: params.model,
      content,
      usage: {
        input_tokens: 0,
        output_tokens: params.outputTokens ?? 0,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
      },
    },
  };
}

function userResultEntry(
  timestamp: string,
  results: Array<{ toolUseId: string; content: unknown }>
): ConversationEntry {
  return {
    type: "user",
    uuid: nextId(),
    parentUuid: null,
    timestamp,
    sessionId: "session-1",
    isSidechain: false,
    message: {
      role: "user",
      content: results.map((r) => ({
        type: "tool_result",
        tool_use_id: r.toolUseId,
        content: r.content,
      })),
    },
  };
}

describe("toolDisplayName", () => {
  it("passes a plain tool name through unchanged", () => {
    expect(toolDisplayName("Bash")).toBe("Bash");
  });

  it("shortens an mcp plugin tool name and drops the -cloud suffix", () => {
    expect(toolDisplayName("mcp__plugin_foo-cloud__bar")).toBe("foo:bar");
  });

  it("falls back to the plugin name when there is no tool part", () => {
    expect(toolDisplayName("mcp__x")).toBe("x");
  });

  it("strips hyphens from the plugin part", () => {
    expect(toolDisplayName("mcp__plugin_my-cool-plugin__tool")).toBe(
      "mycoolplugin:tool"
    );
  });
});

describe("accumulateToolStats", () => {
  const startTs = "2026-01-01T00:00:00.000Z";

  it("splits an assistant turn's output tokens evenly across its tool calls", () => {
    const stats: ToolStatAccumulator = new Map();
    const entries = [
      assistantEntry({
        timestamp: "2026-01-01T10:00:00.000Z",
        model: "claude-sonnet-5",
        outputTokens: 100,
        toolUses: [
          { id: "call-1", name: "Bash" },
          { id: "call-2", name: "Read" },
        ],
      }),
    ];

    accumulateToolStats(entries, startTs, stats);

    expect(stats.get("Bash")?.outputTokens).toBe(50);
    expect(stats.get("Read")?.outputTokens).toBe(50);
  });

  it("attributes tool_result length / 4 to the matching tool, for both string and array-of-text content", () => {
    const stats: ToolStatAccumulator = new Map();
    const entries = [
      assistantEntry({
        timestamp: "2026-01-01T10:00:00.000Z",
        model: "claude-sonnet-5",
        toolUses: [
          { id: "call-1", name: "Bash" },
          { id: "call-2", name: "Read" },
        ],
      }),
      userResultEntry("2026-01-01T10:00:01.000Z", [
        { toolUseId: "call-1", content: "12345678" }, // 8 chars -> 2 tokens
        {
          toolUseId: "call-2",
          content: [{ type: "text", text: "abcdefghij" }], // 10 chars -> round(2.5) = 3 tokens
        },
      ]),
    ];

    accumulateToolStats(entries, startTs, stats);

    expect(stats.get("Bash")?.resultTokens).toBe(2);
    expect(stats.get("Read")?.resultTokens).toBe(3);
  });

  it("only reads tool results from the entry immediately following the tool call", () => {
    const stats: ToolStatAccumulator = new Map();
    const entries = [
      assistantEntry({
        timestamp: "2026-01-01T10:00:00.000Z",
        toolUses: [{ id: "call-1", name: "Bash" }],
      }),
      // Not a user entry, so it blocks the lookahead for the result below.
      assistantEntry({ timestamp: "2026-01-01T10:00:01.000Z", textOnly: true }),
      userResultEntry("2026-01-01T10:00:02.000Z", [
        { toolUseId: "call-1", content: "12345678" },
      ]),
    ];

    accumulateToolStats(entries, startTs, stats);

    expect(stats.get("Bash")?.resultTokens).toBe(0);
  });

  it("ignores a tool_result whose id matches no pending tool call", () => {
    const stats: ToolStatAccumulator = new Map();
    const entries = [
      assistantEntry({
        timestamp: "2026-01-01T10:00:00.000Z",
        toolUses: [{ id: "call-1", name: "Bash" }],
      }),
      userResultEntry("2026-01-01T10:00:01.000Z", [
        { toolUseId: "unknown-id", content: "12345678" },
      ]),
    ];

    accumulateToolStats(entries, startTs, stats);

    expect(stats.get("Bash")?.resultTokens).toBe(0);
    expect(stats.size).toBe(1);
  });

  it("excludes entries older than startTs", () => {
    const stats: ToolStatAccumulator = new Map();
    const entries = [
      assistantEntry({
        timestamp: "2025-12-31T10:00:00.000Z",
        toolUses: [{ id: "call-1", name: "Bash" }],
      }),
    ];

    accumulateToolStats(entries, startTs, stats);

    expect(stats.size).toBe(0);
  });

  it("skips entries with no tool_use blocks", () => {
    const stats: ToolStatAccumulator = new Map();
    const entries = [
      assistantEntry({ timestamp: "2026-01-01T10:00:00.000Z", textOnly: true }),
    ];

    accumulateToolStats(entries, startTs, stats);

    expect(stats.size).toBe(0);
  });

  it("prices each tool call at its own entry's model rate, so opus costs 5x haiku for identical usage", () => {
    // claude-opus-5 is $5/$25 per million, claude-haiku-4-5 is $1/$5 — a clean 5x on both sides.
    const stats: ToolStatAccumulator = new Map();
    const entries = [
      assistantEntry({
        timestamp: "2026-01-01T10:00:00.000Z",
        model: "claude-opus-5",
        outputTokens: 100,
        toolUses: [{ id: "call-1", name: "OpusTool" }],
      }),
      assistantEntry({
        timestamp: "2026-01-01T10:00:01.000Z",
        model: "claude-haiku-4-5",
        outputTokens: 100,
        toolUses: [{ id: "call-2", name: "HaikuTool" }],
      }),
    ];

    accumulateToolStats(entries, startTs, stats);

    const opusCost = stats.get("OpusTool")?.estimatedCost ?? 0;
    const haikuCost = stats.get("HaikuTool")?.estimatedCost ?? 0;
    expect(opusCost / haikuCost).toBeCloseTo(5, 10);
  });

  it("marks pricingKnown false when the model is not in the pricing table", () => {
    const stats: ToolStatAccumulator = new Map();
    const entries = [
      assistantEntry({
        timestamp: "2026-01-01T10:00:00.000Z",
        model: "totally-unknown-model",
        outputTokens: 100,
        toolUses: [{ id: "call-1", name: "Bash" }],
      }),
    ];

    accumulateToolStats(entries, startTs, stats);

    expect(stats.get("Bash")?.pricingKnown).toBe(false);
  });

  it("does not taint pricingKnown for a zero-token call from an unpriced model", () => {
    // "<synthetic>" placeholder entries carry all-zero usage; contributing
    // nothing must not flag the tool's cost as an estimate.
    const stats: ToolStatAccumulator = new Map();
    const entries = [
      assistantEntry({
        timestamp: "2026-01-01T10:00:00.000Z",
        model: "claude-opus-5",
        outputTokens: 100,
        toolUses: [{ id: "call-1", name: "Bash" }],
      }),
      assistantEntry({
        timestamp: "2026-01-01T10:01:00.000Z",
        model: "<synthetic>",
        outputTokens: 0,
        toolUses: [{ id: "call-2", name: "Bash" }],
      }),
    ];

    accumulateToolStats(entries, startTs, stats);

    expect(stats.get("Bash")?.calls).toBe(2);
    expect(stats.get("Bash")?.pricingKnown).toBe(true);
  });

  it("still taints pricingKnown when an unpriced model contributes result tokens", () => {
    const stats: ToolStatAccumulator = new Map();
    const entries = [
      assistantEntry({
        timestamp: "2026-01-01T10:00:00.000Z",
        model: "totally-unknown-model",
        outputTokens: 0,
        toolUses: [{ id: "call-1", name: "Bash" }],
      }),
      userResultEntry("2026-01-01T10:00:01.000Z", [
        { toolUseId: "call-1", content: "x".repeat(400) },
      ]),
    ];

    accumulateToolStats(entries, startTs, stats);

    expect(stats.get("Bash")?.pricingKnown).toBe(false);
  });

  it("merges call counts across multiple accumulate calls into the same map", () => {
    const stats: ToolStatAccumulator = new Map();
    const sessionA = [
      assistantEntry({
        timestamp: "2026-01-01T10:00:00.000Z",
        toolUses: [{ id: "a-1", name: "Bash" }],
      }),
    ];
    const sessionB = [
      assistantEntry({
        timestamp: "2026-01-01T11:00:00.000Z",
        toolUses: [{ id: "b-1", name: "Bash" }],
      }),
    ];

    accumulateToolStats(sessionA, startTs, stats);
    accumulateToolStats(sessionB, startTs, stats);

    expect(stats.get("Bash")?.calls).toBe(2);
  });
});

describe("finalizeToolStats", () => {
  it("sorts by estimated cost descending, breaking ties by call count descending", () => {
    function stat(name: string, calls: number, estimatedCost: number): ToolStat {
      return {
        name,
        calls,
        resultTokens: 0,
        outputTokens: 0,
        estimatedCost,
        pricingKnown: true,
      };
    }

    const stats: ToolStatAccumulator = new Map([
      ["A", stat("A", 1, 5)],
      ["B", stat("B", 3, 10)],
      ["C", stat("C", 5, 10)],
    ]);

    const sorted = finalizeToolStats(stats);

    expect(sorted.map((s) => s.name)).toEqual(["C", "B", "A"]);
  });
});
