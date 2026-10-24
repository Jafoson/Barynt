import { describe, expect, it } from "bun:test";
import {
  columnOfSort,
  DEFAULT_LIST_COLUMNS,
  listColumns,
  sanitizeColumnWidths,
  sanitizeListColumns,
} from "@/features/issues/list-columns";

describe("the list's columns (BARY-175)", () => {
  it("starts with what the list always showed", () => {
    expect(listColumns(undefined)).toEqual([...DEFAULT_LIST_COLUMNS]);
  });

  it("leaves out the card fields hidden before columns existed", () => {
    const cols = listColumns([], ["labels", "dueDate"]);
    expect(cols).not.toContain("labels");
    expect(cols).not.toContain("dueDate");
    expect(cols).toContain("priority");
  });

  it("takes a list of its own, in its order, ignoring old hidden fields", () => {
    expect(
      listColumns(["title", "estimate", "identifier", "labels"], ["labels"]),
    ).toEqual(["title", "estimate", "identifier", "labels"]);
  });

  it("puts identifier and title back when a stored list lost them", () => {
    const cols = listColumns(["status", "estimate"]);
    expect(cols).toContain("identifier");
    expect(cols).toContain("title");
  });

  it("drops unknown and repeated columns", () => {
    expect(
      sanitizeListColumns(["status", "nope", "status", "created"]),
    ).toEqual(["status", "created"]);
  });

  it("knows which column a sort belongs to", () => {
    expect(columnOfSort("dueDate")).toBe("dueDate");
    expect(columnOfSort("manual")).toBeNull();
  });

  it("keeps widths sane: known columns, bounded, never the title", () => {
    expect(
      sanitizeColumnWidths({
        status: 10,
        labels: 5000,
        title: 300,
        nope: 100,
        estimate: "wide",
        dueDate: 120.6,
      }),
    ).toEqual({ status: 48, labels: 640, dueDate: 121 });
    expect(sanitizeColumnWidths(null)).toEqual({});
    expect(sanitizeColumnWidths([1, 2])).toEqual({});
  });
});
