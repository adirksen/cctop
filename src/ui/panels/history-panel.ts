import type contrib from "blessed-contrib";
import type { HistoryEntry } from "../../types.js";
import { formatTime, truncate } from "../../util/format.js";
import { basename } from "node:path";

let lastFingerprint = "";

function projectShortName(project: string): string {
  return truncate(basename(project.replace(/\\/g, "/")), 14);
}

export function updateHistoryPanel(
  table: contrib.Widgets.TableElement,
  entries: HistoryEntry[]
): void {
  const fingerprint = entries.map((e) => e.timestamp + e.display).join("|");
  if (fingerprint === lastFingerprint) return;
  lastFingerprint = fingerprint;

  // contrib.table renders cells as plain text — no color tags here
  const headers = ["Time", "Project", "Command"];
  const rows = entries.map((e) => [
    formatTime(e.timestamp),
    projectShortName(e.project ?? ""),
    truncate(e.display, 52),
  ]);

  if (rows.length === 0) {
    rows.push(["", "No history yet", ""]);
  }

  table.setData({ headers, data: rows });
}
