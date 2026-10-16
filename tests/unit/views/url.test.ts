import { describe, expect, it } from "bun:test";
import type { IssueFilter } from "@/features/issues/filter";
import {
  displayFromParams,
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
  display: {},
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

describe("display in the address (BARY-165)", () => {
  it("writes a view's display settings", () => {
    const params = viewParams(
      view(
        { op: "and", rules: [] },
        {
          display: {
            hiddenGroups: ["status:done"],
            groupOrder: ["status:review", "status:todo"],
            hiddenFields: ["labels"],
            hideEmptyGroups: true,
            showSubIssues: true,
          },
        },
      ),
      lookups,
    );
    expect(Object.fromEntries(params)).toEqual({
      layout: "board",
      hide: "status:done",
      order: "status:review,status:todo",
      fields: "labels",
      empty: "1",
      sub: "1",
    });
  });

  it("reads them back, dropping what isn't plausible", () => {
    expect(
      displayFromParams({
        hide: "status:done,+status:canceled",
        order: "status:review,+status:x,status:todo",
        fields: "labels,nope",
        empty: "1",
      }),
    ).toEqual({
      hiddenGroups: ["status:done", "+status:canceled"],
      groupOrder: ["status:review", "status:todo"],
      hiddenFields: ["labels"],
      hideEmptyGroups: true,
      showSubIssues: false,
    });
  });

  it("counts a changed column order as unsaved, a reshuffled hide list not", () => {
    const stored = new URLSearchParams(
      "layout=board&hide=status:a,status:b&order=status:x,status:y",
    );
    expect(
      sameViewState(
        new URLSearchParams(
          "layout=board&hide=status:b,status:a&order=status:x,status:y",
        ),
        stored,
      ),
    ).toBe(true);
    expect(
      sameViewState(
        new URLSearchParams(
          "layout=board&hide=status:a,status:b&order=status:y,status:x",
        ),
        stored,
      ),
    ).toBe(false);
  });

  it("treats a missing switch as off", () => {
    expect(
      sameViewState(
        new URLSearchParams("layout=board&empty=0"),
        new URLSearchParams("layout=board"),
      ),
    ).toBe(true);
    expect(
      sameViewState(
        new URLSearchParams("layout=board&sub=1"),
        new URLSearchParams("layout=board"),
      ),
    ).toBe(false);
  });
});

describe("the full filter form in a view (BARY-166)", () => {
  it("writes operators, OR groups and tokens", () => {
    const params = viewParams(
      view({
        op: "and",
        rules: [
          { field: "status", is: "none", value: ["done"] },
          { field: "assignee", is: "any", value: ["@me", "_none"] },
          {
            op: "or",
            rules: [
              { field: "priority", is: "gte", value: 3 },
              { field: "label", is: "any", value: ["l1"] },
            ],
          },
        ],
      }),
      lookups,
    );
    expect(Object.fromEntries(params)).toEqual({
      "status.not": "done",
      assignee: "@me,_none",
      or: "priority.gte:high;label:bug",
      layout: "board",
    });
  });

  it("compares the full form regardless of order, search excluded", () => {
    const stored = new URLSearchParams(
      "layout=board&status.not=done,canceled&or=label:bug;priority:high",
    );
    expect(
      sameViewState(
        new URLSearchParams(
          "layout=board&or=priority:high;label:bug&status.not=canceled,done&q=x",
        ),
        stored,
      ),
    ).toBe(true);
    expect(
      sameViewState(
        new URLSearchParams("layout=board&status=done,canceled"),
        stored,
      ),
    ).toBe(false);
  });

  it("keeps the full form when saving", () => {
    expect(
      pickViewState({
        "status.not": "done",
        or: "label:bug",
        q: "login",
        issue: "x",
        layout: "list",
      }),
    ).toEqual({ "status.not": "done", or: "label:bug", layout: "list" });
  });
});
