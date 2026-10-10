import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("@/lib/db", () => ({
  db: {
    customField: {
      findMany: mock(),
      update: mock((a: object) => ({ op: "fieldUpdate", ...a })),
    },
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
mock.module("@/lib/audit", () => ({ recordAudit: mock(async () => {}) }));

import {
  FieldValueError,
  writeIssueFieldValues,
} from "@/features/custom-fields/values";
import { recordIssueAudit } from "@/features/issues/audit";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";

const fields = db.customField.findMany as ReturnType<typeof mock>;
const members = db.workspaceMember.findMany as ReturnType<typeof mock>;
const before = db.issueFieldValue.findMany as ReturnType<typeof mock>;
const upsert = db.issueFieldValue.upsert as ReturnType<typeof mock>;
const del = db.issueFieldValue.deleteMany as ReturnType<typeof mock>;
const tx = db.$transaction as ReturnType<typeof mock>;
const audit = recordIssueAudit as ReturnType<typeof mock>;
const fieldAudit = recordAudit as ReturnType<typeof mock>;
const fieldUpdate = db.customField.update as ReturnType<typeof mock>;

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
  for (const fn of [
    fields,
    members,
    before,
    upsert,
    del,
    tx,
    audit,
    fieldAudit,
    fieldUpdate,
  ])
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

  describe("choices added while filling in", () => {
    const choiceField = (over: object = {}) =>
      def({
        type: "SELECT",
        name: "Size",
        options: [{ id: "o_m", label: "Medium", color: null }],
        allowCustomOptions: true,
        ...over,
      });

    it("adds a choice with the value, in the same transaction, and logs it", async () => {
      fields.mockResolvedValue([choiceField()]);
      await writeIssueFieldValues(ISSUE, { f1: { create: "Huge" } }, "u1");

      const ops = tx.mock.calls[0][0] as { op: string }[];
      expect(ops.map((o) => o.op)).toEqual(["fieldUpdate", "upsert"]);
      const written = fieldUpdate.mock.calls[0][0].data.options;
      expect(written).toHaveLength(2);
      expect(written[1]).toMatchObject({ label: "Huge" });
      const newId = written[1].id;
      expect(upsert.mock.calls[0][0].update.value).toBe(newId);
      expect(fieldAudit.mock.calls[0][0]).toMatchObject({
        action: "customfield.updated",
        target: { type: "customField", label: "Size: + Huge" },
      });
    });

    it("shows the new choice by its name in the issue's log", async () => {
      fields.mockResolvedValue([choiceField()]);
      await writeIssueFieldValues(ISSUE, { f1: { create: "Huge" } }, "u1");
      expect(audit.mock.calls[0][4]).toBe("Size: — → Huge");
    });

    it("reuses a choice that has the same name, ignoring case", async () => {
      fields.mockResolvedValue([choiceField()]);
      await writeIssueFieldValues(ISSUE, { f1: { create: "medium" } }, "u1");
      expect(fieldUpdate).not.toHaveBeenCalled();
      expect(upsert.mock.calls[0][0].update.value).toBe("o_m");
    });

    it("refuses a new choice when the field does not allow it", async () => {
      fields.mockResolvedValue([choiceField({ allowCustomOptions: false })]);
      await expect(
        writeIssueFieldValues(ISSUE, { f1: { create: "Huge" } }, "u1"),
      ).rejects.toMatchObject({ reason: "invalid_value" });
      expect(tx).not.toHaveBeenCalled();
    });

    it("refuses an empty or over-long name and a full list", async () => {
      fields.mockResolvedValue([choiceField()]);
      for (const create of ["   ", "x".repeat(61)]) {
        await expect(
          writeIssueFieldValues(ISSUE, { f1: { create } }, "u1"),
        ).rejects.toMatchObject({ reason: "invalid_value" });
      }
      const full = Array.from({ length: 50 }, (_, i) => ({
        id: `o${i}`,
        label: `L${i}`,
        color: null,
      }));
      fields.mockResolvedValue([choiceField({ options: full })]);
      await expect(
        writeIssueFieldValues(ISSUE, { f1: { create: "One more" } }, "u1"),
      ).rejects.toMatchObject({ reason: "invalid_value" });
    });

    it("adds several choices to a multi-choice field in one go", async () => {
      fields.mockResolvedValue([choiceField({ type: "MULTI_SELECT" })]);
      await writeIssueFieldValues(
        ISSUE,
        { f1: ["o_m", { create: "A" }, { create: "B" }] },
        "u1",
      );
      const written = fieldUpdate.mock.calls[0][0].data.options;
      expect(written.map((o: { label: string }) => o.label)).toEqual([
        "Medium",
        "A",
        "B",
      ]);
      const value = upsert.mock.calls[0][0].update.value as string[];
      expect(value).toHaveLength(3);
      expect(value[0]).toBe("o_m");
    });

    it("does not let a choice be created on a field without choices", async () => {
      fields.mockResolvedValue([def({ allowCustomOptions: true })]);
      await expect(
        writeIssueFieldValues(ISSUE, { f1: { create: "x" } }, "u1"),
      ).rejects.toBeInstanceOf(FieldValueError);
    });
  });

  it("logs an instant as UTC text", async () => {
    fields.mockResolvedValue([
      def({ type: "DATE", dateMode: "DATETIME", name: "Release" }),
    ]);
    await writeIssueFieldValues(
      ISSUE,
      { f1: "2026-10-12T14:30:00+02:00" },
      "u1",
    );
    expect(audit.mock.calls[0][4]).toBe("Release: — → 2026-10-12 12:30 UTC");
  });

  it("checks a date value against the field's mode", async () => {
    fields.mockResolvedValue([def({ type: "DATE", dateMode: "TIME" })]);
    await expect(
      writeIssueFieldValues(ISSUE, { f1: "2026-07-01" }, "u1"),
    ).rejects.toMatchObject({ reason: "invalid_value" });
    await writeIssueFieldValues(ISSUE, { f1: "09:30" }, "u1");
    expect(upsert.mock.calls[0][0].update.value).toBe("09:30");
  });

  describe("link titles", () => {
    beforeEach(() => {
      fields.mockResolvedValue([def({ type: "URL" })]);
    });

    it("stores a title beside the link", async () => {
      await writeIssueFieldValues(
        ISSUE,
        { f1: "https://a.dev", "f1#title": "  Docs  " },
        "u1",
      );
      expect(upsert.mock.calls[0][0].create).toMatchObject({
        value: "https://a.dev",
        title: "Docs",
      });
    });

    it("keeps the title when only the link changes", async () => {
      before.mockResolvedValue([
        { fieldId: "f1", value: "https://a.dev", title: "Docs" },
      ]);
      await writeIssueFieldValues(ISSUE, { f1: "https://b.dev" }, "u1");
      expect(upsert.mock.calls[0][0].update).toMatchObject({
        value: "https://b.dev",
        title: "Docs",
      });
    });

    it("changes only the title of a stored link, without a log entry", async () => {
      before.mockResolvedValue([
        { fieldId: "f1", value: "https://a.dev", title: null },
      ]);
      await writeIssueFieldValues(ISSUE, { "f1#title": "Docs" }, "u1");
      expect(upsert.mock.calls[0][0].update).toMatchObject({ title: "Docs" });
      expect(audit).not.toHaveBeenCalled();
    });

    it("drops the title with the link and refuses a title on another type", async () => {
      before.mockResolvedValue([
        { fieldId: "f1", value: "https://a.dev", title: "Docs" },
      ]);
      await writeIssueFieldValues(ISSUE, { f1: null, "f1#title": null }, "u1");
      expect(del).toHaveBeenCalled();

      fields.mockResolvedValue([def({ type: "TEXT" })]);
      await expect(
        writeIssueFieldValues(ISSUE, { "f1#title": "x" }, "u1"),
      ).rejects.toBeInstanceOf(FieldValueError);
    });
  });
});
