import { describe, it, expect } from "vitest";
import {
  formatDuration,
  formatTokens,
  formatBytes,
  formatCost,
  formatTime,
  truncate,
} from "./format.js";

describe("formatDuration", () => {
  it("formats seconds only", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(500)).toBe("0s");
    expect(formatDuration(1000)).toBe("1s");
    expect(formatDuration(59999)).toBe("59s");
  });

  it("formats minutes and seconds at 60 second boundary", () => {
    expect(formatDuration(60000)).toBe("1m 0s");
    expect(formatDuration(90000)).toBe("1m 30s");
    expect(formatDuration(3599999)).toBe("59m 59s");
  });

  it("formats hours and minutes at 3600 second boundary", () => {
    expect(formatDuration(3600000)).toBe("1h 0m");
    expect(formatDuration(5400000)).toBe("1h 30m");
    expect(formatDuration(86399999)).toBe("23h 59m");
  });

  it("formats days and hours at 86400 second boundary", () => {
    expect(formatDuration(86400000)).toBe("1d 0h");
    expect(formatDuration(90000000)).toBe("1d 1h");
  });
});

describe("formatTokens", () => {
  it("formats plain numbers under 1K", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(999)).toBe("999");
  });

  it("formats K at 1000 boundary with one decimal", () => {
    expect(formatTokens(1000)).toBe("1.0K");
    expect(formatTokens(1500)).toBe("1.5K");
    expect(formatTokens(999999)).toBe("1000.0K");
  });

  it("formats M at 1000000 boundary with one decimal", () => {
    expect(formatTokens(1000000)).toBe("1.0M");
    expect(formatTokens(1500000)).toBe("1.5M");
    expect(formatTokens(10000000)).toBe("10.0M");
  });
});

describe("formatBytes", () => {
  it("formats bytes without suffix", () => {
    expect(formatBytes(0)).toBe("0B");
    expect(formatBytes(512)).toBe("512B");
    expect(formatBytes(1023)).toBe("1023B");
  });

  it("formats KB at 1024 boundary", () => {
    expect(formatBytes(1024)).toBe("1KB");
    expect(formatBytes(2048)).toBe("2KB");
    expect(formatBytes(1048575)).toBe("1024KB");
  });

  it("formats MB at 1048576 boundary", () => {
    expect(formatBytes(1048576)).toBe("1MB");
    expect(formatBytes(5242880)).toBe("5MB");
  });

  it("formats GB at 1073741824 boundary", () => {
    expect(formatBytes(1073741824)).toBe("1.0GB");
    expect(formatBytes(1610612736)).toBe("1.5GB");
  });
});

describe("formatCost", () => {
  it("formats known pricing without prefix", () => {
    expect(formatCost(1.24)).toBe("$1.24");
    expect(formatCost(0.99)).toBe("$0.99");
  });

  it("formats unknown pricing with tilde prefix", () => {
    expect(formatCost(1.24, false)).toBe("~$1.24");
    expect(formatCost(0.99, false)).toBe("~$0.99");
  });

  it("formats sub-cent values", () => {
    expect(formatCost(0.001)).toBe("<$0.01");
    expect(formatCost(0.009)).toBe("<$0.01");
  });

  it("formats sub-cent unknown pricing with tilde", () => {
    expect(formatCost(0.001, false)).toBe("~<$0.01");
    expect(formatCost(0.009, false)).toBe("~<$0.01");
  });

  it("defaults pricingKnown to true", () => {
    expect(formatCost(1.5)).toBe("$1.50");
  });
});

describe("formatTime", () => {
  it("formats numeric timestamp to HH:MM", () => {
    const timestamp = new Date("2025-01-01T14:30:00Z").getTime();
    const result = formatTime(timestamp);
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it("formats ISO string to HH:MM", () => {
    const result = formatTime("2025-01-01T14:30:00Z");
    expect(result).toMatch(/^\d{2}:\d{2}$/);
  });

  it("uses 24-hour format", () => {
    const timestamp = new Date("2025-01-01T14:30:00Z").getTime();
    const result = formatTime(timestamp);
    const [hours] = result.split(":");
    expect(parseInt(hours)).toBeGreaterThanOrEqual(0);
    expect(parseInt(hours)).toBeLessThan(24);
  });
});

describe("truncate", () => {
  it("leaves at-limit strings unchanged", () => {
    expect(truncate("hello", 5)).toBe("hello");
    expect(truncate("hi", 2)).toBe("hi");
  });

  it("under-limit strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates over-limit strings with .. suffix", () => {
    const result = truncate("hello world", 6);
    expect(result).toBe("hell..");
    expect(result.length).toBe(6);
  });

  it("maintains exact maxLen for truncated strings", () => {
    const str = "abcdefghij";
    const maxLen = 5;
    const result = truncate(str, maxLen);
    expect(result.length).toBe(maxLen);
    expect(result).toBe("abc..");
  });
});
