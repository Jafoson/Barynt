import { describe, expect, it } from "bun:test";
import type { GroupDef } from "@/features/issues/group";
import {
  groupOrderEntries,
  moveGroup,
  orderGroups,
  sanitizeGroupOrder,
} from "@/features/issues/group-order";

const g = (id: string): GroupDef => ({
  key: "status",
  id,
  label: id,
  alwaysShow: true,
});
const defs = ["backlog", "todo", "doing", "review", "done"].map(g);
const ids = (groups: GroupDef[]) => groups.map((x) => x.id);

describe("orderGroups", () => {
  it("keeps the default order without a stored one", () => {
    expect(ids(orderGroups(defs, []))).toEqual(ids(defs));
  });

  it("follows the stored order", () => {
    expect(
      ids(
        orderGroups(defs, [
          "status:done",
          "status:review",
          "status:doing",
          "status:todo",
          "status:backlog",
        ]),
      ),
    ).toEqual(["done", "review", "doing", "todo", "backlog"]);
  });

  it("puts a group the order doesn't know after its default neighbour", () => {
    // `doing` came later — it was right after `todo` by default.
    expect(
      ids(
        orderGroups(defs, [
          "status:review",
          "status:todo",
          "status:backlog",
          "status:done",
        ]),
      ),
    ).toEqual(["review", "todo", "doing", "backlog", "done"]);
  });

  it("puts a new first group first", () => {
    expect(ids(orderGroups(defs, ["status:todo", "status:done"]))).toEqual([
      "backlog",
      "todo",
      "doing",
      "review",
      "done",
    ]);
  });

  it("ignores entries of another grouping or of groups that are gone", () => {
    expect(
      ids(orderGroups(defs, ["priority:3", "status:gone", "status:done"])),
    ).toEqual(["backlog", "todo", "doing", "review", "done"]);
  });
});

describe("moveGroup", () => {
  it("moves a group before or after another", () => {
    const [backlog, , , review] = defs;
    expect(ids(moveGroup(defs, review, backlog, "before"))).toEqual([
      "review",
      "backlog",
      "todo",
      "doing",
      "done",
    ]);
    expect(ids(moveGroup(defs, backlog, review, "after"))).toEqual([
      "todo",
      "doing",
      "review",
      "backlog",
      "done",
    ]);
  });

  it("leaves the order alone when dropped on itself", () => {
    expect(moveGroup(defs, defs[1], defs[1], "before")).toBe(defs);
  });
});

describe("groupOrderEntries / sanitizeGroupOrder", () => {
  it("stores every group's entry", () => {
    expect(groupOrderEntries(defs.slice(0, 2))).toEqual([
      "status:backlog",
      "status:todo",
    ]);
  });

  it("drops junk, duplicates and visibility markers", () => {
    expect(
      sanitizeGroupOrder(["status:a", "status:a", "+status:b", 3, ""]),
    ).toEqual(["status:a"]);
  });
});
