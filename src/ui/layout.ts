import contrib from "blessed-contrib";
import type blessed from "blessed";
import { COLORS, panelStyle } from "./theme.js";

export interface DashboardWidgets {
  grid: contrib.Widgets.GridElement;
  sessions: contrib.Widgets.TableElement;
  tokens: contrib.Widgets.LogElement;
  system: contrib.Widgets.LogElement;
  agents: contrib.Widgets.TableElement;
  history: contrib.Widgets.TableElement;
  projects: contrib.Widgets.BarElement;
  plugins: contrib.Widgets.LogElement;
  statusBar: contrib.Widgets.LogElement;
}

/**
 * Create the 12x12 grid layout.
 * NOTE: No emoji in label strings — blessed measures label width in chars,
 * but emoji are 2 columns wide, which breaks border alignment.
 *
 * Row 0-3:  Sessions | Tokens  | System   [yellow]
 * Row 4-7:  Agents   | History            [cyan]
 * Row 8-10: Projects | Plugins            [magenta]
 * Row 11:   Status bar                    [gray]
 */
export function createDashboard(
  screen: blessed.Widgets.Screen
): DashboardWidgets {
  const grid = new contrib.grid({
    rows: 12,
    cols: 12,
    screen,
    hideBorder: true,
  });

  // ─── Top Row (amber/yellow) ───────────────────────────────────
  const sessions = grid.set(0, 0, 4, 4, contrib.table, {
    ...panelStyle("Sessions [Enter]", "top"),
    keys: true,
    interactive: true as unknown as string,
    columnSpacing: 2,
    columnWidth: [7, 14, 8, 6],
    fg: COLORS.fg,
    selectedFg: COLORS.bg,
    selectedBg: COLORS.top.accent,
  } as contrib.Widgets.TableOptions);

  const tokens = grid.set(0, 4, 4, 4, contrib.log, {
    ...panelStyle("Tokens", "top"),
    tags: true,
    bufferLength: 30,
  } as unknown as contrib.Widgets.LogOptions);

  const system = grid.set(0, 8, 4, 4, contrib.log, {
    ...panelStyle("System", "top"),
    tags: true,
    bufferLength: 20,
  } as unknown as contrib.Widgets.LogOptions);

  // ─── Middle Row (teal/cyan) ───────────────────────────────────
  const agents = grid.set(4, 0, 4, 4, contrib.table, {
    ...panelStyle("Agents", "mid"),
    keys: true,
    interactive: true as unknown as string,
    columnSpacing: 2,
    columnWidth: [7, 10, 18],
    fg: COLORS.fg,
    selectedFg: COLORS.bg,
    selectedBg: COLORS.mid.accent,
  } as contrib.Widgets.TableOptions);

  const history = grid.set(4, 4, 4, 8, contrib.table, {
    ...panelStyle("History [Enter: detail]", "mid"),
    keys: true,
    interactive: true as unknown as string,
    columnSpacing: 2,
    columnWidth: [8, 14, 52],
    fg: COLORS.fg,
    selectedFg: COLORS.bg,
    selectedBg: COLORS.mid.accent,
  } as contrib.Widgets.TableOptions);

  // ─── Bottom Row (purple/magenta) ──────────────────────────────
  const projects = grid.set(8, 0, 3, 4, contrib.bar, {
    ...panelStyle("Projects", "bot"),
    barWidth: 6,
    barSpacing: 2,
    xOffset: 0,
    maxHeight: 10,
    barBgColor: COLORS.bot.accent,
  } as unknown as contrib.Widgets.BarOptions);

  const plugins = grid.set(8, 4, 3, 8, contrib.log, {
    ...panelStyle("Plugins & MCP", "bot"),
    tags: true,
    bufferLength: 50,
  } as unknown as contrib.Widgets.LogOptions);

  // ─── Status Bar ───────────────────────────────────────────────
  const statusBar = grid.set(11, 0, 1, 12, contrib.log, {
    ...panelStyle("", "status"),
    tags: true,
    bufferLength: 1,
  } as unknown as contrib.Widgets.LogOptions);

  return { grid, sessions, tokens, system, agents, history, projects, plugins, statusBar };
}
