import { describe, expect, it } from "bun:test";
import {
  fromAlternatives,
  toAlternatives,
} from "@/features/issues/components/Topbar/filterModel";
import type { FilterRule, IssueFilter } from "@/features/issues/filter";

const done: FilterRule = { field: "status", is: "none", value: ["done"] };
const bug: FilterRule = { field: "label", is: "any", value: ["l1"] };
const high: FilterRule = { field: "priority", is: "gte", value: 3 };
const me: FilterRule = { field: "assignee", is: "any", value: ["@me"] };
const text: FilterRule = { field: "text", is: "contains", value: "login" };

describe("toAlternatives", () => {
  it("is one alternative for plain rules, none for no rule", () => {
    expect(toAlternatives({ op: "and", rules: [done, bug] })).toEqual([
      [done, bug],
    ]);
    expect(toAlternatives({ op: "and", rules: [text] })).toEqual([]);
  });

  it("spells an OR group out, the shared rules in each", () => {
    const tree: IssueFilter = {
      op: "and",
      rules: [
        done,
        { op: "or", rules: [bug, { op: "and", rules: [me, high] }] },
      ],
    };
    expect(toAlternatives(tree)).toEqual([
      [done, bug],
      [done, me, high],
    ]);
  });

  it("multiplies two OR groups", () => {
    const tree: IssueFilter = {
      op: "and",
      rules: [
        { op: "or", rules: [bug, high] },
        { op: "or", rules: [me, done] },
      ],
    };
    expect(toAlternatives(tree)).toHaveLength(4);
  });
});

describe("fromAlternatives", () => {
  it("writes one alternative as plain rules, the search text kept", () => {
    expect(fromAlternatives([[done, bug]], [text])).toEqual({
      op: "and",
      rules: [done, bug, text],
    });
  });

  it("pulls what every alternative shares to the top", () => {
    expect(
      fromAlternatives([
        [done, bug],
        [done, high],
      ]),
    ).toEqual({ op: "and", rules: [done, { op: "or", rules: [bug, high] }] });
  });

  it("keeps several rules of one alternative together", () => {
    expect(fromAlternatives([[me, high], [bug]])).toEqual({
      op: "and",
      rules: [{ op: "or", rules: [{ op: "and", rules: [me, high] }, bug] }],
    });
  });

  it("drops the group when one alternative is nothing but shared rules", () => {
    expect(fromAlternatives([[done], [done, bug]])).toEqual({
      op: "and",
      rules: [done],
    });
  });

  it("reads back what it wrote", () => {
    const alts = [
      [done, bug],
      [done, me, high],
    ];
    expect(toAlternatives(fromAlternatives(alts))).toEqual(alts);
  });
});
