/** Format a duration in milliseconds to a human-readable string like "1h 23m". */
export function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/** Format a token count with K/M suffixes. */
export function formatTokens(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}

/** Format bytes to human-readable (KB, MB, GB). */
export function formatBytes(bytes: number): string {
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)}GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(0)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${bytes}B`;
}

/**
 * Format a dollar amount for cost estimation.
 *
 * A leading `~` means the model's real price wasn't known and a family rate was
 * substituted, so the figure is a guess rather than list price × token count.
 */
export function formatCost(dollars: number, pricingKnown = true): string {
  const prefix = pricingKnown ? "" : "~";
  if (dollars < 0.01) return `${prefix}<$0.01`;
  return `${prefix}$${dollars.toFixed(2)}`;
}

/** Format a timestamp to HH:MM local time. */
export function formatTime(ts: number | string): string {
  const date = typeof ts === "string" ? new Date(ts) : new Date(ts);
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/** Truncate a string to maxLen, adding "..." if truncated. */
export function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 2) + "..";
}
