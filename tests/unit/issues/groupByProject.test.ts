import { describe, expect, it } from "bun:test";
import {
  canMoveBetweenGroups,
  groupDefs,
  groupIdOf,
  groupPatch,
  visibleGroups,
} from "@/features/issues/group";
import type { Issue } from "@/types";

const labels = { unassigned: "Unassigned", noStoryPoints: "No points" };
const projects = [
  { id: "p1", name: "Mobile", color: "#5ab98a" },
  { id: "p2", name: "Web", color: "#3b7bd5" },
];
const issue = (id: string, project: string) =>
  ({ id, project }) as unknown as Issue;

describe("grouping by project (V8)", () => {
  it("groups by the issue's project, only projects that have issues", () => {
    const issues = [issue("a", "p2")];
    const defs = groupDefs(
      "project",
      { statuses: [], priorities: [], issueTypes: [], members: [], projects },
      labels,
      issues,
    );
    expect(defs.map((d) => [d.id, d.label, d.color])).toEqual([
      ["p1", "Mobile", "#5ab98a"],
      ["p2", "Web", "#3b7bd5"],
    ]);
    expect(visibleGroups(defs, issues).map((d) => d.id)).toEqual(["p2"]);
    expect(groupIdOf(issues[0], "project")).toBe("p2");
  });

  it("doesn't move a card into another project", () => {
    expect(canMoveBetweenGroups("project")).toBe(false);
    expect(canMoveBetweenGroups("status")).toBe(true);
    expect(groupPatch("project", "p1")).toEqual({});
  });
});
