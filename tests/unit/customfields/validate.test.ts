import { describe, expect, it } from "bun:test";
import {
  fieldKeyFromName,
  isCalendarDate,
  isReservedFieldKey,
  toOptions,
  validateFieldValue,
  validateOptions,
} from "@/lib/custom-fields";

const options = [
  { id: "o_a", label: "Alpha", color: null },
  { id: "o_b", label: "Beta", color: "#ff0000" },
];

describe("validateFieldValue", () => {
  it("clears a field on null, undefined and blank input", () => {
    for (const type of ["TEXT", "URL", "NUMBER", "DATE"] as const) {
      expect(validateFieldValue({ type }, null)).toEqual({
        ok: true,
        value: null,
      });
      expect(validateFieldValue({ type }, undefined)).toEqual({
        ok: true,
        value: null,
      });
      expect(validateFieldValue({ type }, "   ")).toEqual({
        ok: true,
        value: null,
      });
    }
  });

  it("trims text and limits its length", () => {
    expect(validateFieldValue({ type: "TEXT" }, "  hi  ")).toEqual({
      ok: true,
      value: "hi",
    });
    expect(validateFieldValue({ type: "TEXT" }, "x".repeat(2001)).ok).toBe(
      false,
    );
    expect(validateFieldValue({ type: "TEXT" }, 5).ok).toBe(false);
  });

  it("accepts only http(s) links", () => {
    expect(
      validateFieldValue({ type: "URL" }, "https://example.com/a").ok,
    ).toBe(true);
    expect(validateFieldValue({ type: "URL" }, "javascript:alert(1)").ok).toBe(
      false,
    );
    expect(validateFieldValue({ type: "URL" }, "data:text/html,x").ok).toBe(
      false,
    );
    expect(validateFieldValue({ type: "URL" }, "not a url").ok).toBe(false);
  });

  it("accepts finite numbers, also as text with a decimal comma", () => {
    expect(validateFieldValue({ type: "NUMBER" }, 3.5)).toEqual({
      ok: true,
      value: 3.5,
    });
    expect(validateFieldValue({ type: "NUMBER" }, "2,5")).toEqual({
      ok: true,
      value: 2.5,
    });
    expect(validateFieldValue({ type: "NUMBER" }, 0)).toEqual({
      ok: true,
      value: 0,
    });
    expect(validateFieldValue({ type: "NUMBER" }, Number.NaN).ok).toBe(false);
    expect(
      validateFieldValue({ type: "NUMBER" }, Number.POSITIVE_INFINITY).ok,
    ).toBe(false);
    expect(validateFieldValue({ type: "NUMBER" }, "abc").ok).toBe(false);
    expect(validateFieldValue({ type: "NUMBER" }, 1e16).ok).toBe(false);
    expect(validateFieldValue({ type: "NUMBER" }, true).ok).toBe(false);
  });

  it("accepts only real calendar days", () => {
    expect(validateFieldValue({ type: "DATE" }, "2026-02-28").ok).toBe(true);
    expect(validateFieldValue({ type: "DATE" }, "2028-02-29").ok).toBe(true);
    expect(validateFieldValue({ type: "DATE" }, "2026-02-30").ok).toBe(false);
    expect(validateFieldValue({ type: "DATE" }, "2026-13-01").ok).toBe(false);
    expect(validateFieldValue({ type: "DATE" }, "14.08.2026").ok).toBe(false);
    expect(isCalendarDate("2026-1-1")).toBe(false);
  });

  it("keeps false as a value for a checkbox", () => {
    expect(validateFieldValue({ type: "CHECKBOX" }, false)).toEqual({
      ok: true,
      value: false,
    });
    expect(validateFieldValue({ type: "CHECKBOX" }, true)).toEqual({
      ok: true,
      value: true,
    });
    expect(validateFieldValue({ type: "CHECKBOX" }, null)).toEqual({
      ok: true,
      value: null,
    });
    expect(validateFieldValue({ type: "CHECKBOX" }, "true").ok).toBe(false);
  });

  it("checks a single choice against the options", () => {
    expect(validateFieldValue({ type: "SELECT", options }, "o_a")).toEqual({
      ok: true,
      value: "o_a",
    });
    expect(validateFieldValue({ type: "SELECT", options }, "o_x").ok).toBe(
      false,
    );
    expect(validateFieldValue({ type: "SELECT", options }, "").ok).toBe(true);
    expect(validateFieldValue({ type: "SELECT", options: [] }, "o_a").ok).toBe(
      false,
    );
  });

  it("checks several choices, drops duplicates, clears on an empty list", () => {
    expect(
      validateFieldValue({ type: "MULTI_SELECT", options }, [
        "o_a",
        "o_b",
        "o_a",
      ]),
    ).toEqual({
      ok: true,
      value: ["o_a", "o_b"],
    });
    expect(validateFieldValue({ type: "MULTI_SELECT", options }, [])).toEqual({
      ok: true,
      value: null,
    });
    expect(
      validateFieldValue({ type: "MULTI_SELECT", options }, ["o_a", "nope"]).ok,
    ).toBe(false);
    expect(
      validateFieldValue({ type: "MULTI_SELECT", options }, "o_a").ok,
    ).toBe(false);
    expect(validateFieldValue({ type: "MULTI_SELECT", options }, [1]).ok).toBe(
      false,
    );
  });

  it("checks only the shape of a person", () => {
    expect(validateFieldValue({ type: "USER" }, "u_1")).toEqual({
      ok: true,
      value: "u_1",
    });
    expect(validateFieldValue({ type: "USER" }, 1).ok).toBe(false);
  });
});

describe("validateOptions", () => {
  it("returns no options for types without choices", () => {
    expect(validateOptions("TEXT", [{ id: "x" }])).toEqual({
      ok: true,
      options: [],
    });
  });

  it("requires choices for a select", () => {
    expect(validateOptions("SELECT", []).ok).toBe(false);
    expect(validateOptions("SELECT", undefined).ok).toBe(false);
  });

  it("rejects duplicate ids, empty labels and malformed entries", () => {
    const dup = [
      { id: "a", label: "A" },
      { id: "a", label: "B" },
    ];
    expect(validateOptions("SELECT", dup).ok).toBe(false);
    expect(validateOptions("SELECT", [{ id: "a", label: "  " }]).ok).toBe(
      false,
    );
    expect(validateOptions("SELECT", [{ id: "a" }]).ok).toBe(false);
  });

  it("limits the number of choices", () => {
    const many = Array.from({ length: 51 }, (_, i) => ({
      id: `o${i}`,
      label: `L${i}`,
    }));
    expect(validateOptions("MULTI_SELECT", many).ok).toBe(false);
  });
});

describe("toOptions", () => {
  it("drops entries that are not options", () => {
    expect(
      toOptions([
        { id: "a", label: "A" },
        null,
        "x",
        { id: "", label: "B" },
        { id: "c" },
      ]),
    ).toEqual([{ id: "a", label: "A", color: null }]);
    expect(toOptions("nope")).toEqual([]);
  });
});

describe("fieldKeyFromName", () => {
  it("makes a readable ASCII key", () => {
    expect(fieldKeyFromName("Customer ID")).toBe("customer_id");
    expect(fieldKeyFromName("Größe & Maß")).toBe("groesse_mass");
    expect(fieldKeyFromName("  ??? ")).toBe("field");
  });

  it("knows the issue's own property names", () => {
    expect(isReservedFieldKey("status")).toBe(true);
    expect(isReservedFieldKey("customer_id")).toBe(false);
  });
});
