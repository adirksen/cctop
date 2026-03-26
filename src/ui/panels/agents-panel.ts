import type contrib from "blessed-contrib";
import type { AgentInfo } from "../../types.js";
import { truncate } from "../../util/format.js";

export function updateAgentsPanel(
  table: contrib.Widgets.TableElement,
  agents: AgentInfo[]
): void {
  const headers = ["Session", "Type", "Description"];
  const rows = agents.map((a) => [
    a.sessionId.slice(0, 6),
    truncate(a.agentType, 10),
    truncate(a.description, 18),
  ]);

  if (rows.length === 0) {
    rows.push(["", "No active", ""]);
    rows.push(["", "agents yet", ""]);
  }

  table.setData({ headers, data: rows });
}
