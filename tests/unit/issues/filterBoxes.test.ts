import { describe, expect, it } from "bun:test";
import {
  fromRootBox,
  rootBox,
  tidy,
} from "@/features/issues/components/Topbar/filterModel";
import type { FilterRule, IssueFilter } from "@/features/issues/filter";

const todo: FilterRule = { field: "status", is: "any", value: ["todo"] };
const bug: FilterRule = { field: "label", is: "any", value: ["l1"] };
const high: FilterRule = { field: "priority", is: "gte", value: 3 };
const me: FilterRule = { field: "assignee", is: "any", value: ["@me"] };
const text: FilterRule = { field: "text", is: "contains", value: "login" };

// Todo AND (Bug OR (High AND me))
const nested: IssueFilter = {
  op: "and",
  rules: [
    todo,
    {
      op: "or",
      rules: [bug, { op: "and", rules: [high, me] }],
    },
  ],
};

describe("rootBox", () => {
  it("is 'all of these' with the top-level parts, search text left out", () => {
    expect(rootBox({ ...nested, rules: [...nested.rules, text] })).toEqual({
      op: "and",
      rules: nested.rules,
    });
  });

  it("is 'one of these' when the filter is a single OR group", () => {
    expect(
      rootBox({ op: "and", rules: [{ op: "or", rules: [bug, high] }] }),
    ).toEqual({ op: "or", rules: [bug, high] });
  });
});

describe("tidy", () => {
  it("drops empty boxes and unwraps boxes of one", () => {
    expect(
      tidy({
        op: "and",
        rules: [
          todo,
          { op: "or", rules: [] },
          { op: "or", rules: [{ op: "and", rules: [bug] }] },
        ],
      }),
    ).toEqual({ op: "and", rules: [todo, bug] });
  });

  it("merges a box into a box of the same kind", () => {
    expect(
      tidy({ op: "or", rules: [bug, { op: "or", rules: [high, me] }] }),
    ).toEqual({ op: "or", rules: [bug, high, me] });
  });

  it("keeps nesting of alternating kinds, however deep", () => {
    const deep = {
      op: "and" as const,
      rules: [
        todo,
        {
          op: "or" as const,
          rules: [
            bug,
            {
              op: "and" as const,
              rules: [high, { op: "or" as const, rules: [me, todo] }],
            },
          ],
        },
      ],
    };
    expect(tidy(deep)).toEqual(deep);
  });
});

describe("fromRootBox", () => {
  it("puts an 'all of these' box's parts on top, search text kept", () => {
    expect(fromRootBox(rootBox(nested), [text])).toEqual({
      ...nested,
      rules: [...nested.rules, text],
    });
  });

  it("writes a 'one of these' box as one OR group", () => {
    expect(fromRootBox({ op: "or", rules: [bug, high] })).toEqual({
      op: "and",
      rules: [{ op: "or", rules: [bug, high] }],
    });
  });

  it("writes nothing for an empty box", () => {
    expect(fromRootBox({ op: "and", rules: [] }, [text])).toEqual({
      op: "and",
      rules: [text],
    });
  });
});
