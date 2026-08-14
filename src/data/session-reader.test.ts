import { describe, it, expect } from "vitest";
import { parseWindowsProcessList } from "./session-reader.js";

/** Build the JSON shape `Get-CimInstance … | ConvertTo-Json -Compress` emits. */
function psJson(
  rows: Array<{ ProcessId: number; Name: string; CommandLine: string | null }>
): string {
  // PowerShell emits a bare object (not a one-element array) for single rows.
  return JSON.stringify(rows.length === 1 ? rows[0] : rows);
}

const SELF_PID = 99999;

describe("parseWindowsProcessList", () => {
  it("includes an npm-installed Claude Code running under node.exe", () => {
    const stdout = psJson([
      {
        ProcessId: 4242,
        Name: "node.exe",
        CommandLine:
          '"C:\\Program Files\\nodejs\\node.exe" "C:\\Users\\jo\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js"',
      },
    ]);
    expect(parseWindowsProcessList(stdout, SELF_PID)).toEqual([4242]);
  });

  it("includes the native-installer claude.exe even with no command line", () => {
    const stdout = psJson([
      { ProcessId: 100, Name: "claude.exe", CommandLine: null },
      {
        ProcessId: 200,
        Name: "claude.exe",
        CommandLine: 'C:\\Users\\jo\\.local\\bin\\claude.exe',
      },
    ]);
    expect(parseWindowsProcessList(stdout, SELF_PID)).toEqual([100, 200]);
  });

  it("includes a bun-hosted install", () => {
    const stdout = psJson([
      {
        ProcessId: 7,
        Name: "bun.exe",
        CommandLine:
          "C:\\Users\\jo\\.bun\\bin\\bun.exe C:\\Users\\jo\\.bun\\install\\global\\node_modules\\@anthropic-ai/claude-code/cli.js",
      },
    ]);
    expect(parseWindowsProcessList(stdout, SELF_PID)).toEqual([7]);
  });

  it("excludes Claude Desktop despite its claude.exe name", () => {
    const stdout = psJson([
      {
        ProcessId: 300,
        Name: "claude.exe",
        CommandLine:
          '"C:\\Users\\jo\\AppData\\Local\\AnthropicClaude\\app-1.5.0\\claude.exe"',
      },
    ]);
    expect(parseWindowsProcessList(stdout, SELF_PID)).toEqual([]);
  });

  it("excludes Electron child processes by their --type= flag", () => {
    const stdout = psJson([
      {
        ProcessId: 301,
        Name: "claude.exe",
        CommandLine:
          '"C:\\some\\claude.exe" --type=renderer --field-trial-handle=x',
      },
    ]);
    expect(parseWindowsProcessList(stdout, SELF_PID)).toEqual([]);
  });

  it("excludes unrelated node.exe processes and node rows with no command line", () => {
    const stdout = psJson([
      {
        ProcessId: 400,
        Name: "node.exe",
        CommandLine: '"C:\\Program Files\\nodejs\\node.exe" webpack serve',
      },
      { ProcessId: 401, Name: "node.exe", CommandLine: null },
    ]);
    expect(parseWindowsProcessList(stdout, SELF_PID)).toEqual([]);
  });

  it("excludes cctop's own process", () => {
    const stdout = psJson([
      {
        ProcessId: SELF_PID,
        Name: "node.exe",
        CommandLine:
          '"C:\\Program Files\\nodejs\\node.exe" C:\\tools\\claude-code\\cli.js',
      },
    ]);
    expect(parseWindowsProcessList(stdout, SELF_PID)).toEqual([]);
  });

  it("handles the single-object JSON PowerShell emits for one row", () => {
    const stdout = psJson([
      {
        ProcessId: 4242,
        Name: "node.exe",
        CommandLine:
          '"C:\\Program Files\\nodejs\\node.exe" "C:\\npm\\node_modules\\@anthropic-ai\\claude-code\\cli.js"',
      },
    ]);
    expect(stdout.startsWith("{")).toBe(true); // not an array
    expect(parseWindowsProcessList(stdout, SELF_PID)).toEqual([4242]);
  });

  it("tolerates a BOM and CRLF around the JSON", () => {
    const stdout =
      "\uFEFF" +
      psJson([
        {
          ProcessId: 5,
          Name: "node.exe",
          CommandLine:
            "node C:\\x\\node_modules\\@anthropic-ai\\claude-code\\cli.js",
        },
      ]) +
      "\r\n";
    expect(parseWindowsProcessList(stdout, SELF_PID)).toEqual([5]);
  });

  it("returns [] for empty, whitespace, or malformed output", () => {
    expect(parseWindowsProcessList("", SELF_PID)).toEqual([]);
    expect(parseWindowsProcessList("  \r\n", SELF_PID)).toEqual([]);
    expect(parseWindowsProcessList("not json {", SELF_PID)).toEqual([]);
  });
});
