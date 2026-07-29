import type contrib from "blessed-contrib";

type LogInternals = {
  logLines: string[];
  setItems: (items: string[]) => void;
  setScrollPerc: (perc: number) => void;
  height?: number;
};

/**
 * Clear a blessed-contrib log widget's internal line buffer.
 * The log widget only exposes .log() (append) and has no clear method,
 * so we reach into its internals: .logLines array + .setItems().
 */
export function clearLog(log: contrib.Widgets.LogElement): void {
  const widget = log as unknown as LogInternals;
  widget.logLines = [];
  widget.setItems([]);
}

/**
 * Scroll a log widget back to its first line.
 *
 * These panels are used as fixed readouts, not scrolling logs, but `.log()`
 * jumps to the bottom on every append. When a panel writes more lines than its
 * height, that silently hid the most important line: the Tokens panel lost its
 * "Today" total and the Plugins panel lost its plugin count, leaving each panel
 * looking like it simply had no header. Call this once after the final append.
 */
export function scrollLogToTop(log: contrib.Widgets.LogElement): void {
  (log as unknown as LogInternals).setScrollPerc(0);
}

/**
 * Rows a log widget can show at once, excluding its border.
 *
 * Panels are sized by a 12x12 grid against the live terminal, so this varies
 * with window size. Writing more lines than fit pushes the earliest ones out of
 * view, so updaters budget their content against this instead of assuming a
 * fixed panel height.
 */
export function logCapacity(
  log: contrib.Widgets.LogElement,
  fallback = 12
): number {
  const height = (log as unknown as LogInternals).height;
  if (typeof height !== "number" || height <= 2) return fallback;
  return height - 2;
}
