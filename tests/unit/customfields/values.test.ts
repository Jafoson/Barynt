import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("@/lib/db", () => ({
  db: {
    customField: { findMany: mock() },
    workspaceMember: { findMany: mock() },
    issueFieldValue: {
      findMany: mock(),
      upsert: mock((a: object) => ({ op: "upsert", ...a })),
      deleteMany: mock((a: object) => ({ op: "delete", ...a })),
    },
    $transaction: mock(async (ops: unknown[]) => ops),
  },
}));
mock.module("@/features/issues/audit", () => ({
  recordIssueAudit: mock(async () => {}),
}));

import {
  FieldValueError,
  writeIssueFieldValues,
} from "@/features/custom-fields/values";
import { recordIssueAudit } from "@/features/issues/audit";
import { db } from "@/lib/db";

const fields = db.customField.findMany as ReturnType<typeof mock>;
const members = db.workspaceMember.findMany as ReturnType<typeof mock>;
const before = db.issueFieldValue.findMany as ReturnType<typeof mock>;
const upsert = db.issueFieldValue.upsert as ReturnType<typeof mock>;
const del = db.issueFieldValue.deleteMany as ReturnType<typeof mock>;
const tx = db.$transaction as ReturnType<typeof mock>;
const audit = recordIssueAudit as ReturnType<typeof mock>;

const ISSUE = {
  id: "i1",
  key: 7,
  projectId: "p1",
  project: { workspaceId: "ws1", prefix: "APP" },
};

const def = (over: object) => ({
  id: "f1",
  workspaceId: "ws1",
  projectId: null,
  name: "Customer",
  type: "TEXT",
  options: [],
  ...over,
});

beforeEach(() => {
  for (const fn of [fields, members, before, upsert, del, tx, audit])
    fn.mockClear();
  fields.mockResolvedValue([def({})]);
  members.mockResolvedValue([]);
  before.mockResolvedValue([]);
});

describe("writeIssueFieldValues()", () => {
  it("does nothing without values", async () => {
    await writeIssueFieldValues(ISSUE, {}, "u1");
    expect(fields).not.toHaveBeenCalled();
  });

  it("only looks at fields of this workspace that apply to this project", async () => {
    await writeIssueFieldValues(ISSUE, { f1: "Acme" }, "u1");
    expect(fields.mock.calls[0][0].where).toEqual({
      id: { in: ["f1"] },
      workspaceId: "ws1",
      archivedAt: null,
      OR: [{ projectId: null }, { projectId: "p1" }],
    });
  });

  it("treats a field it did not find as unknown", async () => {
    fields.mockResolvedValue([]);
    await expect(
      writeIssueFieldValues(ISSUE, { nope: "x" }, "u1"),
    ).rejects.toMatchObject({ fieldId: "nope", reason: "unknown_field" });
    expect(tx).not.toHaveBeenCalled();
  });

  it("writes nothing when one value of the batch does not fit", async () => {
    fields.mockResolvedValue([
      def({ id: "f1" }),
      def({ id: "f2", type: "NUMBER", name: "Size" }),
    ]);
    const run = writeIssueFieldValues(ISSUE, { f1: "ok", f2: "abc" }, "u1");
    await expect(run).rejects.toBeInstanceOf(FieldValueError);
    await expect(run).rejects.toMatchObject({
      fieldId: "f2",
      reason: "invalid_value",
    });
    expect(tx).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("sets a value and records what changed", async () => {
    before.mockResolvedValue([{ fieldId: "f1", value: "Old" }]);
    await writeIssueFieldValues(ISSUE, { f1: "  New  " }, "u1");
    expect(upsert.mock.calls[0][0]).toMatchObject({
      where: { issueId_fieldId: { issueId: "i1", fieldId: "f1" } },
      update: { value: "New" },
    });
    expect(audit.mock.calls[0].slice(0, 2)).toEqual([
      "issue.field.changed",
      "i1",
    ]);
    expect(audit.mock.calls[0][4]).toBe("Customer: Old → New");
  });

  it("clears a value by deleting the row", async () => {
    before.mockResolvedValue([{ fieldId: "f1", value: "Old" }]);
    await writeIssueFieldValues(ISSUE, { f1: null }, "u1");
    expect(del.mock.calls[0][0]).toEqual({
      where: { issueId: "i1", fieldId: "f1" },
    });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("skips values that did not change", async () => {
    before.mockResolvedValue([{ fieldId: "f1", value: "Same" }]);
    await writeIssueFieldValues(ISSUE, { f1: "Same" }, "u1");
    expect(tx).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalled();
  });

  it("shows a choice by its label in the log", async () => {
    fields.mockResolvedValue([
      def({
        type: "SELECT",
        name: "Size",
        options: [{ id: "o_m", label: "Medium", color: null }],
      }),
    ]);
    await writeIssueFieldValues(ISSUE, { f1: "o_m" }, "u1");
    expect(audit.mock.calls[0][4]).toBe("Size: — → Medium");
  });

  it("only accepts members of the workspace as a person", async () => {
    fields.mockResolvedValue([def({ type: "USER", name: "Owner" })]);
    await expect(
      writeIssueFieldValues(ISSUE, { f1: "stranger" }, "u1"),
    ).rejects.toMatchObject({ reason: "invalid_value" });

    members.mockResolvedValue([{ userId: "u2" }]);
    await writeIssueFieldValues(ISSUE, { f1: "u2" }, "u1");
    expect(upsert).toHaveBeenCalledTimes(1);
  });
});
