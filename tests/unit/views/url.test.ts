import { describe, expect, it } from "bun:test";
import type { IssueFilter } from "@/features/issues/filter";
import {
  layoutFromParam,
  pickViewState,
  sameViewState,
  viewParams,
} from "@/features/views/url";

const lookups = {
  priorities: [
    { id: 3, key: "high" },
    { id: 4, key: "urgent" },
  ],
  members: [{ id: "u1", handle: "mara" }],
  labels: [{ id: "l1", slug: "bug" }],
};

const view = (filter: IssueFilter, over: object = {}) => ({
  filter,
  groupBy: null,
  sortBy: "manual" as const,
  layout: "board" as const,
  ...over,
});

describe("viewParams", () => {
  it("spells out a view's filters as the URL's slugs", () => {
    const params = viewParams(
      view({
        op: "and",
        rules: [
          { field: "status", is: "any", value: ["todo", "in_progress"] },
          { field: "priority", is: "any", value: [3, 4] },
          { field: "assignee", is: "any", value: ["u1"] },
          { field: "label", is: "any", value: ["l1"] },
          { field: "storyPoints", is: "any", value: [3] },
        ],
      }),
      lookups,
    );
    expect(Object.fromEntries(params)).toEqual({
      status: "todo,in_progress",
      priority: "high,urgent",
      assignee: "mara",
      label: "bug",
      storyPoints: "3",
      layout: "board",
    });
  });

  it("turns due-date rules back into buckets", () => {
    const params = viewParams(
      view({
        op: "and",
        rules: [
          {
            op: "or",
            rules: [
              { field: "dueDate", is: "within", value: "overdue" },
              { field: "dueDate", is: "empty" },
            ],
          },
        ],
      }),
      lookups,
    );
    expect(params.get("dueDate")).toBe("overdue,none");
  });

  it("leaves out defaults and ids that no longer resolve", () => {
    const params = viewParams(
      view(
        {
          op: "and",
          rules: [{ field: "label", is: "any", value: ["gone"] }],
        },
        { groupBy: "status", sortBy: "manual", layout: "list" },
      ),
      lookups,
    );
    expect(params.toString()).toBe("layout=list");
  });

  it("writes a non-default grouping and order", () => {
    const params = viewParams(
      view(
        { op: "and", rules: [] },
        { groupBy: "assignee", sortBy: "dueDate" },
      ),
      lookups,
    );
    expect(params.get("group")).toBe("assignee");
    expect(params.get("sort")).toBe("dueDate");
  });
});

describe("sameViewState", () => {
  const stored = new URLSearchParams("status=todo,done&layout=board");

  it("ignores the order of values and defaults", () => {
    expect(
      sameViewState(
        new URLSearchParams(
          "status=done,todo&group=status&sort=manual&layout=board",
        ),
        stored,
      ),
    ).toBe(true);
  });

  it("ignores the search and the open issue panel", () => {
    expect(
      sameViewState(
        new URLSearchParams("status=todo,done&layout=board&q=login&issue=x"),
        stored,
      ),
    ).toBe(true);
  });

  it("sees a changed filter, grouping or layout", () => {
    expect(
      sameViewState(new URLSearchParams("status=todo&layout=board"), stored),
    ).toBe(false);
    expect(
      sameViewState(
        new URLSearchParams("status=todo,done&layout=board&group=assignee"),
        stored,
      ),
    ).toBe(false);
    expect(
      sameViewState(
        new URLSearchParams("status=todo,done&layout=list"),
        stored,
      ),
    ).toBe(false);
  });

  it("sees cleared filters", () => {
    expect(sameViewState(new URLSearchParams("layout=board"), stored)).toBe(
      false,
    );
  });
});

describe("pickViewState / layoutFromParam", () => {
  it("keeps only view state", () => {
    expect(
      pickViewState({ status: "todo", q: "x", issue: "i1", layout: "list" }),
    ).toEqual({ status: "todo", layout: "list" });
  });

  it("falls back to the board for anything unknown", () => {
    expect(layoutFromParam("list")).toBe("list");
    expect(layoutFromParam("dashboard")).toBe("board");
    expect(layoutFromParam(undefined)).toBe("board");
  });
});
