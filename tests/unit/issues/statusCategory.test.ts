import { describe, expect, it } from "bun:test";
import {
  CLOSED_CATEGORIES,
  isClosedCategory,
  STATUS_CATEGORIES,
} from "@/lib/status-category";

// Open or closed hangs off a status's category, not its id (BARY-161).
describe("isClosedCategory", () => {
  it("counts completed and canceled as closed", () => {
    expect(isClosedCategory("completed")).toBe(true);
    expect(isClosedCategory("canceled")).toBe(true);
  });

  it("counts every other category as open", () => {
    const open = STATUS_CATEGORIES.filter(
      (c) => !(CLOSED_CATEGORIES as readonly string[]).includes(c),
    );
    expect(open).toEqual(["backlog", "unstarted", "started"]);
    for (const c of open) expect(isClosedCategory(c)).toBe(false);
  });

  it("treats an unknown status (no category) as open", () => {
    expect(isClosedCategory(undefined)).toBe(false);
    expect(isClosedCategory(null)).toBe(false);
  });
});
