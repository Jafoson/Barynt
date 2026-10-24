import { describe, expect, it } from "bun:test";
import {
  createViewSchema,
  updateViewSchema,
  viewDisplaySchema,
} from "@/features/views/schema";

const base = {
  workspaceId: "ws1",
  projectId: "p1",
  name: "Meine Bugs",
  layout: "board" as const,
};

describe("createViewSchema", () => {
  it("fills in private visibility and accepts a minimal view", () => {
    const parsed = createViewSchema.parse(base);
    expect(parsed.visibility).toBe("PRIVATE");
    expect(parsed.filter).toBeUndefined();
  });

  it("trims the name and refuses an empty one", () => {
    expect(createViewSchema.parse({ ...base, name: "  Bugs  " }).name).toBe(
      "Bugs",
    );
    expect(createViewSchema.safeParse({ ...base, name: "   " }).success).toBe(
      false,
    );
  });

  it("checks the filter with the filter schema", () => {
    const ok = {
      op: "and",
      rules: [{ field: "assignee", is: "any", value: ["@me"] }],
    };
    const bad = { op: "and", rules: [{ field: "text", is: "any", value: [] }] };
    expect(createViewSchema.safeParse({ ...base, filter: ok }).success).toBe(
      true,
    );
    expect(createViewSchema.safeParse({ ...base, filter: bad }).success).toBe(
      false,
    );
  });

  it("only accepts known layouts, groupings and sort keys", () => {
    const bad = (over: object) =>
      createViewSchema.safeParse({ ...base, ...over }).success;
    expect(bad({ layout: "gantt" })).toBe(false);
    expect(bad({ groupBy: "mood" })).toBe(false);
    expect(bad({ sortBy: "random" })).toBe(false);
    expect(bad({ color: "red" })).toBe(false);
    expect(
      bad({ groupBy: "assignee", sortBy: "dueDate", color: "#aa00ff" }),
    ).toBe(true);
  });

  it("refuses unknown keys", () => {
    expect(createViewSchema.safeParse({ ...base, ownerId: "x" }).success).toBe(
      false,
    );
  });
});

describe("updateViewSchema", () => {
  it("accepts a partial patch and can clear a grouping", () => {
    expect(updateViewSchema.parse({ groupBy: null })).toEqual({
      groupBy: null,
    });
  });

  it("can't move a view to another scope", () => {
    expect(updateViewSchema.safeParse({ projectId: "p2" }).success).toBe(false);
  });
});

describe("viewDisplaySchema", () => {
  it("accepts the display options and nothing else", () => {
    expect(
      viewDisplaySchema.safeParse({
        hiddenFields: ["labels"],
        hiddenGroups: ["status:done"],
        groupOrder: ["status:todo", "status:in_progress"],
        hideEmptyGroups: true,
        showSubIssues: false,
      }).success,
    ).toBe(true);
    expect(viewDisplaySchema.safeParse({ zoom: 2 }).success).toBe(false);
  });
});
