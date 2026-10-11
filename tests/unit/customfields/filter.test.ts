import { describe, expect, it } from "bun:test";
import {
  fieldKeyOfParam,
  filterParam,
  isFilterableField,
  matchesFieldFilter,
} from "@/lib/custom-fields/filter";

const TODAY = "2026-10-11";
const WEEK = "2026-10-18";
const match = (type: string, value: unknown, answers: string[]) =>
  matchesFieldFilter({ type } as never, value as never, answers, TODAY, WEEK);

describe("isFilterableField", () => {
  it("offers choices, people, yes/no and days — not text, links, numbers, times", () => {
    for (const type of ["SELECT", "MULTI_SELECT", "USER", "CHECKBOX"]) {
      expect(isFilterableField({ type } as never)).toBe(true);
    }
    for (const type of ["TEXT", "URL", "NUMBER"]) {
      expect(isFilterableField({ type } as never)).toBe(false);
    }
    expect(isFilterableField({ type: "DATE", dateMode: "DATE" } as never)).toBe(
      true,
    );
    expect(isFilterableField({ type: "DATE", dateMode: "TIME" } as never)).toBe(
      false,
    );
  });
});

describe("parameter names", () => {
  it("round-trips a field key", () => {
    expect(filterParam("reviewer")).toBe("cf.reviewer");
    expect(fieldKeyOfParam("cf.reviewer")).toBe("reviewer");
    expect(fieldKeyOfParam("status")).toBeNull();
    expect(fieldKeyOfParam("cf.")).toBeNull();
  });
});

describe("matchesFieldFilter", () => {
  it("takes no answers as no filter", () => {
    expect(match("SELECT", null, [])).toBe(true);
  });

  it("matches a single choice or a person by id, any of several", () => {
    expect(match("SELECT", "o1", ["o1", "o2"])).toBe(true);
    expect(match("SELECT", "o3", ["o1", "o2"])).toBe(false);
    expect(match("USER", "u1", ["u1"])).toBe(true);
  });

  it("matches a multi choice when it holds one of the answers", () => {
    expect(match("MULTI_SELECT", ["a", "b"], ["b"])).toBe(true);
    expect(match("MULTI_SELECT", ["a"], ["b"])).toBe(false);
  });

  it("answers 'none' for a field without a value", () => {
    expect(match("SELECT", null, ["none"])).toBe(true);
    expect(match("SELECT", "o1", ["none"])).toBe(false);
    expect(match("MULTI_SELECT", null, ["none", "a"])).toBe(true);
  });

  it("treats an unchecked box and no answer alike", () => {
    expect(match("CHECKBOX", true, ["yes"])).toBe(true);
    expect(match("CHECKBOX", false, ["no"])).toBe(true);
    expect(match("CHECKBOX", null, ["no"])).toBe(true);
    expect(match("CHECKBOX", true, ["no"])).toBe(false);
  });

  it("sorts a day into overdue, today and this week", () => {
    expect(match("DATE", "2026-10-10", ["overdue"])).toBe(true);
    expect(match("DATE", "2026-10-11", ["today"])).toBe(true);
    expect(match("DATE", "2026-10-11", ["overdue"])).toBe(false);
    expect(match("DATE", "2026-10-17", ["week"])).toBe(true);
    expect(match("DATE", "2026-10-18", ["week"])).toBe(false);
    expect(match("DATE", null, ["none"])).toBe(true);
    // An instant counts by its day.
    expect(match("DATE", "2026-10-11T22:30:00.000Z", ["today"])).toBe(true);
  });
});
