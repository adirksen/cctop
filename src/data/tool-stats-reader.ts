import { listProjectDirs, listSessionFiles } from "./claude-home.js";
import { readConversation } from "./conversation-reader.js";
import { DEFAULT_PRICING } from "../config.js";

export interface ToolStat {
  name: string;
  calls: number;
  /** Estimated input tokens from tool results (result chars / 4) */
  resultTokens: number;
  /** Output tokens Claude spent generating this tool call */
  outputTokens: number;
  /** Rough USD cost estimate (result input + output) */
  estimatedCost: number;
}

type ToolUseBlock = { type: "tool_use"; id: string; name: string };
type ToolResultBlock = { type: "tool_result"; tool_use_id: string; content: unknown };

/**
 * Scan today's conversations and attribute token costs to each tool.
 *
 * Attribution model:
 *  - Output tokens: assistant message's output_tokens / # of tool calls in that message
 *  - Input tokens: character length of tool_result content / 4 (chars-per-token estimate)
 */
export async function getTodayToolStats(): Promise<ToolStat[]> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startTs = startOfDay.toISOString();

  // name → accumulated stats
  const stats = new Map<string, { calls: number; resultTokens: number; outputTokens: number }>();

  const projectDirs = await listProjectDirs();

  for (const proj of projectDirs) {
    const sessionFiles = await listSessionFiles(proj);

    for (const file of sessionFiles) {
      const sessionId = file.replace(".jsonl", "");
      const entries = await readConversation(proj, sessionId);

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]!;
        if (entry.type !== "assistant" || !entry.timestamp || entry.timestamp < startTs) continue;

        const content = entry.message?.content;
        if (!Array.isArray(content)) continue;

        const toolUses = content.filter((b): b is ToolUseBlock => b.type === "tool_use" && !!b.name);
        if (toolUses.length === 0) continue;

        const outputPerCall = Math.round((entry.message?.usage?.output_tokens ?? 0) / toolUses.length);

        // Build id→name map for this assistant turn
        const idToName = new Map<string, string>();
        for (const tu of toolUses) {
          idToName.set(tu.id, toolDisplayName(tu.name));
        }

        // Accumulate output tokens per tool name
        for (const tu of toolUses) {
          const name = toolDisplayName(tu.name);
          const s = stats.get(name) ?? { calls: 0, resultTokens: 0, outputTokens: 0 };
          s.calls++;
          s.outputTokens += outputPerCall;
          stats.set(name, s);
        }

        // Look at the immediately following user message for tool_result content
        const nextEntry = entries[i + 1];
        if (nextEntry?.type === "user" && Array.isArray(nextEntry.message?.content)) {
          const results = (nextEntry.message!.content as ToolResultBlock[])
            .filter((b) => b.type === "tool_result");

          for (const result of results) {
            const toolName = idToName.get(result.tool_use_id);
            if (!toolName) continue;

            const chars = contentLength(result.content);
            const tokens = Math.round(chars / 4);

            const s = stats.get(toolName);
            if (s) s.resultTokens += tokens;
          }
        }
      }
    }
  }

  return Array.from(stats.entries())
    .map(([name, s]) => {
      const inputCost = (s.resultTokens / 1_000_000) * DEFAULT_PRICING.inputPerMillion;
      const outputCost = (s.outputTokens / 1_000_000) * DEFAULT_PRICING.outputPerMillion;
      return { name, ...s, estimatedCost: inputCost + outputCost };
    })
    .sort((a, b) => b.estimatedCost - a.estimatedCost || b.calls - a.calls);
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

/** Convert raw tool name to a short display name. */
function toolDisplayName(rawName: string): string {
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
