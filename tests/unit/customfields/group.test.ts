import { describe, expect, it } from "bun:test";
import {
  customFieldIdOf,
  customGroupKey,
  groupDefs,
  groupField,
  groupIdsOf,
  groupMovePatch,
  isGroupKey,
  resolveGroupKey,
  visibleGroups,
  withMovePatch,
} from "@/features/issues/group";
import type { FieldDefinition } from "@/lib/custom-fields";
import type { Issue } from "@/types";

const options = [
  { id: "o_p", label: "Peter", color: "#ff0000" },
  { id: "o_k", label: "Klaus", color: null },
];

const multi: FieldDefinition = {
  id: "f_team",
  key: "team",
  name: "Team",
  description: "",
  type: "MULTI_SELECT",
  options,
  icon: null,
  dateMode: "DATE",
  allowCustomOptions: false,
  optionVisuals: [],
  numberMode: "FREE",
  numberDecimals: null,
  numberUnit: null,
  projectId: null,
};
const single: FieldDefinition = { ...multi, id: "f_size", type: "SELECT" };
const text: FieldDefinition = { ...multi, id: "f_text", type: "TEXT" };

const issue = (fieldValues: Issue["fieldValues"]) =>
  ({
    id: "i1",
    status: "todo",
    priority: 0,
    type: "feature",
    assignee: null,
    storyPoints: null,
    fieldValues,
  }) as unknown as Issue;

const labels = { unassigned: "-", noStoryPoints: "-", noValue: "No value" };
const lookups = {
  statuses: [],
  priorities: [],
  issueTypes: [],
  members: [],
  customFields: [multi, single, text],
};

describe("custom group keys", () => {
  it("round-trips a field id and is accepted as a group key", () => {
    const key = customGroupKey("f_team");
    expect(key).toBe("cf:f_team");
    expect(customFieldIdOf(key)).toBe("f_team");
    expect(isGroupKey(key)).toBe(true);
    expect(isGroupKey("cf:")).toBe(false);
    expect(isGroupKey("nonsense")).toBe(false);
    expect(isGroupKey("status")).toBe(true);
  });

  it("falls back to status for a field that is gone or cannot be grouped by", () => {
    expect(resolveGroupKey("cf:f_team", [multi])).toBe("cf:f_team");
    expect(resolveGroupKey("cf:gone", [multi])).toBe("status");
    expect(resolveGroupKey("cf:f_text", [text])).toBe("status");
    expect(resolveGroupKey("priority", [])).toBe("priority");
    expect(groupField("cf:f_team", [multi])).toBe(multi);
    expect(groupField("status", [multi])).toBeNull();
  });
});

describe("groupIdsOf", () => {
  it("puts a multi-choice issue into the group of every value", () => {
    expect(groupIdsOf(issue({ f_team: ["o_p", "o_k"] }), "cf:f_team")).toEqual([
      "o_p",
      "o_k",
    ]);
  });

  it("puts an issue without a value into the no-value group", () => {
    expect(groupIdsOf(issue({}), "cf:f_team")).toEqual(["none"]);
    expect(groupIdsOf(issue({ f_team: [] }), "cf:f_team")).toEqual(["none"]);
  });

  it("reads a single choice and keeps the built-in groupings at one group", () => {
    expect(groupIdsOf(issue({ f_size: "o_k" }), "cf:f_size")).toEqual(["o_k"]);
    expect(groupIdsOf(issue({}), "status")).toEqual(["todo"]);
  });
});

describe("groupDefs for a custom field", () => {
  it("starts with the no-value group, then lists every choice", () => {
    const defs = groupDefs("cf:f_team", lookups, labels, []);
    expect(defs.map((d) => d.id)).toEqual(["none", "o_p", "o_k"]);
    expect(defs[0].label).toBe("No value");
    expect(defs[1]).toMatchObject({ label: "Peter", color: "#ff0000" });
    expect(defs.every((d) => d.alwaysShow)).toBe(true);
  });

  it("does the same for a single choice", () => {
    const defs = groupDefs("cf:f_size", lookups, labels, []);
    expect(defs.map((d) => d.id)).toEqual(["none", "o_p", "o_k"]);
  });

  it("has no groups for a field that is missing", () => {
    expect(groupDefs("cf:gone", lookups, labels, [])).toEqual([]);
  });

  it("shows only groups with issues when asked to", () => {
    const defs = groupDefs("cf:f_team", lookups, labels, []).map((d) => ({
      ...d,
      alwaysShow: false,
    }));
    const shown = visibleGroups(defs, [issue({ f_team: ["o_k"] }), issue({})]);
    expect(shown.map((d) => d.id)).toEqual(["none", "o_k"]);
    // The second value of a multi-choice issue counts as well.
    const both = visibleGroups(defs, [issue({ f_team: ["o_k", "o_p"] })]);
    expect(both.map((d) => d.id)).toEqual(["o_p", "o_k"]);
  });
});

describe("groupMovePatch", () => {
  it("moves between values of a multi-choice field and keeps the others", () => {
    const i = issue({ f_team: ["o_p", "o_x"] });
    expect(groupMovePatch(i, "cf:f_team", "o_p", "o_k", multi)).toEqual({
      fieldValues: { f_team: ["o_x", "o_k"] },
    });
  });

  it("does not add a value twice", () => {
    const i = issue({ f_team: ["o_p", "o_k"] });
    expect(groupMovePatch(i, "cf:f_team", "o_p", "o_k", multi)).toEqual({
      fieldValues: { f_team: ["o_k"] },
    });
  });

  it("into the no-value group only gives up the value it left", () => {
    const i = issue({ f_team: ["o_p", "o_k"] });
    expect(groupMovePatch(i, "cf:f_team", "o_p", "none", multi)).toEqual({
      fieldValues: { f_team: ["o_k"] },
    });
    const only = issue({ f_team: ["o_p"] });
    expect(groupMovePatch(only, "cf:f_team", "o_p", "none", multi)).toEqual({
      fieldValues: { f_team: null },
    });
  });

  it("out of the no-value group just adds", () => {
    expect(
      groupMovePatch(issue({}), "cf:f_team", "none", "o_k", multi),
    ).toEqual({ fieldValues: { f_team: ["o_k"] } });
  });

  it("replaces the value of a single choice", () => {
    const i = issue({ f_size: "o_p" });
    expect(groupMovePatch(i, "cf:f_size", "o_p", "o_k", single)).toEqual({
      fieldValues: { f_size: "o_k" },
    });
    expect(groupMovePatch(i, "cf:f_size", "o_p", "none", single)).toEqual({
      fieldValues: { f_size: null },
    });
  });

  it("is the old patch for a built-in grouping", () => {
    expect(groupMovePatch(issue({}), "priority", "1", "3")).toEqual({
      priority: 3,
    });
  });
});

describe("withMovePatch", () => {
  it("applies a field patch to the issue's value map", () => {
    const i = issue({ f_team: ["o_p"], f_other: "x" });
    const next = withMovePatch(i, { fieldValues: { f_team: ["o_k"] } });
    expect(next.fieldValues).toEqual({ f_team: ["o_k"], f_other: "x" });
    const cleared = withMovePatch(i, { fieldValues: { f_team: null } });
    expect(cleared.fieldValues).toEqual({ f_other: "x" });
    expect(i.fieldValues.f_team).toEqual(["o_p"]);
  });

  it("applies a plain patch for a built-in grouping", () => {
    expect(withMovePatch(issue({}), { priority: 4 }).priority).toBe(4);
  });
});
