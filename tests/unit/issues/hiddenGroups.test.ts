import { describe, expect, it } from "bun:test";
import type { GroupDef } from "@/features/issues/group";
import {
  hiddenGroupEntry,
  isGroupHidden,
  sanitizeHiddenGroups,
  toggleGroupHidden,
} from "@/features/issues/hidden-groups";

const status = (id: string, alwaysShow: boolean): GroupDef => ({
  key: "status",
  id,
  label: id,
  alwaysShow,
});
const done = status("done", true);
const canceled = status("canceled", false);
const high: GroupDef = {
  key: "priority",
  id: "3",
  label: "High",
  alwaysShow: true,
};

describe("isGroupHidden (BARY-47)", () => {
  it("shows every group by default, except a non-workflow status on the board", () => {
    expect(isGroupHidden([], done, "board")).toBe(false);
    expect(isGroupHidden([], done, "list")).toBe(false);
    expect(isGroupHidden([], canceled, "board")).toBe(true);
    expect(isGroupHidden([], canceled, "list")).toBe(false);
  });

  it("reads only the entry of its own grouping", () => {
    const list = [hiddenGroupEntry("status", "done")];
    expect(isGroupHidden(list, done, "board")).toBe(true);
    expect(isGroupHidden(list, { ...high, id: "done" }, "board")).toBe(false);
  });

  it("keeps colons inside the group id", () => {
    const odd = status("a:b", true);
    expect(
      isGroupHidden([hiddenGroupEntry("status", "a:b")], odd, "list"),
    ).toBe(true);
  });
});

describe("toggleGroupHidden", () => {
  it("hides a shown group and shows it again, storing nothing extra", () => {
    const hidden = toggleGroupHidden([], done, "board");
    expect(hidden).toEqual(["status:done"]);
    expect(toggleGroupHidden(hidden, done, "board")).toEqual([]);
  });

  it("turns the board's default-off status on and off with a '+' entry", () => {
    const on = toggleGroupHidden([], canceled, "board");
    expect(on).toEqual(["+status:canceled"]);
    expect(isGroupHidden(on, canceled, "board")).toBe(false);
    expect(toggleGroupHidden(on, canceled, "board")).toEqual([]);
  });

  it("the list hides Canceled with a normal entry — the board's choice doesn't leak", () => {
    const onBoard = toggleGroupHidden([], canceled, "board");
    expect(isGroupHidden(onBoard, canceled, "list")).toBe(false);
    expect(toggleGroupHidden([], canceled, "list")).toEqual([
      "status:canceled",
    ]);
  });
});

describe("sanitizeHiddenGroups", () => {
  it("drops non-strings, empty and oversized entries and duplicates", () => {
    expect(
      sanitizeHiddenGroups([
        "status:a",
        "status:a",
        "",
        5,
        null,
        "x".repeat(500),
      ]),
    ).toEqual(["status:a"]);
  });

  it("anything that isn't a list becomes empty", () => {
    expect(sanitizeHiddenGroups("status:a")).toEqual([]);
    expect(sanitizeHiddenGroups(undefined)).toEqual([]);
  });

  it("caps the length of the list", () => {
    const many = Array.from({ length: 500 }, (_, i) => `status:${i}`);
    expect(sanitizeHiddenGroups(many)).toHaveLength(200);
  });
});
