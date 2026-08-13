// Build a synthetic ~/.claude tree for recording the README demo.
// Nothing here comes from the real home directory — every project name,
// command, and token count is fabricated.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const DEMO_HOME = process.argv[2];
if (!DEMO_HOME) throw new Error("usage: node make-demo-home.mjs <demo-home>");

const CLAUDE = join(DEMO_HOME, ".claude");
const PROJECTS = join(CLAUDE, "projects");
mkdirSync(join(CLAUDE, "plugins"), { recursive: true });
mkdirSync(PROJECTS, { recursive: true });

const now = Date.now();
const min = 60_000;
let uuidCounter = 0;
const uuid = () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, "0")}`;

const enc = (p) => p.replace(/[:\\/]/g, "-");

// One session's cwd matches this repo so the actually-running Claude Code
// process attaches to it and the demo shows a live PID.
const projects = {
  claudetui: "/Users/johnoakley/code/claudetui",
  "api-server": "/Users/demo/code/api-server",
  webapp: "/Users/demo/code/webapp",
  "data-pipeline": "/Users/demo/code/data-pipeline",
};

// sessions: [project, sessionId, model, startMinAgo, turns, cacheBase, toolMix]
const sessions = [
  ["claudetui", "aaaa1111-1111-4111-8111-111111111111", "claude-opus-5", 134, 46, 900_000,
    { Bash: 26, Read: 31, Edit: 14, Write: 6, Grep: 9 }],
  ["api-server", "bbbb2222-2222-4222-8222-222222222222", "claude-sonnet-5", 205, 34, 400_000,
    { Bash: 18, Read: 22, Edit: 11, WebSearch: 3 }],
  ["webapp", "cccc3333-3333-4333-8333-333333333333", "claude-opus-5", 320, 28, 600_000,
    { Read: 17, Edit: 9, Bash: 12, Write: 4 }],
  ["data-pipeline", "dddd4444-4444-4444-8444-444444444444", "claude-haiku-4-5", 462, 18, 150_000,
    { Bash: 14, Read: 8 }],
];

const commands = [
  "fix the flaky retry logic in the queue worker",
  "add pagination to the /orders endpoint",
  "why is the memo cache invalidating on every render?",
  "write a migration to backfill customer regions",
  "refactor the webhook handler to use the new client",
  "add integration tests for the billing cron",
  "profile the slow dashboard query and fix it",
  "bump deps and fix the breaking changes",
  "wire up the S3 export behind a feature flag",
  "clean up the error handling in the importer",
];

const history = [];

for (const [name, sid, model, startMinAgo, turns, cacheBase, toolMix] of sessions) {
  const cwd = projects[name];
  const dir = join(PROJECTS, enc(cwd));
  mkdirSync(dir, { recursive: true });

  const start = now - startMinAgo * min;
  const lines = [];
  const toolNames = Object.entries(toolMix).flatMap(([t, n]) => Array(n).fill(t));

  let cacheRead = cacheBase;
  for (let i = 0; i < turns; i++) {
    const ts = new Date(start + i * ((startMinAgo * min * 0.85) / turns)).toISOString();
    const userText = commands[(i + name.length) % commands.length];

    if (i % 6 === 0) {
      history.push({
        display: userText,
        timestamp: start + i * 2 * min,
        project: cwd,
        sessionId: sid,
        pastedContents: {},
      });
      lines.push(JSON.stringify({
        type: "user", uuid: uuid(), parentUuid: null, timestamp: ts,
        sessionId: sid, isSidechain: false,
        message: { role: "user", content: userText },
      }));
    }

    cacheRead += 18_000 + (i % 7) * 4_000;
    const usage = {
      input_tokens: 40 + (i % 9) * 15,
      output_tokens: 350 + (i % 11) * 160,
      cache_creation_input_tokens: 2_500 + (i % 5) * 900,
      cache_read_input_tokens: cacheRead,
    };

    const toolName = toolNames[i % toolNames.length];
    const toolUseId = `toolu_${sid.slice(0, 4)}${i}`;
    lines.push(JSON.stringify({
      type: "assistant", uuid: uuid(), parentUuid: null, timestamp: ts,
      sessionId: sid, isSidechain: false,
      message: {
        role: "assistant", model,
        content: [
          { type: "text", text: "Working on it." },
          { type: "tool_use", id: toolUseId, name: toolName, input: {} },
        ],
        usage,
      },
    }));
    lines.push(JSON.stringify({
      type: "user", uuid: uuid(), parentUuid: null, timestamp: ts,
      sessionId: sid, isSidechain: false,
      message: {
        role: "user",
        content: [{
          type: "tool_result", tool_use_id: toolUseId,
          content: "x".repeat(800 + (i % 13) * 700),
        }],
      },
    }));
  }

  writeFileSync(join(dir, `${sid}.jsonl`), lines.join("\n") + "\n");

  // Subagents for the live session so the Agents panel has rows.
  if (name === "claudetui") {
    const subDir = join(dir, sid, "subagents");
    mkdirSync(subDir, { recursive: true });
    const agents = [
      ["a1f3", "general-purpose", "Investigate flaky queue-worker test"],
      ["b2e4", "code-reviewer", "Review retry-logic patch"],
      ["c3d5", "Explore", "Map webhook handler call sites"],
    ];
    for (const [id, type, desc] of agents) {
      writeFileSync(join(subDir, `agent-${id}.meta.json`),
        JSON.stringify({ agentType: type, description: desc }));
      const aLines = [];
      for (let i = 0; i < 14; i++) {
        aLines.push(JSON.stringify({
          type: "assistant", uuid: uuid(), parentUuid: null,
          timestamp: new Date(now - (40 - i) * min).toISOString(),
          sessionId: sid, isSidechain: true,
          message: {
            role: "assistant", model: "claude-sonnet-5",
            content: [{ type: "text", text: "…" }],
            usage: {
              input_tokens: 200, output_tokens: 480,
              cache_creation_input_tokens: 1_200,
              cache_read_input_tokens: 60_000 + i * 9_000,
            },
          },
        }));
      }
      writeFileSync(join(subDir, `agent-${id}.jsonl`), aLines.join("\n") + "\n");
    }
  }
}

history.sort((a, b) => a.timestamp - b.timestamp);
writeFileSync(join(CLAUDE, "history.jsonl"),
  history.map((h) => JSON.stringify(h)).join("\n") + "\n");

writeFileSync(join(CLAUDE, "settings.json"),
  JSON.stringify({ model: "claude-opus-5" }, null, 2));

writeFileSync(join(CLAUDE, "plugins", "installed_plugins.json"), JSON.stringify({
  version: 2,
  plugins: {
    "superpowers@claude-plugins-official": [{
      scope: "user", installPath: "/Users/demo/.claude/plugins/cache/superpowers",
      version: "6.2.0", installedAt: "2026-06-01T00:00:00Z", lastUpdated: "2026-07-20T00:00:00Z",
    }],
    "frontend-design@claude-plugins-official": [{
      scope: "user", installPath: "/Users/demo/.claude/plugins/cache/frontend-design",
      version: "2.4.1", installedAt: "2026-06-10T00:00:00Z", lastUpdated: "2026-07-18T00:00:00Z",
    }],
  },
}, null, 2));

console.log(`demo home written to ${DEMO_HOME}`);
console.log(`history entries: ${history.length}`);
