import { beforeEach, describe, expect, it, mock } from "bun:test";

// Answering a custom field on an issue. What matters: filling a field in is editing the issue (the
// same two permissions as `updateIssue`, the reporter and the assignee for `.own`), the field has to
// be one this issue has (its workspace's, workspace-wide or its own project's, not archived), the
// answer is checked against the type and never trusted, a person has to be a member of the workspace,
// an answer that is already there writes and logs nothing, and every change is logged once. No real
// database, no real permissions.

const mockIssueFind = mock();
const mockDefFind = mock();
const mockValueFind = mock();
const mockValueUpsert = mock();
const mockValueDeleteMany = mock();
const mockMemberFind = mock();
const mockUserFind = mock();
const mockRequire = mock();
const mockAudit = mock();
const mockRevalidate = mock();
const mockProjectChange = mock();

class PermissionError extends Error {
  permission: string;
  constructor(permission: string) {
    super(`Missing permission: ${permission}`);
    this.permission = permission;
  }
}

mock.module("@/lib/db", () => ({
  db: {
    issue: { findUnique: mockIssueFind },
    customFieldDefinition: { findUnique: mockDefFind },
    customFieldValue: {
      findUnique: mockValueFind,
      upsert: mockValueUpsert,
      deleteMany: mockValueDeleteMany,
    },
    workspaceMember: { findUnique: mockMemberFind },
    user: { findUnique: mockUserFind },
  },
}));
mock.module("@/lib/permissions", () => ({
  requirePermissionOr: mockRequire,
  PermissionError,
  accessFor: async () => ({ has: () => true }),
  currentUserId: async () => "u1",
}));
mock.module("@/features/issues/audit", () => ({ recordIssueAudit: mockAudit }));
mock.module("next/cache", () => ({ revalidatePath: mockRevalidate }));
mock.module("@/lib/realtime/store", () => ({
  recordProjectChange: mockProjectChange,
}));

import { setCustomFieldValue } from "@/features/custom-fields/valueActions";
import { Prisma } from "@/lib/generated/prisma/client";

const WS = "ws-1";
const PROJECT = "p-1";
const ISSUE = "i-1";
const NOT_APPLICABLE = "This field does not apply to this issue.";
const NOT_ALLOWED = "You are not allowed to edit this issue.";

function issue(more: Record<string, unknown> = {}) {
  return {
    id: ISSUE,
    key: 7,
    projectId: PROJECT,
    title: "Fix the thing",
    reporterId: "reporter",
    assigneeId: "assignee",
    project: { workspaceId: WS, prefix: "WEB" },
    ...more,
  };
}

function fieldRow(more: Record<string, unknown> = {}) {
  return {
    id: "cf-1",
    key: "customer",
    name: "Customer",
    description: "",
    type: "text",
    config: { maxLength: 20 },
    position: 0,
    archivedAt: null,
    pluginId: null,
    workspaceId: WS,
    projectId: null,
    ...more,
  };
}

const NO_COLUMNS = { text: null, number: null, date: null, userId: null };
/** A stored answer: exactly one column set. */
const stored = (columns: Record<string, unknown>) => ({
  issueId: ISSUE,
  fieldId: "cf-1",
  ...NO_COLUMNS,
  ...columns,
});

const set = (value: unknown, fieldId = "cf-1") =>
  setCustomFieldValue(ISSUE, fieldId, value);

beforeEach(() => {
  for (const m of [
    mockIssueFind,
    mockDefFind,
    mockValueFind,
    mockValueUpsert,
    mockValueDeleteMany,
    mockMemberFind,
    mockUserFind,
    mockRequire,
    mockAudit,
    mockRevalidate,
    mockProjectChange,
  ]) {
    m.mockReset();
  }
  mockIssueFind.mockResolvedValue(issue());
  mockDefFind.mockResolvedValue(fieldRow());
  mockValueFind.mockResolvedValue(null);
  mockValueUpsert.mockResolvedValue({});
  mockValueDeleteMany.mockResolvedValue({ count: 1 });
  mockMemberFind.mockResolvedValue({ userId: "someone" });
  mockUserFind.mockResolvedValue(null);
  mockRequire.mockResolvedValue("actor-1");
});

const wrote = () =>
  mockValueUpsert.mock.calls.length + mockValueDeleteMany.mock.calls.length > 0;

describe("who may answer a field", () => {
  it("asks what editing the issue asks: any issue, or its reporter's and assignee's", async () => {
    await set("Acme");
    expect(mockRequire).toHaveBeenCalledTimes(1);
    expect(mockRequire.mock.calls[0][0]).toEqual([
      { permission: "issue.update.any", ctx: { projectId: PROJECT } },
      {
        permission: "issue.update.own",
        ctx: { projectId: PROJECT },
        ownerIds: ["reporter", "assignee"],
      },
    ]);
  });

  it("refuses someone who may not edit the issue, and writes and logs nothing", async () => {
    mockRequire.mockRejectedValue(new PermissionError("issue.update.any"));
    expect(await set("Acme")).toEqual({ error: NOT_ALLOWED });
    expect(wrote()).toBe(false);
    expect(mockAudit).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("does not say whether an issue exists to someone who asks about one that does not", async () => {
    mockIssueFind.mockResolvedValue(null);
    expect(await set("Acme")).toEqual({ error: NOT_ALLOWED });
    expect(mockRequire).not.toHaveBeenCalled();
    expect(mockDefFind).not.toHaveBeenCalled();
  });

  it("reads the issue by the id it was given, whatever the client sent", async () => {
    await setCustomFieldValue({ toString: () => "i-9" } as never, "cf-1", "a");
    expect(mockIssueFind.mock.calls[0][0].where).toEqual({ id: "i-9" });
  });

  it("does not hide a failure that is not a refusal", async () => {
    mockRequire.mockRejectedValue(new Error("database is gone"));
    await expect(set("Acme")).rejects.toThrow("database is gone");
  });
});

describe("which fields an issue has", () => {
  it("refuses a field that does not exist", async () => {
    mockDefFind.mockResolvedValue(null);
    expect(await set("Acme")).toEqual({ error: NOT_APPLICABLE });
    expect(wrote()).toBe(false);
  });

  it("refuses a field of another workspace", async () => {
    mockDefFind.mockResolvedValue(fieldRow({ workspaceId: "ws-other" }));
    expect(await set("Acme")).toEqual({ error: NOT_APPLICABLE });
    expect(wrote()).toBe(false);
  });

  it("refuses an archived field", async () => {
    mockDefFind.mockResolvedValue(fieldRow({ archivedAt: new Date() }));
    expect(await set("Acme")).toEqual({ error: NOT_APPLICABLE });
    expect(wrote()).toBe(false);
  });

  it("refuses a field of another project", async () => {
    mockDefFind.mockResolvedValue(fieldRow({ projectId: "p-other" }));
    expect(await set("Acme")).toEqual({ error: NOT_APPLICABLE });
    expect(wrote()).toBe(false);
  });

  it("accepts the workspace's fields and the issue's own project's", async () => {
    mockDefFind.mockResolvedValue(fieldRow({ projectId: null }));
    expect(await set("Acme")).toEqual({ ok: true, changed: true });
    mockDefFind.mockResolvedValue(fieldRow({ projectId: PROJECT }));
    expect(await set("Globex")).toEqual({ ok: true, changed: true });
  });

  it("refuses a field of a type this code does not know", async () => {
    mockDefFind.mockResolvedValue(fieldRow({ type: "hologram" }));
    expect(await set("Acme")).toEqual({ error: NOT_APPLICABLE });
    expect(wrote()).toBe(false);
  });

  it("reads the field by the id it was given, whatever the client sent", async () => {
    await set("Acme", "cf-9");
    expect(mockDefFind.mock.calls[0][0].where).toEqual({ id: "cf-9" });
    await setCustomFieldValue(ISSUE, { toString: () => "x" } as never, "a");
    expect(mockDefFind.mock.calls[1][0].where).toEqual({ id: "x" });
  });
});

describe("checking the answer against the field", () => {
  it("says which field and what is wrong, and writes nothing", async () => {
    expect(await set("x".repeat(21))).toEqual({
      error: "Customer must be at most 20 characters.",
    });
    expect(wrote()).toBe(false);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("does not turn text into a number", async () => {
    mockDefFind.mockResolvedValue(
      fieldRow({
        type: "number",
        name: "Effort",
        config: { integer: false, min: null, max: null },
      }),
    );
    expect(await set("42")).toEqual({ error: "Effort must be a number." });
    expect(await set(Number.NaN)).toEqual({
      error: "Effort must be a number.",
    });
    expect(wrote()).toBe(false);
  });

  it("refuses an option the choice does not have", async () => {
    mockDefFind.mockResolvedValue(
      fieldRow({
        type: "select",
        name: "Environment",
        config: { options: [{ id: "prod", label: "Prod", color: null }] },
      }),
    );
    expect(await set("staging")).toEqual({
      error: "Environment must be one of the options.",
    });
    expect(wrote()).toBe(false);
  });

  it("refuses a day that does not exist", async () => {
    mockDefFind.mockResolvedValue(
      fieldRow({ type: "date", name: "Release", config: {} }),
    );
    expect(await set("2026-02-30")).toEqual({
      error: "Release must be a day as YYYY-MM-DD.",
    });
  });

  it("refuses a person who is not a member of the workspace", async () => {
    mockDefFind.mockResolvedValue(
      fieldRow({ type: "user", name: "Owner", config: {} }),
    );
    mockMemberFind.mockResolvedValue(null);
    expect(await set("stranger")).toEqual({
      error: "Owner must be a member of this workspace.",
    });
    expect(mockMemberFind.mock.calls[0][0].where).toEqual({
      workspaceId_userId: { workspaceId: WS, userId: "stranger" },
    });
    expect(wrote()).toBe(false);
  });

  it("does not look for a member when nothing is set, or when the field is no person", async () => {
    await set("Acme");
    mockDefFind.mockResolvedValue(
      fieldRow({ type: "user", name: "Owner", config: {} }),
    );
    await set(null);
    expect(mockMemberFind).not.toHaveBeenCalled();
  });
});

describe("writing an answer", () => {
  it("stores a new answer in the column of its type and nowhere else", async () => {
    expect(await set("Acme")).toEqual({ ok: true, changed: true });
    const call = mockValueUpsert.mock.calls[0][0];
    expect(call.where).toEqual({
      issueId_fieldId: { issueId: ISSUE, fieldId: "cf-1" },
    });
    expect(call.create).toEqual({
      issueId: ISSUE,
      fieldId: "cf-1",
      ...NO_COLUMNS,
      text: "Acme",
    });
    expect(call.update).toEqual({ ...NO_COLUMNS, text: "Acme" });
  });

  it("trims the text before it is stored", async () => {
    await set("  Acme  ");
    expect(mockValueUpsert.mock.calls[0][0].create.text).toBe("Acme");
  });

  it("changes an answer by writing all four columns, so the old one is never kept beside the new one", async () => {
    mockValueFind.mockResolvedValue(stored({ text: "Acme" }));
    await set("Globex");
    expect(mockValueUpsert.mock.calls[0][0].update).toEqual({
      ...NO_COLUMNS,
      text: "Globex",
    });
  });

  it("stores a number, a day and a person in their own columns", async () => {
    mockDefFind.mockResolvedValue(
      fieldRow({
        type: "number",
        config: { integer: false, min: null, max: null },
      }),
    );
    await set(0);
    expect(mockValueUpsert.mock.calls[0][0].update).toEqual({
      ...NO_COLUMNS,
      number: 0,
    });

    mockDefFind.mockResolvedValue(fieldRow({ type: "date", config: {} }));
    await set("2026-09-26");
    expect(mockValueUpsert.mock.calls[1][0].update).toEqual({
      ...NO_COLUMNS,
      date: new Date("2026-09-26T12:00:00.000Z"),
    });

    mockDefFind.mockResolvedValue(fieldRow({ type: "user", config: {} }));
    await set("someone");
    expect(mockValueUpsert.mock.calls[2][0].update).toEqual({
      ...NO_COLUMNS,
      userId: "someone",
    });
  });

  it("removes the row when the answer is cleared: null, nothing or only spaces", async () => {
    mockValueFind.mockResolvedValue(stored({ text: "Acme" }));
    for (const cleared of [null, undefined, "", "   "]) {
      mockValueDeleteMany.mockClear();
      expect(await set(cleared)).toEqual({ ok: true, changed: true });
      expect(mockValueDeleteMany).toHaveBeenCalledTimes(1);
      expect(mockValueDeleteMany.mock.calls[0][0].where).toEqual({
        issueId: ISSUE,
        fieldId: "cf-1",
      });
    }
    expect(mockValueUpsert).not.toHaveBeenCalled();
  });

  it("does nothing when an answer is cleared that was never given", async () => {
    expect(await set(null)).toEqual({ ok: true, changed: false });
    expect(wrote()).toBe(false);
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("does nothing, and logs nothing, when the answer is the one that is already there", async () => {
    mockValueFind.mockResolvedValue(stored({ text: "Acme" }));
    expect(await set("Acme")).toEqual({ ok: true, changed: false });
    expect(await set("  Acme ")).toEqual({ ok: true, changed: false });
    expect(wrote()).toBe(false);
    expect(mockAudit).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
    expect(mockProjectChange).not.toHaveBeenCalled();
  });

  it("does not mistake the answer of another type's column for its own", async () => {
    // A row written by hand with a number where this text field looks: not this field's answer.
    mockValueFind.mockResolvedValue(stored({ number: 5 }));
    expect(await set("Acme")).toEqual({ ok: true, changed: true });
  });

  it("says the field is gone when it or the issue was deleted on the way", async () => {
    mockValueUpsert.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("fk", {
        code: "P2003",
        clientVersion: "test",
      }),
    );
    expect(await set("Acme")).toEqual({ error: NOT_APPLICABLE });
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("does not hide any other failure of the write", async () => {
    mockValueUpsert.mockRejectedValue(new Error("connection lost"));
    await expect(set("Acme")).rejects.toThrow("connection lost");
    expect(mockAudit).not.toHaveBeenCalled();
  });
});

describe("what is logged", () => {
  it("logs the change once, in the issue's own history, with the field and both answers", async () => {
    mockValueFind.mockResolvedValue(stored({ text: "Acme" }));
    await set("Globex");
    expect(mockAudit).toHaveBeenCalledTimes(1);
    const [action, id, ctx, actorId, detail, meta] = mockAudit.mock.calls[0];
    expect(action).toBe("issue.customField.changed");
    expect(id).toBe(ISSUE);
    expect(ctx).toMatchObject({ key: 7, projectId: PROJECT });
    expect(actorId).toBe("actor-1");
    expect(detail).toBe("Customer: Acme → Globex");
    expect(meta).toEqual({
      fieldId: "cf-1",
      key: "customer",
      from: "Acme",
      to: "Globex",
    });
  });

  it("writes a dash for an answer that was not there, and for one that is cleared", async () => {
    await set("Acme");
    expect(mockAudit.mock.calls[0][4]).toBe("Customer: — → Acme");
    mockValueFind.mockResolvedValue(stored({ text: "Acme" }));
    await set(null);
    expect(mockAudit.mock.calls[1][4]).toBe("Customer: Acme → —");
    expect(mockAudit.mock.calls[1][5]).toMatchObject({
      from: "Acme",
      to: null,
    });
  });

  it("names a choice by its label, in the log, and keeps its id in the details", async () => {
    mockDefFind.mockResolvedValue(
      fieldRow({
        type: "select",
        name: "Environment",
        key: "environment",
        config: {
          options: [
            { id: "prod", label: "Production", color: null },
            { id: "dev", label: "Development", color: null },
          ],
        },
      }),
    );
    mockValueFind.mockResolvedValue(stored({ text: "dev" }));
    await set("prod");
    expect(mockAudit.mock.calls[0][4]).toBe(
      "Environment: Development → Production",
    );
    expect(mockAudit.mock.calls[0][5]).toMatchObject({
      from: "dev",
      to: "prod",
    });
  });

  it("names a person by their name", async () => {
    mockDefFind.mockResolvedValue(
      fieldRow({ type: "user", name: "Owner", key: "owner", config: {} }),
    );
    mockUserFind.mockImplementation(
      async ({ where }: { where: { id: string } }) =>
        where.id === "ada"
          ? { firstName: "Ada", lastName: "Lovelace" }
          : { firstName: "Grace", lastName: "Hopper" },
    );
    mockValueFind.mockResolvedValue(stored({ userId: "ada" }));
    await set("grace");
    expect(mockAudit.mock.calls[0][4]).toBe(
      "Owner: Ada Lovelace → Grace Hopper",
    );
  });

  it("falls back to the id of a person who no longer exists", async () => {
    mockDefFind.mockResolvedValue(
      fieldRow({ type: "user", name: "Owner", config: {} }),
    );
    mockValueFind.mockResolvedValue(stored({ userId: "gone" }));
    await set("someone");
    expect(mockAudit.mock.calls[0][4]).toBe("Owner: gone → someone");
  });

  it("falls back to the id of a choice whose option is no longer there", async () => {
    mockDefFind.mockResolvedValue(
      fieldRow({
        type: "select",
        name: "Environment",
        config: { options: [{ id: "prod", label: "Production", color: null }] },
      }),
    );
    mockValueFind.mockResolvedValue(stored({ text: "old-option" }));
    await set("prod");
    expect(mockAudit.mock.calls[0][4]).toBe(
      "Environment: old-option → Production",
    );
  });

  it("writes a day and a number as they are", async () => {
    mockDefFind.mockResolvedValue(
      fieldRow({ type: "date", name: "Release", config: {} }),
    );
    mockValueFind.mockResolvedValue(
      stored({ date: new Date("2026-01-01T12:00:00.000Z") }),
    );
    await set("2026-02-02");
    expect(mockAudit.mock.calls[0][4]).toBe("Release: 2026-01-01 → 2026-02-02");
  });
});

describe("telling the rest of the app", () => {
  it("refreshes the pages and the project's viewers once an answer changed", async () => {
    await set("Acme");
    expect(mockRevalidate).toHaveBeenCalledWith("/", "layout");
    expect(mockProjectChange).toHaveBeenCalledWith(WS, "actor-1");
  });

  it("does not, for a refusal", async () => {
    await set("x".repeat(99));
    expect(mockRevalidate).not.toHaveBeenCalled();
    expect(mockProjectChange).not.toHaveBeenCalled();
  });
});
