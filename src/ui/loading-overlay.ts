import blessed from "blessed";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const ASCII_ART: string[] = [
  // 1 — Claude diamond
  [
    "",
    "   {yellow-fg}◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆{/yellow-fg}",
    "   {yellow-fg}◆{/yellow-fg}  {bold}C L A U D E  C O D E{/bold}  {yellow-fg}◆{/yellow-fg}",
    "   {yellow-fg}◆{/yellow-fg}  {cyan-fg}▀▄ ▀▄ ▀▄ ▀▄ ▀▄ ▀▄{/cyan-fg}  {yellow-fg}◆{/yellow-fg}",
    "   {yellow-fg}◆{/yellow-fg}  {cyan-fg}▄▀ ▄▀ ▄▀ ▄▀ ▄▀ ▄▀{/cyan-fg}  {yellow-fg}◆{/yellow-fg}",
    "   {yellow-fg}◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆◆{/yellow-fg}",
    "",
    "      🤖  AI Monitor  🤖",
  ].join("\n"),

  // 2 — Neural net
  [
    "",
    "   {cyan-fg}○{/cyan-fg} ───── {yellow-fg}●{/yellow-fg} ───── {cyan-fg}○{/cyan-fg}",
    "   {gray-fg}│ ╲   │ ╲   │ ╲   │{/gray-fg}",
    "   {yellow-fg}●{/yellow-fg}   {cyan-fg}○{/cyan-fg}   {yellow-fg}●{/yellow-fg}   {cyan-fg}○{/cyan-fg}",
    "   {gray-fg}│ ╲   │ ╲   │ ╲   │{/gray-fg}",
    "   {cyan-fg}○{/cyan-fg} ───── {yellow-fg}●{/yellow-fg} ───── {cyan-fg}○{/cyan-fg}",
    "",
    "    🧠  Neural Processing",
  ].join("\n"),

  // 3 — Token stream
  [
    "",
    "   {yellow-fg}╔═══════════════════════╗{/yellow-fg}",
    "   {yellow-fg}║{/yellow-fg}  🔵 {cyan-fg}▓▓▓▓▓▓▓░░░{/cyan-fg}   IN   {yellow-fg}║{/yellow-fg}",
    "   {yellow-fg}║{/yellow-fg}  🟠 {yellow-fg}▓▓▓▓░░░░░░{/yellow-fg}  OUT  {yellow-fg}║{/yellow-fg}",
    "   {yellow-fg}║{/yellow-fg}  ⚡ {green-fg}▓▓▓▓▓▓▓▓▓░{/green-fg} CACHE {yellow-fg}║{/yellow-fg}",
    "   {yellow-fg}╚═══════════════════════╝{/yellow-fg}",
    "",
    "    🪙  Token Stream  🪙",
  ].join("\n"),

  // 4 — Claude face
  [
    "",
    "        {cyan-fg}╭──────────────╮{/cyan-fg}",
    "        {cyan-fg}│{/cyan-fg}  {yellow-fg}◉{/yellow-fg}        {yellow-fg}◉{/yellow-fg}  {cyan-fg}│{/cyan-fg}",
    "        {cyan-fg}│{/cyan-fg}              {cyan-fg}│{/cyan-fg}",
    "        {cyan-fg}│{/cyan-fg}   {white-fg}──────{/white-fg}    {cyan-fg}│{/cyan-fg}",
    "        {cyan-fg}│{/cyan-fg}  {white-fg}╰──────╯{/white-fg}   {cyan-fg}│{/cyan-fg}",
    "        {cyan-fg}╰──────────────╯{/cyan-fg}",
    "     Claude is thinking... 💭",
  ].join("\n"),

  // 5 — Data waves
  [
    "",
    "   {cyan-fg}≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋{/cyan-fg}",
    "   {cyan-fg}≈{/cyan-fg}  📂  Reading sessions    {cyan-fg}≈{/cyan-fg}",
    "   {cyan-fg}≋{/cyan-fg}  🤖  Tracking agents     {cyan-fg}≋{/cyan-fg}",
    "   {cyan-fg}≈{/cyan-fg}  🪙  Counting tokens     {cyan-fg}≈{/cyan-fg}",
    "   {cyan-fg}≋{/cyan-fg}  📜  Parsing history     {cyan-fg}≋{/cyan-fg}",
    "   {cyan-fg}≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋≋{/cyan-fg}",
    "",
  ].join("\n"),

  // 6 — Binary / matrix
  [
    "",
    "   {green-fg}01001100  01001100  01001{/green-fg}",
    "   {green-fg}10{/green-fg} {bold}{yellow-fg}C L A U D E  C O D E{/yellow-fg}{/bold} {green-fg}10{/green-fg}",
    "   {green-fg}01{/green-fg} {cyan-fg}▓░▓░▓░▓░▓░▓░▓░▓░▓{/cyan-fg} {green-fg}01{/green-fg}",
    "   {green-fg}10{/green-fg} {cyan-fg}░▓░▓░▓░▓░▓░▓░▓░▓░{/cyan-fg} {green-fg}10{/green-fg}",
    "   {green-fg}01001100  01001100  01001{/green-fg}",
    "",
    "   🔮  Materializing dashboard...",
  ].join("\n"),
];

/**
 * Show a loading overlay with randomized ASCII art + spinner.
 * Returns a cleanup function — call it to remove the overlay.
 */
export function showLoadingOverlay(
  screen: blessed.Widgets.Screen,
  label = "Loading..."
): () => void {
  const art = ASCII_ART[Math.floor(Math.random() * ASCII_ART.length)]!;

  let spinnerIdx = 0;

  const box = blessed.box({
    top: "center",
    left: "center",
    width: 46,
    height: 14,
    tags: true,
    border: { type: "line" },
    style: {
      fg: "white",
      bg: "black",
      border: { fg: "yellow" },
      label: { fg: "yellow", bold: true },
    },
    label: " ⚡ claudetui ",
    content: buildContent(art, SPINNER_FRAMES[0]!, label),
  });

  screen.append(box);
  screen.render();

  const interval = setInterval(() => {
    spinnerIdx = (spinnerIdx + 1) % SPINNER_FRAMES.length;
    box.setContent(buildContent(art, SPINNER_FRAMES[spinnerIdx]!, label));
    screen.render();
  }, 80);

  return () => {
    clearInterval(interval);
    box.destroy();
    screen.render();
  };
}

function buildContent(art: string, spinner: string, label: string): string {
  return `${art}\n\n   {yellow-fg}${spinner}{/yellow-fg}  {gray-fg}${label}{/gray-fg}`;
}
