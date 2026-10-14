import { describe, expect, it } from "bun:test";
import type { FilterRule, IssueFilter } from "@/features/issues/filter";
import {
  type FilterContext,
  toIssueWhere,
} from "@/features/issues/filter-where";

// A Wednesday, mid-afternoon local time.
const NOW = new Date(2026, 9, 14, 15, 30);
const day = (d: number) => new Date(2026, 9, d);

const ctx: FilterContext = {
  userId: "me",
  now: NOW,
  statusIdsIn: async (categories) =>
    categories.includes("completed") ? ["done"] : ["todo"],
  searchIds: async (q) => (q === "login" ? ["i1", "i2"] : []),
};

const where = (filter: IssueFilter, c: FilterContext = ctx) =>
  toIssueWhere(filter, c);
const one = async (rule: FilterRule, c?: FilterContext) =>
  where({ op: "and", rules: [rule] }, c);

describe("toIssueWhere", () => {
  it("returns no condition for an empty filter", async () => {
    expect(await where({ op: "and", rules: [] })).toEqual({});
  });

  it("ANDs rules and ORs a group", async () => {
    expect(
      await where({
        op: "and",
        rules: [
          { field: "status", is: "any", value: ["todo"] },
          {
            op: "or",
            rules: [
              { field: "priority", is: "gte", value: 3 },
              { field: "label", is: "empty" },
            ],
          },
        ],
      }),
    ).toEqual({
      AND: [
        { status: { in: ["todo"] } },
        { OR: [{ priority: { gte: 3 } }, { labels: { isEmpty: true } }] },
      ],
    });
  });

  it("drops a rule without values instead of matching nothing", async () => {
    expect(await one({ field: "label", is: "any", value: [] })).toEqual({});
  });

  it("resolves @me, and drops it without a session", async () => {
    expect(
      await one({ field: "assignee", is: "any", value: ["@me", "u2"] }),
    ).toEqual({ AND: [{ assigneeId: { in: ["me", "u2"] } }] });
    expect(
      await one(
        { field: "assignee", is: "any", value: ["@me"] },
        { ...ctx, userId: null },
      ),
    ).toEqual({});
  });

  it("keeps unassigned issues for 'assignee is not'", async () => {
    expect(await one({ field: "assignee", is: "none", value: ["u2"] })).toEqual(
      {
        AND: [
          { OR: [{ assigneeId: { notIn: ["u2"] } }, { assigneeId: null }] },
        ],
      },
    );
  });

  it("handles every label operator", async () => {
    const label = (rule: Omit<FilterRule, "field">) =>
      one({ field: "label", ...rule } as FilterRule);
    expect(await label({ is: "any", value: ["a", "b"] })).toEqual({
      AND: [{ labels: { hasSome: ["a", "b"] } }],
    });
    expect(await label({ is: "all", value: ["a", "b"] })).toEqual({
      AND: [{ labels: { hasEvery: ["a", "b"] } }],
    });
    expect(await label({ is: "none", value: ["a"] })).toEqual({
      AND: [{ NOT: { labels: { hasSome: ["a"] } } }],
    });
    expect(await label({ is: "notEmpty" })).toEqual({
      AND: [{ labels: { isEmpty: false } }],
    });
  });

  it("looks status categories up through the context", async () => {
    expect(
      await one({ field: "statusCategory", is: "none", value: ["completed"] }),
    ).toEqual({ AND: [{ status: { notIn: ["done"] } }] });
  });

  it("compares numbers and keeps empty story points for 'is not'", async () => {
    expect(await one({ field: "storyPoints", is: "lte", value: 3 })).toEqual({
      AND: [{ storyPoints: { lte: 3 } }],
    });
    expect(await one({ field: "storyPoints", is: "none", value: [8] })).toEqual(
      {
        AND: [{ OR: [{ storyPoints: { notIn: [8] } }, { storyPoints: null }] }],
      },
    );
    expect(await one({ field: "estimate", is: "gte", value: 4 })).toEqual({
      AND: [{ estimateHours: { gte: 4 } }],
    });
  });

  it("resolves relative date ranges against now", async () => {
    expect(
      await one({ field: "dueDate", is: "within", value: "overdue" }),
    ).toEqual({ AND: [{ dueDate: { lt: day(14) } }] });
    expect(
      await one({ field: "dueDate", is: "within", value: "today" }),
    ).toEqual({ AND: [{ dueDate: { gte: day(14), lt: day(15) } }] });
    expect(
      await one({ field: "dueDate", is: "within", value: "next_7_days" }),
    ).toEqual({ AND: [{ dueDate: { gte: day(14), lt: day(21) } }] });
    expect(
      await one({ field: "created", is: "within", value: "last_7_days" }),
    ).toEqual({ AND: [{ created: { gte: day(8), lt: day(15) } }] });
  });

  it("excludes the named day itself for before/after", async () => {
    expect(
      await one({ field: "dueDate", is: "before", value: "2026-10-20" }),
    ).toEqual({ AND: [{ dueDate: { lt: day(20) } }] });
    expect(
      await one({ field: "updated", is: "after", value: "today" }),
    ).toEqual({ AND: [{ updated: { gte: day(15) } }] });
  });

  it("filters top-level issues and sub-issues by parent", async () => {
    expect(await one({ field: "parent", is: "empty" })).toEqual({
      AND: [{ parentId: null }],
    });
    expect(await one({ field: "parent", is: "any", value: ["i9"] })).toEqual({
      AND: [{ parentId: { in: ["i9"] } }],
    });
  });

  it("searches full text and the issue number", async () => {
    expect(
      await one({ field: "text", is: "contains", value: "login" }),
    ).toEqual({ AND: [{ OR: [{ id: { in: ["i1", "i2"] } }] }] });
    expect(
      await one({ field: "text", is: "contains", value: "ORB-12" }),
    ).toEqual({ AND: [{ OR: [{ id: { in: [] } }, { key: 12 }] }] });
  });

  it("narrows by project without widening", async () => {
    expect(await one({ field: "project", is: "any", value: ["p1"] })).toEqual({
      AND: [{ projectId: { in: ["p1"] } }],
    });
  });
});
