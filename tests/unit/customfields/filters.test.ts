import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("@/lib/db", () => ({
  db: {
    project: { findUnique: mock() },
    customField: { findMany: mock() },
    issueFieldValue: { findMany: mock() },
  },
}));

import { customFieldConditions } from "@/features/custom-fields/filters";
import { db } from "@/lib/db";

const project = db.project.findUnique as ReturnType<typeof mock>;
const fields = db.customField.findMany as ReturnType<typeof mock>;
const rows = db.issueFieldValue.findMany as ReturnType<typeof mock>;

beforeEach(() => {
  project.mockReset();
  fields.mockReset();
  rows.mockReset();
  project.mockResolvedValue({ workspaceId: "ws1" });
  fields.mockResolvedValue([
    { id: "f1", key: "stage", type: "SELECT", dateMode: "DATE" },
    { id: "f2", key: "notes", type: "TEXT", dateMode: "DATE" },
  ]);
  rows.mockResolvedValue([
    { issueId: "i1", value: "o1" },
    { issueId: "i2", value: "o2" },
  ]);
});

describe("customFieldConditions()", () => {
  it("does nothing without a cf. parameter", async () => {
    expect(
      await customFieldConditions({ status: "todo" }, { projectId: "p1" }),
    ).toEqual([]);
    expect(fields).not.toHaveBeenCalled();
  });

  it("limits to the issues holding one of the answers", async () => {
    const result = await customFieldConditions(
      { "cf.stage": "o1" },
      { projectId: "p1" },
    );
    expect(result).toEqual([{ id: { in: ["i1"] } }]);
  });

  it("adds the issues without a value for 'none'", async () => {
    const result = await customFieldConditions(
      { "cf.stage": "o2,none" },
      { workspaceId: "ws1" },
    );
    expect(result).toEqual([
      { OR: [{ id: { in: ["i2"] } }, { id: { notIn: ["i1", "i2"] } }] },
    ]);
  });

  it("drops a field that can't be filtered, or is unknown", async () => {
    expect(
      await customFieldConditions(
        { "cf.notes": "x", "cf.gone": "y" },
        { projectId: "p1" },
      ),
    ).toEqual([]);
  });

  it("ignores a repeated parameter", async () => {
    expect(
      await customFieldConditions(
        { "cf.stage": ["a", "b"] },
        { projectId: "p1" },
      ),
    ).toEqual([]);
  });
});
