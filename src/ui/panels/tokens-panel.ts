import type contrib from "blessed-contrib";
import type { ActiveSession, TokenUsage } from "../../types.js";
import { formatTokens, formatCost } from "../../util/format.js";
import { estimateCost } from "../../aggregators/token-aggregator.js";
import { clearLog } from "./log-utils.js";

let lastFingerprint = "";

export function resetFingerprint(): void {
  lastFingerprint = "";
}

export function updateTokensPanel(
  log: contrib.Widgets.LogElement,
  sessions: ActiveSession[],
  todayTokens: TokenUsage,
  model?: string
): void {
  const cost = estimateCost(todayTokens, model);
  const totalIn =
    todayTokens.input_tokens +
    todayTokens.cache_read_input_tokens +
    todayTokens.cache_creation_input_tokens;
  const totalOut = todayTokens.output_tokens;

  const fingerprint = `${totalIn}:${totalOut}:${sessions.length}`;
  if (fingerprint === lastFingerprint) return;
  lastFingerprint = fingerprint;

  clearLog(log);

  log.log(`  {bold}Today{/bold}   {yellow-fg}${formatCost(cost.total)}{/yellow-fg}`);
  log.log(`  In    {cyan-fg}${formatTokens(totalIn)}{/cyan-fg}`);
  log.log(`  Out   {yellow-fg}${formatTokens(totalOut)}{/yellow-fg}`);
  log.log(
    `  Cache read   {green-fg}${formatTokens(todayTokens.cache_read_input_tokens)}{/green-fg}`
  );
  log.log(
    `  Cache write  {gray-fg}${formatTokens(todayTokens.cache_creation_input_tokens)}{/gray-fg}`
  );
  log.log("");

  const recent = sessions.slice(0, 4);
  for (const s of recent) {
    const t = s.totalTokens;
    const sessionIn =
      t.input_tokens + t.cache_read_input_tokens + t.cache_creation_input_tokens;
    const sessionCost = estimateCost(t, s.model);
    const dot = s.isAlive ? "{green-fg}●{/green-fg}" : "{gray-fg}○{/gray-fg}";
    log.log(
      `  ${dot} {bold}${s.projectName}{/bold}  {yellow-fg}${formatCost(sessionCost.total)}{/yellow-fg}`
    );
    log.log(
      `    {cyan-fg}${formatTokens(sessionIn)}{/cyan-fg} in  {yellow-fg}${formatTokens(t.output_tokens)}{/yellow-fg} out`
    );
  }
}
