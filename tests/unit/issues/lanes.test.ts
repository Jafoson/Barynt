import { describe, expect, it } from "bun:test";
import {
  groupPatch,
  laneEntry,
  laneKeyFromParam,
} from "@/features/issues/group";

// Swimlanes (BARY-173): the board's second grouping.

describe("laneKeyFromParam", () => {
  it("reads a grouping as lanes", () => {
    expect(laneKeyFromParam("assignee", "status")).toBe("assignee");
  });

  it("no lanes for nothing, a stale value, or the columns' own grouping", () => {
    expect(laneKeyFromParam(undefined, "status")).toBeNull();
    expect(laneKeyFromParam("", "status")).toBeNull();
    expect(laneKeyFromParam("mood", "status")).toBeNull();
    expect(laneKeyFromParam("status", "status")).toBeNull();
  });
});

describe("laneEntry", () => {
  it("names the grouping, so other lanes never match", () => {
    expect(laneEntry("assignee", "u1")).toBe("assignee:u1");
    expect(laneEntry("priority", "u1")).not.toBe(laneEntry("assignee", "u1"));
  });
});

describe("a drop into a cell", () => {
  it("sets the column's and the lane's value together", () => {
    expect({
      ...groupPatch("status", "in_progress"),
      ...groupPatch("assignee", "u1"),
    }).toEqual({ status: "in_progress", assignee: "u1" });
    // "No assignee" lane: unassigns.
    expect(groupPatch("assignee", "none")).toEqual({ assignee: null });
  });
});
