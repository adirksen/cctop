# cctop

A live terminal dashboard for monitoring [Claude Code](https://claude.ai/code) sessions — inspired by `htop` and `btop`.

Watch your active sessions, token usage, agent activity, and tool costs in real time without leaving the terminal.

```
┌ Sessions [Enter] ──────────┐┌ Tokens ────────────────────┐┌ System ────────────────────┐
│ PID      Project  Duration ││  Today   $1.24             ││  CPU  ████████░░░░  64%     │
│ ● 18432  cctop    2h 14m   ││  In      1.24M             ││  MEM  █████████░░░  72%     │
│ ○ 17901  api-svc  4h 02m   ││  Out     312K              ││       5.8 GB / 8.0 GB       │
│                            ││  Cache read   945K         ││                             │
│                            ││  Cache write  204K         ││  RSS  148 MB  Heap 89 MB    │
│                            ││  ● cctop   $0.89           ││  Claude PIDs: 1             │
│                            ││    1.1M in  298K out       ││                             │
└────────────────────────────┘└────────────────────────────┘└────────────────────────────┘
┌ Agents ──────────────┐┌ History [Enter: detail] ────────────────────────────────────────┐
│ PID    Type  Status  ││ Time      Project   Command                                      │
│ 18432  tool  active  ││ 14:32:10  cctop     add backdrop to session detail panels        │
│                      ││ 14:28:44  cctop     fix selected index bug in drill-down         │
│                      ││ 14:19:05  api-svc   implement JWT refresh endpoint               │
└──────────────────────┘└─────────────────────────────────────────────────────────────────┘
┌ Projects ──────────┐┌ Plugins & MCP ──────────────────────────────────────────────────  ┐
│  ▓▓▓▓▓▓▓▓         ││  2 plugins  0 auth issues                                          │
│  ▓▓▓▓   ▓▓▓▓▓▓    ││  + bitbucket-cloud  v1.2.0                                        │
│  cctop  api-svc   ││                                                                    │
└────────────────────┘│  Tool Costs (today)   est. input+output                           │
                      │  Name                Calls  Tokens    Cost                         │
                      │  ─────────────────────────────────────────                         │
                      │  ● bash                245   1.24M   $3.72                         │
                      │  ● read_file            183    856K   $2.57                        │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

## Features

- **Live session tracking** — detects running Claude Code processes and derives active sessions from `history.jsonl`
- **Token usage** — today's input, output, and cache tokens with estimated cost per session
- **Agent activity** — shows spawned sub-agents per session with type and message count
- **Command history** — recent commands across all projects, drillable to full session detail
- **System resources** — CPU, memory (with GB numbers), and cctop process RSS/heap
- **Project breakdown** — bar chart of sessions per project
- **Plugin & tool costs** — installed MCP plugins with status indicators + today's tool call token cost ranked by impact
- **Drill-down views** — press Enter on Sessions or History to open detailed overlays with scrollable message history, token breakdown by type, and agent list
- **Responsive layout** — rebuilds grid on terminal resize with a loading animation
- **Focus indicator** — active panel border turns white; Tab/Shift+Tab or 1–7 to navigate

## Requirements

- Node.js 20+
- [Claude Code](https://claude.ai/code) installed and has been used at least once (reads `~/.claude/`)
- Windows, macOS, or Linux

## Installation

```bash
# Clone and install dependencies
git clone <repo-url>
cd cctop
npm install

# Run directly (no build step needed)
npm run dev

# Or build a standalone binary
npm run build
node dist/cctop.js
```

## Keybindings

| Key | Action |
|-----|--------|
| `Tab` / `Shift+Tab` | Cycle focus between panels |
| `1` – `7` | Jump to panel by number |
| `Enter` | Drill into Sessions or History |
| `Esc` / `q` | Close drill-down / quit |
| `r` | Force refresh all data |
| `?` | Toggle help overlay |
| `Ctrl+C` | Quit |

Within drill-down views, `j` / `k` or arrow keys scroll content.

## Data Sources

cctop reads only from the local `~/.claude/` directory — no network calls, no telemetry.

| Data | Source |
|------|--------|
| Sessions | `~/.claude/history.jsonl` (derived — Claude Code no longer writes session files in recent versions) |
| Token usage & messages | `~/.claude/projects/<encoded-path>/<session-id>.jsonl` |
| Running Claude PIDs | `tasklist` (Windows) / `pgrep` (macOS/Linux) |
| Installed plugins | `~/.claude/plugins/installed_plugins.json` |
| MCP auth status | `~/.claude/mcp-needs-auth-cache.json` |
| Settings / model | `~/.claude/settings.json` |

## Cost Estimation

Token costs are estimated using [Anthropic's public pricing](https://www.anthropic.com/pricing) and the model name extracted from each session's conversation file. The per-session cost is the **cumulative API cost** — each Claude API call sends the full conversation context, so long sessions with many turns compound naturally.

Tool costs in the Plugins panel are attributed by matching `tool_use` blocks to their `tool_result` content sizes (chars ÷ 4 ≈ tokens), giving a relative ranking of which tools consume the most context.

## Architecture

```
bin/cctop.ts          Entrypoint — starts the TUI app
src/
  app.ts              Main loop: layout, keybindings, refresh cycle, drill-down routing
  config.ts           Paths, intervals, model pricing table
  types.ts            Shared interfaces (ActiveSession, HistoryEntry, TokenUsage, …)
  data/               Raw readers (JSONL, process list, file system)
  aggregators/        Data aggregation (sessions, tokens, projects, agents, tool stats)
  ui/
    layout.ts         12×12 blessed-contrib grid definition
    theme.ts          Color palette (amber top / teal mid / purple bot)
    keybindings.ts    Tab/Enter/number key routing
    loading-overlay.ts  Randomized ASCII art spinner shown during resize/startup
    panels/           Per-panel update functions (sessions, tokens, system, …)
    views/            Full-screen drill-down overlays (session detail, history detail)
  util/               JSONL reader with offset tracking, formatting helpers
```

## Known Limitations

- Token attribution per tool is an estimate (result content size / 4), not an exact count
- Session liveness detection matches running `claude.exe` / `claude` processes to the N most-recently-active sessions — accurate when one session per process, approximate otherwise
- Very large `history.jsonl` files (100k+ entries) may cause a slight delay on startup

## License

MIT — Anthony Dirksen
