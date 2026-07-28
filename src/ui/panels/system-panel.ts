import type contrib from "blessed-contrib";
import type { SystemStats } from "../../types.js";
import { formatBytes } from "../../util/format.js";
import { clearLog, scrollLogToTop } from "./log-utils.js";

let lastFingerprint = "";

export function resetFingerprint(): void {
  lastFingerprint = "";
}

function bar(percent: number, width: number): string {
  const filled = Math.max(Math.round((percent / 100) * width), 0);
  const empty = Math.max(width - filled, 0);
  const color = percent > 80 ? "red" : percent > 50 ? "yellow" : "green";
  return `{${color}-fg}${"█".repeat(filled)}{/${color}-fg}{gray-fg}${"─".repeat(empty)}{/gray-fg}`;
}

export function updateSystemPanel(
  log: contrib.Widgets.LogElement,
  stats: SystemStats
): void {
  const fp = `${stats.osCpuPercent}:${stats.osMemPercent}:${stats.processRss}`;
  if (fp === lastFingerprint) return;
  lastFingerprint = fp;

  clearLog(log);

  log.log(
    `  CPU  ${bar(stats.osCpuPercent, 12)} {bold}${stats.osCpuPercent}%{/bold}  {gray-fg}${stats.cpuCoreCount} cores{/gray-fg}`
  );
  log.log(
    `  MEM  ${bar(stats.osMemPercent, 12)} {bold}${stats.osMemPercent}%{/bold}`
  );
  log.log(
    `       {white-fg}${formatBytes(stats.osUsedMem)}{/white-fg}{gray-fg} / ${formatBytes(stats.osTotalMem)}{/gray-fg}`
  );
  log.log("");
  log.log(
    `  RSS  {bold}${formatBytes(stats.processRss)}{/bold}  Heap {bold}${formatBytes(stats.processHeap)}{/bold}`
  );

  if (stats.claudeProcesses.length > 0) {
    log.log(
      `  {green-fg}●{/green-fg} {yellow-fg}Claude PIDs:{/yellow-fg} {bold}${stats.claudeProcesses.length}{/bold}`
    );
  }

  scrollLogToTop(log);
}
