import { describe, it, expect } from "vitest";
import {
  encodeProjectPath,
  decodeProjectPath,
  projectName,
} from "./claude-home.js";

describe("encodeProjectPath", () => {
  it("encodes unix absolute path to dash-prefixed format", () => {
    expect(encodeProjectPath("/a/b")).toBe("-a-b");
    expect(encodeProjectPath("/home/user/project")).toBe("-home-user-project");
  });

  it("encodes windows path with drive letter and backslashes", () => {
    expect(encodeProjectPath("C:\\Users\\x")).toBe("C--Users-x");
    expect(encodeProjectPath("D:\\Dev\\myapp")).toBe("D--Dev-myapp");
  });

  it("replaces all slashes and colons with dashes", () => {
    expect(encodeProjectPath("/a/b/c/d")).toBe("-a-b-c-d");
    expect(encodeProjectPath("C:\\Windows\\System32")).toBe("C--Windows-System32");
  });
});

describe("decodeProjectPath", () => {
  it("decodes unix-style encoded paths back to absolute paths", () => {
    expect(decodeProjectPath("-a-b")).toBe("/a/b");
    expect(decodeProjectPath("-home-user-project")).toBe("/home/user/project");
  });

  it("round-trips encode→decode for hyphen-free absolute unix paths", () => {
    const paths = ["/a/b", "/home/user/code", "/opt/app"];
    for (const path of paths) {
      expect(decodeProjectPath(encodeProjectPath(path))).toBe(path);
    }
  });

  it("documents known hyphen-lossiness limitation", () => {
    // This test deliberately asserts lossy behavior to document a known limitation.
    // The hyphen character in the original path cannot be recovered during decode.
    // Path: /a/my-app
    // Encoded: -a-my-app (cannot distinguish path separator from original hyphen)
    // Decoded: /a/my/app (the original hyphen is lost)
    // This is intentional and documented behavior, not desired behavior.
    const pathWithHyphen = "/a/my-app";
    const encoded = encodeProjectPath(pathWithHyphen);
    const decoded = decodeProjectPath(encoded);
    expect(decoded).toBe("/a/my/app");
  });
});

describe("projectName", () => {
  it("returns last path segment from encoded unix path", () => {
    expect(projectName("-home-user-myproject")).toBe("myproject");
    expect(projectName("-opt-app")).toBe("app");
  });

  it("returns single-segment encoded path", () => {
    expect(projectName("-myapp")).toBe("myapp");
  });
});
