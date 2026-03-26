import blessed from "blessed";
import { createDashboard, type DashboardWidgets } from "./ui/layout.js";
import { setupKeybindings } from "./ui/keybindings.js";
import { COLORS, PANEL_BORDER_COLORS, TABLE_PANEL_INDICES } from "./ui/theme.js";
import { INTERVALS } from "./config.js";
import { showLoadingOverlay } from "./ui/loading-overlay.js";

// Data aggregators
import { getAllSessions } from "./aggregators/session-aggregator.js";
import { getTodayTokens } from "./aggregators/token-aggregator.js";
import { aggregateProjects } from "./aggregators/project-aggregator.js";
import { aggregateAgents } from "./aggregators/agent-aggregator.js";
import { getRecentHistory } from "./data/history-reader.js";
import { readSettings } from "./data/settings-reader.js";
import { readInstalledPlugins } from "./data/plugin-reader.js";
import { readMcpAuthIssues } from "./data/mcp-reader.js";
import { getTodayToolStats } from "./data/tool-stats-reader.js";
import { getSystemStats } from "./data/process-monitor.js";
import { readConversation } from "./data/conversation-reader.js";

// Panel updaters
import { updateSessionsPanel } from "./ui/panels/sessions-panel.js";
import { updateTokensPanel, resetFingerprint as resetTokensFP } from "./ui/panels/tokens-panel.js";
import { updateAgentsPanel } from "./ui/panels/agents-panel.js";
import { updateHistoryPanel } from "./ui/panels/history-panel.js";
import { updateProjectsPanel } from "./ui/panels/projects-panel.js";
import { updateSystemPanel, resetFingerprint as resetSystemFP } from "./ui/panels/system-panel.js";
import { updatePluginsPanel, resetFingerprint as resetPluginsFP } from "./ui/panels/plugins-panel.js";
import { clearLog } from "./ui/panels/log-utils.js";

// File watcher
import { ClaudeFileWatcher } from "./data/file-watcher.js";

// Drill-down views
import { showSessionDetail } from "./ui/views/session-detail.js";
import { showHistoryDetail } from "./ui/views/history-detail.js";

// Utils
import { formatDuration, formatTokens, formatCost } from "./util/format.js";
import { estimateCost } from "./aggregators/token-aggregator.js";
import type { ActiveSession, HistoryEntry } from "./types.js";

// ── Module state ──────────────────────────────────────────────────────────────

let widgets: DashboardWidgets;
let screen: blessed.Widgets.Screen;
let refreshTimer: ReturnType<typeof setInterval> | undefined;
let systemTimer: ReturnType<typeof setInterval> | undefined;
const fileWatcher = new ClaudeFileWatcher();
let cachedSessions: ActiveSession[] = [];
let cachedHistory: HistoryEntry[] = [];
let inDrillDown = false;
let hideLoading: (() => void) | undefined;

// Mutable — keybinding closures capture this reference so resize updates work
const focusable: (blessed.Widgets.BlessedElement & { focus: () => void })[] = [];

// ── Panel index constants (must match focusable[] order) ─────────────────────
const SESSIONS_PANEL_INDEX = 0;
const HISTORY_PANEL_INDEX = 4;

// ── Layout helpers ────────────────────────────────────────────────────────────

/**
 * Destroy the old grid and recreate all widgets for the current terminal size.
 * Updates `widgets` and `focusable` in-place so keybinding closures stay valid.
 * Also wires up focus-highlight listeners on the new widgets.
 */
function rebuildLayout(): void {
  if (widgets?.grid) {
    (widgets.grid as unknown as { destroy?: () => void }).destroy?.();
  }

  widgets = createDashboard(screen);

  focusable.length = 0;
  focusable.push(
    ...[
      widgets.sessions,
      widgets.tokens,
      widgets.system,
      widgets.agents,
      widgets.history,
      widgets.projects,
      widgets.plugins,
    ] as unknown as (blessed.Widgets.BlessedElement & { focus: () => void })[]
  );

  setupFocusHighlighting();

  // Reset stale fingerprints so fresh widgets always get populated after rebuild
  resetTokensFP();
  resetSystemFP();
  resetPluginsFP();
}

/**
 * Attach focus/blur listeners to each panel so the active panel gets a white border.
 * For blessed-contrib tables the focus lands on the inner `rows` list — must
 * listen there, not on the table wrapper.
 */
function setupFocusHighlighting(): void {
  focusable.forEach((panel, i) => {
    const origColor = PANEL_BORDER_COLORS[i] ?? "white";

    // Tables delegate focus to their inner rows list
    const target = TABLE_PANEL_INDICES.has(i)
      ? (panel as unknown as { rows: blessed.Widgets.BlessedElement }).rows
      : panel;

    if (!target) return;

    // Do NOT call screen.render() here — Table.render() calls rows.focus()
    // which would re-fire focus → render → focus → stack overflow.
    // The keybinding's focusPanel() calls screen.render() after focus() returns.
    target.on("focus", () => {
      (
        panel as unknown as { style: { border: { fg: string } } }
      ).style.border.fg = COLORS.focus;
    });

    target.on("blur", () => {
      (
        panel as unknown as { style: { border: { fg: string } } }
      ).style.border.fg = origColor;
    });
  });
}

function showLoading(label = "Loading..."): void {
  hideLoading?.();
  hideLoading = showLoadingOverlay(screen, label);
}

function dismissLoading(): void {
  hideLoading?.();
  hideLoading = undefined;
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

/**
 * Start the TUI application.
 * Returns a promise that resolves only when the user quits (q / Ctrl+C).
 */
export async function startApp(): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    try {
      screen = blessed.screen({
        smartCSR: true,
        title: "cctop — Claude Code Monitor",
        fullUnicode: true,
        warnings: false,
      });

      screen.on("error", (err: Error) => {
        process.stderr.write(`[cctop] screen error: ${err.message}\n`);
      });

      rebuildLayout();

      setupKeybindings(screen, focusable, {
        onRefresh: () => void refreshAll(),
        onDrillIn: (panelIndex) => {
          if (panelIndex === HISTORY_PANEL_INDEX) {
            void drillIntoHistory();
          } else if (panelIndex === SESSIONS_PANEL_INDEX) {
            void drillIntoSession();
          }
          // All other panels: no drill-down (prevents crashes)
        },
        onDrillOut: () => {
          // Handled by each detail view's own Esc handler
        },
        onHelp: () => showHelp(),
      });

      // Rebuild grid on terminal resize (contrib.grid uses absolute px at creation time)
      screen.on("resize", () => {
        if (inDrillDown) return;
        showLoading("Resizing...");
        rebuildLayout();
        screen.render(); // Ensure widgets are positioned before refreshAll populates them
        void refreshAll();
      });

      screen.key(["q", "C-c"], () => {
        void stopApp().then(resolve);
      });

      // Initial load
      void (async () => {
        try {
          showLoading("Starting up...");
          await refreshAll();

          await fileWatcher.start();
          fileWatcher.on("sessions-changed", () => void refreshAll());
          fileWatcher.on("conversation-changed", () => void refreshAll());
          fileWatcher.on("history-changed", () => void refreshAll());
          fileWatcher.on("plugins-changed", () => void refreshAll());
          fileWatcher.on("settings-changed", () => void refreshAll());
          fileWatcher.on("mcp-changed", () => void refreshAll());

          refreshTimer = setInterval(
            () => void refreshAll(),
            INTERVALS.pidCheck
          );
          systemTimer = setInterval(
            () => refreshSystemPanel(),
            INTERVALS.systemResources
          );

          screen.render();
        } catch (err) {
          dismissLoading();
          process.stderr.write(
            `[cctop] init error: ${err instanceof Error ? err.message : String(err)}\n`
          );
          screen.render();
        }
      })();
    } catch (err) {
      reject(err);
    }
  });
}

// ── Data refresh ─────────────────────────────────────────────────────────────

async function refreshAll(): Promise<void> {
  if (inDrillDown) return;
  try {
    const [sessions, history, projects, settings, plugins, mcpIssues, toolStats] =
      await Promise.all([
        getAllSessions(),
        getRecentHistory(200),
        aggregateProjects(),
        readSettings(),
        readInstalledPlugins(),
        readMcpAuthIssues(),
        getTodayToolStats(),
      ]);

    cachedSessions = sessions;
    cachedHistory = history;
    const agents = await aggregateAgents(sessions);

    updateSessionsPanel(widgets.sessions, sessions);
    updateAgentsPanel(widgets.agents, agents);
    updateHistoryPanel(widgets.history, history.slice(-20));
    updateProjectsPanel(widgets.projects, projects);
    updatePluginsPanel(widgets.plugins, plugins, mcpIssues, toolStats);

    await refreshTokenPanel(sessions, settings.model);
    refreshSystemPanel(sessions);
    updateStatusBar(sessions, settings.model);

    screen.render();
  } catch {
    // Don't crash on refresh errors
    screen.render();
  } finally {
    dismissLoading();
  }
}

async function refreshTokenPanel(
  sessions: ActiveSession[],
  model?: string
): Promise<void> {
  try {
    const todayTokens = await getTodayTokens();
    updateTokensPanel(widgets.tokens, sessions, todayTokens, model);
  } catch {
    // Token panel fails gracefully
  }
}

function refreshSystemPanel(sessions?: ActiveSession[]): void {
  try {
    const effective = sessions ?? cachedSessions;
    const pids = effective.filter((s) => s.isAlive).map((s) => s.pid);
    pids.push(process.pid);
    const stats = getSystemStats(pids);
    updateSystemPanel(widgets.system, stats);
    screen.render();
  } catch {
    // System panel fails gracefully
  }
}

function updateStatusBar(sessions: ActiveSession[], model?: string): void {
  const aliveCount = sessions.filter((s) => s.isAlive).length;
  const totalTokens = sessions.reduce(
    (sum, s) => sum + s.totalTokens.input_tokens + s.totalTokens.output_tokens,
    0
  );
  const oldest = sessions[sessions.length - 1];
  const uptime = oldest
    ? formatDuration(Date.now() - oldest.startedAt)
    : "—";

  const cost = estimateCost(
    {
      input_tokens: sessions.reduce((s, x) => s + x.totalTokens.input_tokens, 0),
      output_tokens: sessions.reduce((s, x) => s + x.totalTokens.output_tokens, 0),
      cache_creation_input_tokens: sessions.reduce(
        (s, x) => s + x.totalTokens.cache_creation_input_tokens,
        0
      ),
      cache_read_input_tokens: sessions.reduce(
        (s, x) => s + x.totalTokens.cache_read_input_tokens,
        0
      ),
    },
    model
  );

  const statusText = [
    `🤖 {yellow-fg}${model?.replace("claude-", "") ?? "?"}{/yellow-fg}`,
    `⚡ {green-fg}${aliveCount} alive{/green-fg}`,
    `🪙 {cyan-fg}${formatTokens(totalTokens)}{/cyan-fg}`,
    `💰 {yellow-fg}${formatCost(cost.total)}{/yellow-fg}`,
    `⏱  {gray-fg}${uptime}{/gray-fg}`,
    `{gray-fg}[Tab] [1-7] [r] [?] [q]{/gray-fg}`,
  ].join("  {gray-fg}│{/gray-fg}  ");

  clearLog(widgets.statusBar);
  widgets.statusBar.log(` ${statusText}`);
}

// ── Drill-down ────────────────────────────────────────────────────────────────

async function drillIntoSession(): Promise<void> {
  // .rows is the inner blessed.list — .selected is 0-based into data rows
  const selectedIndex =
    (widgets.sessions as unknown as { rows?: { selected?: number } }).rows?.selected ?? 0;
  const session = cachedSessions[selectedIndex];
  if (!session) return;

  inDrillDown = true;

  // Use the pre-matched project dir from aggregateSessions (avoids path mismatch)
  const projectDir = session.encodedProjectDir;
  const [agents, entries] = await Promise.all([
    import("./data/agent-reader.js").then((m) =>
      m.readAgents(projectDir, session.sessionId)
    ),
    readConversation(projectDir, session.sessionId),
  ]);

  showSessionDetail(screen, session, agents, entries, () => {
    inDrillDown = false;
    void refreshAll();
  });
}

async function drillIntoHistory(): Promise<void> {
  // .rows is the inner blessed.list — .selected is 0-based into data rows
  const selectedIndex =
    (widgets.history as unknown as { rows?: { selected?: number } }).rows?.selected ?? 0;
  const recentEntries = cachedHistory.slice(-20);
  const entry = recentEntries[selectedIndex];
  if (!entry) return;

  inDrillDown = true;
  await showHistoryDetail(screen, entry, cachedHistory);
  inDrillDown = false;
  void refreshAll();
}

// ── Help overlay ──────────────────────────────────────────────────────────────

function showHelp(): void {
  const helpBox = blessed.box({
    top: "center",
    left: "center",
    width: 52,
    height: 18,
    tags: true,
    border: { type: "line" },
    style: {
      fg: COLORS.fg,
      bg: COLORS.bg,
      border: { fg: COLORS.top.accent },
      label: { fg: COLORS.top.accent, bold: true },
    },
    label: " cctop Help ",
    content: [
      "",
      "  {bold}cctop{/bold} — Claude Code Monitor",
      "",
      "  {yellow-fg}Tab / Shift+Tab{/yellow-fg}   Cycle panels",
      "  {yellow-fg}1 – 7{/yellow-fg}             Jump to panel",
      "  {yellow-fg}Enter{/yellow-fg}             Drill into session / history",
      "  {yellow-fg}Esc{/yellow-fg}               Back",
      "  {yellow-fg}r{/yellow-fg}                 Force refresh",
      "  {yellow-fg}q / Ctrl+C{/yellow-fg}        Quit",
      "  {yellow-fg}?{/yellow-fg}                 Toggle help",
      "",
      "  {cyan-fg}⚡ Sessions{/cyan-fg}  — Enter to drill in",
      "  {cyan-fg}📜 History{/cyan-fg}   — Enter for session detail",
      "",
      "  Press any key to close",
    ].join("\n"),
  });

  screen.append(helpBox);
  helpBox.focus();
  screen.render();

  helpBox.key(["escape", "q", "?", "enter", "space"], () => {
    helpBox.destroy();
    screen.render();
  });
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

export function stopApp(): Promise<void> {
  if (refreshTimer) clearInterval(refreshTimer);
  if (systemTimer) clearInterval(systemTimer);
  refreshTimer = undefined;
  systemTimer = undefined;
  dismissLoading();
  screen?.destroy();
  return fileWatcher.stop();
}
