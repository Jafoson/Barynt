import { describe, expect, test } from "bun:test";
import {
  compareIssues,
  isSortKey,
  sortByKey,
  sortKeyFromParam,
} from "@/features/issues/sort";
import type { Issue, IssueType, Status, User } from "@/types";

/** Only the fields each test actually reads — the rest doesn't concern the calculation. */
const issue = (fields: Partial<Issue> & { id: string }) =>
  ({
    rank: 0,
    created: 0,
    updated: 0,
    priority: 0,
    status: "s1",
    type: "t1",
    assignee: null,
    title: "",
    storyPoints: null,
    dueDate: null,
    estimateHours: null,
    ...fields,
  }) as Issue;

const statuses = [
  { id: "s1", name: "Todo" },
  { id: "s2", name: "Doing" },
  { id: "s3", name: "Done" },
] as Status[];

const issueTypes = [
  { id: "t1", name: "Feature" },
  { id: "t2", name: "Bug" },
] as IssueType[];

const members = [
  { id: "u1", firstName: "Bea", lastName: "Zed" },
  { id: "u2", firstName: "Amy", lastName: "Anders" },
] as User[];

const lookups = { statuses, issueTypes, members };

describe("isSortKey / sortKeyFromParam", () => {
  test("accepts every real key", () => {
    expect(isSortKey("manual")).toBe(true);
    expect(isSortKey("priority")).toBe(true);
  });

  test("rejects anything else", () => {
    expect(isSortKey("not-a-real-key")).toBe(false);
  });

  test("falls back to manual for anything missing or stale", () => {
    expect(sortKeyFromParam(undefined)).toBe("manual");
    expect(sortKeyFromParam("not-a-real-key")).toBe("manual");
    expect(sortKeyFromParam("priority")).toBe("priority");
  });
});

describe("compareIssues", () => {
  test("returns null for 'manual' — drag-and-drop owns that case", () => {
    expect(compareIssues("manual", lookups)).toBeNull();
  });

  test("priority: higher number (more urgent) first", () => {
    const a = issue({ id: "a", priority: 1 });
    const b = issue({ id: "b", priority: 3 });
    expect(compareIssues("priority", lookups)?.(a, b)).toBeGreaterThan(0);
  });

  test("type/status: by position in the lookup list", () => {
    const bug = issue({ id: "a", type: "t2" });
    const feature = issue({ id: "b", type: "t1" });
    expect(compareIssues("type", lookups)?.(feature, bug)).toBeLessThan(0);

    const done = issue({ id: "c", status: "s3" });
    const todo = issue({ id: "d", status: "s1" });
    expect(compareIssues("status", lookups)?.(todo, done)).toBeLessThan(0);
  });

  test("storyPoints/estimate: higher first, missing always last", () => {
    const three = issue({ id: "a", storyPoints: 3 });
    const eight = issue({ id: "b", storyPoints: 8 });
    const none = issue({ id: "c", storyPoints: null });
    expect(compareIssues("storyPoints", lookups)?.(eight, three)).toBeLessThan(
      0,
    );
    expect(compareIssues("storyPoints", lookups)?.(three, none)).toBeLessThan(
      0,
    );
    expect(
      compareIssues("storyPoints", lookups)?.(none, three),
    ).toBeGreaterThan(0);
  });

  test("dueDate: soonest first, missing always last", () => {
    const soon = issue({ id: "a", dueDate: 100 });
    const later = issue({ id: "b", dueDate: 200 });
    const none = issue({ id: "c", dueDate: null });
    expect(compareIssues("dueDate", lookups)?.(soon, later)).toBeLessThan(0);
    expect(compareIssues("dueDate", lookups)?.(none, soon)).toBeGreaterThan(0);
  });

  test("assignee: alphabetical by full name, unassigned last", () => {
    const amy = issue({ id: "a", assignee: "u2" }); // Amy Anders
    const bea = issue({ id: "b", assignee: "u1" }); // Bea Zed
    const none = issue({ id: "c", assignee: null });
    expect(compareIssues("assignee", lookups)?.(amy, bea)).toBeLessThan(0);
    expect(compareIssues("assignee", lookups)?.(none, amy)).toBeGreaterThan(0);
  });

  test("title: alphabetical", () => {
    const a = issue({ id: "a", title: "Apple" });
    const b = issue({ id: "b", title: "Banana" });
    expect(compareIssues("title", lookups)?.(a, b)).toBeLessThan(0);
  });

  test("created/updated: newest first", () => {
    const older = issue({ id: "a", created: 100, updated: 100 });
    const newer = issue({ id: "b", created: 200, updated: 200 });
    expect(compareIssues("created", lookups)?.(newer, older)).toBeLessThan(0);
    expect(compareIssues("updated", lookups)?.(newer, older)).toBeLessThan(0);
  });

  test("ties break by rank, so an otherwise-equal group doesn't reshuffle", () => {
    const a = issue({ id: "a", priority: 2, rank: 200 });
    const b = issue({ id: "b", priority: 2, rank: 100 });
    expect(compareIssues("priority", lookups)?.(a, b)).toBeGreaterThan(0);
  });
});

describe("sortByKey", () => {
  test("'manual' sorts by rank, same as sortByRank", () => {
    const input = [
      issue({ id: "b", rank: 200 }),
      issue({ id: "a", rank: 100 }),
    ];
    expect(sortByKey(input, "manual", lookups).map((i) => i.id)).toEqual([
      "a",
      "b",
    ]);
  });

  test("a real key sorts by that field, not by rank", () => {
    const input = [
      issue({ id: "low", priority: 1, rank: 1 }),
      issue({ id: "high", priority: 5, rank: 999 }),
    ];
    expect(sortByKey(input, "priority", lookups).map((i) => i.id)).toEqual([
      "high",
      "low",
    ]);
  });

  test("doesn't mutate the input array", () => {
    const input = [
      issue({ id: "b", rank: 200 }),
      issue({ id: "a", rank: 100 }),
    ];
    sortByKey(input, "manual", lookups);
    expect(input.map((i) => i.id)).toEqual(["b", "a"]);
  });
});
