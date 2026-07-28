import type contrib from "blessed-contrib";
import type { ActiveSession } from "../../types.js";
import type { TodayStats } from "../../aggregators/today-aggregator.js";
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
  today: TodayStats
): void {
  const { tokens, cost } = today;
  const totalIn =
    tokens.input_tokens +
    tokens.cache_read_input_tokens +
    tokens.cache_creation_input_tokens;
  const totalOut = tokens.output_tokens;

  const fingerprint = `${totalIn}:${totalOut}:${sessions.length}`;
  if (fingerprint === lastFingerprint) return;
  lastFingerprint = fingerprint;

  clearLog(log);

  log.log(
    `  {bold}Today{/bold}   {yellow-fg}${formatCost(cost.total, cost.pricingKnown)}{/yellow-fg}`
  );
  log.log(`  In    {cyan-fg}${formatTokens(totalIn)}{/cyan-fg}`);
  log.log(`  Out   {yellow-fg}${formatTokens(totalOut)}{/yellow-fg}`);
  log.log(
    `  Cache read   {green-fg}${formatTokens(tokens.cache_read_input_tokens)}{/green-fg}`
  );
  log.log(
    `  Cache write  {gray-fg}${formatTokens(tokens.cache_creation_input_tokens)}{/gray-fg}`
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
      `  ${dot} {bold}${s.projectName}{/bold}  {yellow-fg}${formatCost(sessionCost.total, sessionCost.pricingKnown)}{/yellow-fg}`
    );
    log.log(
      `    {cyan-fg}${formatTokens(sessionIn)}{/cyan-fg} in  {yellow-fg}${formatTokens(t.output_tokens)}{/yellow-fg} out`
    );
  }
}
