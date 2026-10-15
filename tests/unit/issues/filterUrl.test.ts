import { describe, expect, it } from "bun:test";
import type { IssueFilter } from "@/features/issues/filter";
import {
  filterToParams,
  idToSlug,
  isFilterParam,
  mapFilterValues,
  parseFilterParams,
  slugToId,
} from "@/features/issues/filter-url";

const lookups = {
  priorities: [
    { id: 3, key: "high" },
    { id: 4, key: "urgent" },
  ],
  members: [{ id: "u1", handle: "mara" }],
  labels: [{ id: "l1", slug: "bug" }],
  projects: [{ id: "p1", slug: "web" }],
};

const roundTrip = (query: string) =>
  new URLSearchParams(
    filterToParams(
      mapFilterValues(
        mapFilterValues(
          parseFilterParams(new URLSearchParams(query)),
          slugToId(lookups),
        ),
        idToSlug(lookups),
      ),
    ),
  ).toString();

describe("parseFilterParams", () => {
  it("reads the old flat form unchanged", () => {
    expect(
      parseFilterParams(
        new URLSearchParams("status=todo,done&priority=high&q=login"),
      ),
    ).toEqual({
      op: "and",
      rules: [
        { field: "status", is: "any", value: ["todo", "done"] },
        { field: "priority", is: "any", value: ["high"] },
        { field: "text", is: "contains", value: "login" },
      ],
    });
  });

  it("reads operators from the key", () => {
    expect(
      parseFilterParams(
        new URLSearchParams(
          "status.not=done&label.empty=1&priority.gte=high&created.within=last_7_days&dueDate.before=2026-11-01",
        ),
      ).rules,
    ).toEqual([
      { field: "status", is: "none", value: ["done"] },
      { field: "label", is: "empty" },
      { field: "priority", is: "gte", value: "high" },
      { field: "created", is: "within", value: "last_7_days" },
      { field: "dueDate", is: "before", value: "2026-11-01" },
    ]);
  });

  it("keeps the due-date buckets as before", () => {
    expect(
      parseFilterParams(new URLSearchParams("dueDate=overdue,none")).rules,
    ).toEqual([
      {
        op: "or",
        rules: [
          { field: "dueDate", is: "within", value: "overdue" },
          { field: "dueDate", is: "empty" },
        ],
      },
    ]);
  });

  it("reads OR groups", () => {
    expect(
      parseFilterParams(
        new URLSearchParams(
          "or=priority.gte:high;dueDate.within:next_7_days|label:bug",
        ),
      ).rules,
    ).toEqual([
      {
        op: "or",
        rules: [
          { field: "priority", is: "gte", value: "high" },
          { field: "dueDate", is: "within", value: "next_7_days" },
        ],
      },
      { op: "or", rules: [{ field: "label", is: "any", value: ["bug"] }] },
    ]);
  });

  it("ignores what isn't a filter", () => {
    expect(
      parseFilterParams(
        new URLSearchParams("group=assignee&layout=board&nope.not=1&text=x"),
      ).rules,
    ).toEqual([]);
    expect(isFilterParam("status.not")).toBe(true);
    expect(isFilterParam("or")).toBe(true);
    expect(isFilterParam("layout")).toBe(false);
    expect(isFilterParam("estimate.any")).toBe(false);
  });
});

describe("slugs ↔ ids", () => {
  it("resolves slugs and keeps @me and _none", () => {
    const filter = mapFilterValues(
      parseFilterParams(
        new URLSearchParams(
          "assignee=@me,mara,_none&priority.gte=urgent&label=bug,gone&storyPoints=3,_none",
        ),
      ),
      slugToId(lookups),
    );
    expect(filter.rules).toEqual([
      { field: "assignee", is: "any", value: ["@me", "u1", "_none"] },
      { field: "priority", is: "gte", value: 4 },
      { field: "label", is: "any", value: ["l1"] },
      { field: "storyPoints", is: "any", value: [3, "_none"] },
    ]);
  });

  it("drops project rules on a project's own board", () => {
    expect(
      mapFilterValues(
        parseFilterParams(new URLSearchParams("project=web")),
        slugToId(lookups, { projects: false }),
      ).rules,
    ).toEqual([]);
  });
});

describe("filterToParams", () => {
  it("round-trips the full form", () => {
    expect(
      roundTrip(
        "status.not=done&assignee=@me&priority.gte=high&dueDate=overdue,none&or=label:bug;priority:urgent",
      ),
    ).toBe(
      new URLSearchParams(
        "status.not=done&assignee=@me&priority.gte=high&dueDate=overdue,none&or=label:bug;priority:urgent",
      ).toString(),
    );
  });

  it("puts a second rule with the same key into `or`", () => {
    const filter: IssueFilter = {
      op: "and",
      rules: [
        { field: "label", is: "any", value: ["a"] },
        { field: "label", is: "any", value: ["b"] },
      ],
    };
    expect(filterToParams(filter)).toEqual([
      ["label", "a"],
      ["or", "label:b"],
    ]);
  });
});
