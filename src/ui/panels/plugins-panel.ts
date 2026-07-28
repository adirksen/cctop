import type contrib from "blessed-contrib";
import type { InstalledPlugin, McpAuthEntry } from "../../types.js";
import type { ToolStat } from "../../data/tool-stats-reader.js";
import { formatTokens, formatCost } from "../../util/format.js";
import { clearLog, logCapacity, scrollLogToTop } from "./log-utils.js";

let lastFingerprint = "";

export function resetFingerprint(): void {
  lastFingerprint = "";
}

export function updatePluginsPanel(
  log: contrib.Widgets.LogElement,
  plugins: InstalledPlugin[],
  mcpIssues: McpAuthEntry[],
  toolStats: ToolStat[] = []
): void {
  const statsSig = toolStats.slice(0, 5).map((s) => `${s.name}:${s.calls}`).join(",");
  const fingerprint = `${plugins.length}:${mcpIssues.length}:${statsSig}`;
  if (fingerprint === lastFingerprint) return;
  lastFingerprint = fingerprint;

  clearLog(log);

  // Tool costs are the panel's most actionable content, so they get whatever
  // space is left after the auth warnings and the plugin count. Both lists are
  // trimmed rather than allowed to overflow and scroll out of view.
  const capacity = logCapacity(log);
  const shownIssues = mcpIssues.slice(0, 2);
  const fixedLines = shownIssues.length + 1; // issues + "N plugins" summary
  const toolHeaderLines = 4; // blank, title, column header, divider
  const shownPlugins = plugins.slice(
    0,
    Math.max(0, Math.min(3, capacity - fixedLines - toolHeaderLines - 3))
  );
  const toolBudget = Math.max(
    0,
    capacity - fixedLines - shownPlugins.length - toolHeaderLines
  );

  // ── Auth issues (warnings first) ──────────────────────────────────────────
  for (const issue of shownIssues) {
    log.log(`  {red-fg}! ${issue.name}{/red-fg}  {yellow-fg}AUTH NEEDED{/yellow-fg}`);
  }

  // ── Installed plugins with status indicators ───────────────────────────────
  const issueTag = mcpIssues.length > 0 ? "yellow-fg" : "green-fg";
  log.log(
    `  {bold}${plugins.length}{/bold} plugins  {${issueTag}}${mcpIssues.length} auth issues{/${issueTag}}`
  );

  for (const plugin of shownPlugins) {
    const hasIssue = mcpIssues.some((i) => i.name === plugin.name);
    const indicator = hasIssue ? "{yellow-fg}!{/yellow-fg}" : "{green-fg}+{/green-fg}";
    const version = plugin.version ? `  {gray-fg}v${plugin.version}{/gray-fg}` : "";
    log.log(`  ${indicator} {white-fg}${plugin.name}{/white-fg}${version}`);
  }

  // ── Tool token cost breakdown ─────────────────────────────────────────────
  log.log("");

  if (toolStats.length === 0) {
    log.log(`  {bold}{yellow-fg}Tool Costs (today){/yellow-fg}{/bold}`);
    log.log("  {gray-fg}No tool calls recorded today{/gray-fg}");
    scrollLogToTop(log);
    return;
  }

  log.log(`  {bold}{yellow-fg}Tool Costs (today){/yellow-fg}{/bold}  {gray-fg}est. input+output{/gray-fg}`);

  // Column widths: name(18) calls(5) resultTok(8) cost(7)
  log.log(`  {gray-fg}${"Name".padEnd(18)}  Calls  Tokens    Cost{/gray-fg}`);
  log.log(`  {gray-fg}${"─".repeat(44)}{/gray-fg}`);

  const top = toolStats.slice(0, toolBudget);
  const maxCost = top[0]?.estimatedCost ?? 0.0001;

  for (const stat of top) {
    const name = stat.name.slice(0, 18).padEnd(18);
    const calls = String(stat.calls).padStart(5);
    const tokens = formatTokens(stat.resultTokens + stat.outputTokens).padStart(8);
    const cost = formatCost(stat.estimatedCost, stat.pricingKnown).padStart(7);

    // Intensity dot: shows relative cost rank
    const intensity = stat.estimatedCost / maxCost;
    const dot = intensity > 0.66
      ? "{red-fg}●{/red-fg}"
      : intensity > 0.33
        ? "{yellow-fg}●{/yellow-fg}"
        : "{green-fg}●{/green-fg}";

    log.log(`  ${dot} {white-fg}${name}{/white-fg} {gray-fg}${calls}{/gray-fg}  {cyan-fg}${tokens}{/cyan-fg}  {yellow-fg}${cost}{/yellow-fg}`);
  }

  scrollLogToTop(log);
}
