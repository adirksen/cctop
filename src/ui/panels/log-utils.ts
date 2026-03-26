import type contrib from "blessed-contrib";

/**
 * Clear a blessed-contrib log widget's internal line buffer.
 * The log widget only exposes .log() (append) and has no clear method,
 * so we reach into its internals: .logLines array + .setItems().
 */
export function clearLog(log: contrib.Widgets.LogElement): void {
  const widget = log as unknown as {
    logLines: string[];
    setItems: (items: string[]) => void;
  };
  widget.logLines = [];
  widget.setItems([]);
}
