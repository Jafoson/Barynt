import { describe, expect, it } from "bun:test";
import {
  decodeCursor,
  encodeCursor,
  parseCursor,
  parseLimit,
} from "@/lib/api/cursor";

describe("cursor", () => {
  it("round-trips an id through encode/decode", () => {
    const id = "clx0123456789";
    expect(decodeCursor(encodeCursor(id))).toBe(id);
  });

  it("rejects a garbled cursor", () => {
    expect(decodeCursor("")).toBeNull();
  });
});

describe("parseLimit", () => {
  it("defaults to 25", () => {
    expect(parseLimit(new URLSearchParams())).toBe(25);
  });

  it("caps at 100", () => {
    expect(parseLimit(new URLSearchParams("limit=500"))).toBe(100);
  });

  it("falls back to the default for garbage input", () => {
    expect(parseLimit(new URLSearchParams("limit=abc"))).toBe(25);
    expect(parseLimit(new URLSearchParams("limit=-5"))).toBe(25);
    expect(parseLimit(new URLSearchParams("limit=0"))).toBe(25);
  });

  it("floors a fractional limit", () => {
    expect(parseLimit(new URLSearchParams("limit=10.7"))).toBe(10);
  });
});

describe("parseCursor", () => {
  it("returns undefined when absent", () => {
    expect(parseCursor(new URLSearchParams())).toBeUndefined();
  });

  it("decodes a present cursor", () => {
    const id = "clx0123456789";
    const params = new URLSearchParams({ cursor: encodeCursor(id) });
    expect(parseCursor(params)).toBe(id);
  });
});
