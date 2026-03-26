import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const isWindows = process.platform === "win32";

/** Check if a process with the given PID is alive. */
export async function isPidAlive(pid: number): Promise<boolean> {
  try {
    if (isWindows) {
      const { stdout } = await execFileAsync("tasklist", [
        "/FI",
        `PID eq ${pid}`,
        "/FO",
        "CSV",
        "/NH",
      ]);
      return stdout.includes(String(pid));
    } else {
      process.kill(pid, 0);
      return true;
    }
  } catch {
    return false;
  }
}

/** Get memory usage (RSS in bytes) for a PID. Returns 0 if unavailable. */
export async function getProcessMemory(pid: number): Promise<number> {
  try {
    if (isWindows) {
      const { stdout } = await execFileAsync("tasklist", [
        "/FI",
        `PID eq ${pid}`,
        "/FO",
        "CSV",
        "/NH",
      ]);
      // Format: "process.exe","PID","Session Name","Session#","Mem Usage"
      const match = /"([\d,]+)\s*K"/.exec(stdout);
      if (match?.[1]) {
        return parseInt(match[1].replace(/,/g, ""), 10) * 1024;
      }
    } else {
      const { stdout } = await execFileAsync("ps", [
        "-o",
        "rss=",
        "-p",
        String(pid),
      ]);
      const kb = parseInt(stdout.trim(), 10);
      if (!isNaN(kb)) return kb * 1024;
    }
  } catch {
    // Process may have exited
  }
  return 0;
}
