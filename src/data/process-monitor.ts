import { totalmem, freemem, cpus } from "node:os";
import type { SystemStats } from "../types.js";

/**
 * Get system stats using Node.js built-ins.
 * Much more reliable than spawning tasklist/ps per PID.
 */
export function getSystemStats(claudePids: number[]): SystemStats {
  const mem = process.memoryUsage();
  const totalMem = totalmem();
  const usedMem = totalMem - freemem();
  const memPercent = Math.round((usedMem / totalMem) * 100);

  // CPU: average across cores (snapshot-based, not load average)
  const cpuCores = cpus();
  let totalIdle = 0;
  let totalTick = 0;
  for (const core of cpuCores) {
    const { user, nice, sys, idle, irq } = core.times;
    totalTick += user + nice + sys + idle + irq;
    totalIdle += idle;
  }
  const cpuPercent =
    totalTick > 0 ? Math.round(((totalTick - totalIdle) / totalTick) * 100) : 0;

  return {
    claudeProcesses: claudePids.map((pid) => ({
      pid,
      cpu: 0,
      memory: 0,
      rss: 0,
    })),
    totalCpu: cpuPercent,
    totalMemory: usedMem,
    totalRss: mem.rss,
    // Extra fields for the new system panel
    osTotalMem: totalMem,
    osUsedMem: usedMem,
    osMemPercent: memPercent,
    osCpuPercent: cpuPercent,
    processRss: mem.rss,
    processHeap: mem.heapUsed,
    cpuCoreCount: cpuCores.length,
  };
}
