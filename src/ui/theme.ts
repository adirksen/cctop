// Claude-native color theme — orange/amber top, teal mid, purple bottom

export const COLORS = {
  bg: "black",
  fg: "white",
  muted: "gray",

  // Section accents — Claude Code inspired palette
  // Top row: amber/orange (closest terminal equiv = yellow)
  top: { border: "yellow", label: "yellow", accent: "yellow" },
  // Mid row: teal/cyan
  mid: { border: "cyan", label: "cyan", accent: "cyan" },
  // Bottom row: purple/magenta
  bot: { border: "magenta", label: "magenta", accent: "magenta" },
  // Status bar: subtle gray
  status: { border: "gray", label: "gray", accent: "gray" },

  // Focus highlight — always white to pop against any section color
  focus: "white",

  // Semantic
  alive: "green",
  dead: "red",
  warning: "yellow",
  cost: "yellow",
  tokens: "cyan",
  cache: "blue",
} as const;

// Section color per focusable panel index (must match focusable[] order in app.ts)
export const PANEL_BORDER_COLORS = [
  COLORS.top.border,  // 0: ⚡ Sessions
  COLORS.top.border,  // 1: 🪙 Tokens
  COLORS.top.border,  // 2: 🖥  System
  COLORS.mid.border,  // 3: 🤖 Agents
  COLORS.mid.border,  // 4: 📜 History
  COLORS.bot.border,  // 5: 📊 Projects
  COLORS.bot.border,  // 6: 🔌 Plugins
] as const;

// Indices that are blessed-contrib tables (focus lands on .rows child, not widget)
export const TABLE_PANEL_INDICES = new Set([0, 3, 4]);

type Section = "top" | "mid" | "bot" | "status";

export function panelStyle(label: string, section: Section = "top") {
  const s = COLORS[section];
  return {
    label: label ? ` ${label} ` : "",
    border: { type: "line" as const, fg: s.border },
    style: {
      fg: COLORS.fg,
      bg: COLORS.bg,
      border: { fg: s.border },
      label: { fg: s.label, bold: true },
    },
  };
}
