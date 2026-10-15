import { describe, expect, it } from "bun:test";
import {
  FILTER_FIELDS,
  type IssueFilter,
  narrowProjects,
  parseIssueFilter,
  pruneMissingRefs,
} from "@/features/issues/filter";

describe("parseIssueFilter", () => {
  const valid: IssueFilter = {
    op: "and",
    rules: [
      { field: "assignee", is: "any", value: ["@me"] },
      { field: "statusCategory", is: "none", value: ["completed"] },
      {
        op: "or",
        rules: [
          { field: "priority", is: "gte", value: 3 },
          { field: "dueDate", is: "before", value: "2026-11-01" },
        ],
      },
      { field: "label", is: "empty" },
    ],
  };

  it("accepts a well-formed tree", () => {
    expect(parseIssueFilter(valid)).toEqual(valid);
  });

  it("rejects an operator the field doesn't allow", () => {
    expect(
      parseIssueFilter({
        op: "and",
        rules: [{ field: "text", is: "any", value: ["x"] }],
      }),
    ).toBeNull();
  });

  it("rejects values of the wrong shape", () => {
    const bad = (rule: unknown) =>
      parseIssueFilter({ op: "and", rules: [rule] });
    expect(bad({ field: "priority", is: "any", value: ["high"] })).toBeNull();
    expect(bad({ field: "priority", is: "gte", value: [3] })).toBeNull();
    expect(bad({ field: "label", is: "empty", value: ["l1"] })).toBeNull();
    expect(bad({ field: "dueDate", is: "within", value: "soon" })).toBeNull();
    expect(bad({ field: "dueDate", is: "before", value: "14.10." })).toBeNull();
    expect(
      bad({ field: "statusCategory", is: "any", value: ["done"] }),
    ).toBeNull();
  });

  it("rejects a third level and unknown keys", () => {
    expect(
      parseIssueFilter({
        op: "and",
        rules: [{ op: "or", rules: [{ op: "or", rules: [] }] }],
      }),
    ).toBeNull();
    expect(parseIssueFilter({ op: "and", rules: [], extra: 1 })).toBeNull();
    expect(
      parseIssueFilter({ op: "and", rules: [{ field: "nope", is: "any" }] }),
    ).toBeNull();
  });

  it("allows every operator the registry lists for a field", () => {
    for (const ops of Object.values(FILTER_FIELDS))
      expect(ops.ops.length).toBeGreaterThan(0);
  });
});

describe("pruneMissingRefs", () => {
  const filter: IssueFilter = {
    op: "and",
    rules: [
      { field: "label", is: "any", value: ["l1", "gone"] },
      { field: "assignee", is: "any", value: ["@me", "left"] },
      { op: "or", rules: [{ field: "project", is: "any", value: ["p-old"] }] },
      { field: "status", is: "any", value: ["whatever"] },
    ],
  };

  it("drops missing values, keeps @me and reports what's gone", () => {
    const { filter: pruned, missing } = pruneMissingRefs(filter, {
      label: new Set(["l1"]),
      assignee: new Set(["u1"]),
      project: new Set(["p1"]),
    });
    expect(pruned.rules).toEqual([
      { field: "label", is: "any", value: ["l1"] },
      { field: "assignee", is: "any", value: ["@me"] },
      // `status` wasn't checked — no known set passed for it.
      { field: "status", is: "any", value: ["whatever"] },
    ]);
    expect(missing).toEqual([
      { field: "label", value: "gone" },
      { field: "assignee", value: "left" },
      { field: "project", value: "p-old" },
    ]);
  });

  it("returns the filter unchanged when everything still exists", () => {
    const { filter: pruned, missing } = pruneMissingRefs(filter, {});
    expect(pruned).toEqual(filter);
    expect(missing).toEqual([]);
  });
});

describe("narrowProjects", () => {
  const visible = ["p1", "p2", "p3"];
  const of = (rules: IssueFilter["rules"]) =>
    narrowProjects({ op: "and", rules }, visible);

  it("keeps every allowed project without a project rule", () => {
    expect(of([])).toEqual(visible);
  });

  it("intersects with 'any of' and removes 'none of'", () => {
    expect(
      of([
        { field: "project", is: "any", value: ["p2", "p3", "secret"] },
        { field: "project", is: "none", value: ["p3"] },
      ]),
    ).toEqual(["p2"]);
  });

  it("can't widen beyond what's allowed", () => {
    expect(of([{ field: "project", is: "any", value: ["secret"] }])).toEqual(
      [],
    );
  });

  it("ignores project rules inside an OR group", () => {
    expect(
      of([
        {
          op: "or",
          rules: [
            { field: "project", is: "any", value: ["p1"] },
            { field: "label", is: "any", value: ["l1"] },
          ],
        },
      ]),
    ).toEqual(visible);
  });
});
