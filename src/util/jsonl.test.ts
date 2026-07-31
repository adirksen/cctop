import { describe, it, expect } from "vitest";
import { parseJsonlChunk } from "./jsonl.js";

describe("parseJsonlChunk", () => {
  it("parses empty string to empty array", () => {
    expect(parseJsonlChunk("")).toEqual([]);
  });

  it("parses single JSON line", () => {
    const chunk = '{"id":1,"name":"test"}';
    expect(parseJsonlChunk(chunk)).toEqual([{ id: 1, name: "test" }]);
  });

  it("parses multiple JSON lines", () => {
    const chunk = '{"id":1}\n{"id":2}\n{"id":3}';
    expect(parseJsonlChunk(chunk)).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
  });

  it("skips blank lines", () => {
    const chunk = '{"id":1}\n\n{"id":2}\n  \n{"id":3}';
    expect(parseJsonlChunk(chunk)).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
  });

  it("skips malformed JSON lines without throwing", () => {
    const chunk = '{"id":1}\n{invalid}\n{"id":2}\nNOT JSON\n{"id":3}';
    expect(parseJsonlChunk(chunk)).toEqual([
      { id: 1 },
      { id: 2 },
      { id: 3 },
    ]);
  });

  it("handles trailing newline", () => {
    const chunk = '{"id":1}\n{"id":2}\n';
    expect(parseJsonlChunk(chunk)).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it("parses varied JSON types", () => {
    const chunk =
      '{"type":"string","value":"hello"}\n{"type":"number","value":42}\n{"type":"boolean","value":true}';
    expect(parseJsonlChunk(chunk)).toEqual([
      { type: "string", value: "hello" },
      { type: "number", value: 42 },
      { type: "boolean", value: true },
    ]);
  });

  it("preserves array and nested object values", () => {
    const chunk =
      '{"items":[1,2,3]}\n{"nested":{"key":"value"}}\n{"mixed":{"arr":[true,false]}}';
    expect(parseJsonlChunk(chunk)).toEqual([
      { items: [1, 2, 3] },
      { nested: { key: "value" } },
      { mixed: { arr: [true, false] } },
    ]);
  });
});
