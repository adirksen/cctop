import type contrib from "blessed-contrib";
import type { ActiveSession } from "../../types.js";
import { formatDuration, truncate } from "../../util/format.js";

export function updateSessionsPanel(
  table: contrib.Widgets.TableElement,
  sessions: ActiveSession[]
): void {
  const headers = ["PID", "Project", "Duration", "Model"];
  const rows = sessions.map((s) => [
    `${s.isAlive ? "●" : "○"} ${s.pid || "—"}`,
    truncate(s.projectName, 14),
    formatDuration(s.duration),
    truncate(s.model?.replace("claude-", "") ?? "?", 10),
  ]);

  if (rows.length === 0) {
    rows.push(["", "No sessions", "", ""]);
    rows.push(["", "Start Claude", "", ""]);
    rows.push(["", "Code to begin", "", ""]);
  }

  table.setData({ headers, data: rows });
}
