import { beforeEach, describe, expect, it, mock } from "bun:test";

// Creating an issue with answers to custom fields. What matters: an answer that does not fit refuses
// the whole creation **before** anything is written (no issue is left behind without it), a field that
// no longer applies is left out and never an error, the answers are written with the issue and not
// logged one by one, and creating without any answers is what it was. Own process: it replaces the
// modules `createIssue` reaches into, and the values module is the real one.

const mockProjectFind = mock();
const mockProjectUpdate = mock();
const mockIssueCreate = mock();
const mockDefFind = mock();
const mockMemberFind = mock();
const mockValueCreate = mock();
const mockAuditCreate = mock();
const mockRequire = mock(async () => "actor-1");
const mockNotify = mock();
const mockWebhook = mock();

mock.module("@/lib/db", () => ({
  db: {
    project: { findUnique: mockProjectFind, update: mockProjectUpdate },
    issue: { create: mockIssueCreate },
    customFieldDefinition: { findUnique: mockDefFind },
    workspaceMember: { findUnique: mockMemberFind },
    customFieldValue: { create: mockValueCreate },
    auditLog: { create: mockAuditCreate },
    user: {
      findUnique: async () => ({
        firstName: "Ada",
        lastName: "L",
        email: "ada@example.com",
        handle: "ada",
        color: "#111",
      }),
    },
  },
}));
mock.module("@/lib/permissions", () => ({
  requirePermission: mockRequire,
  requirePermissionOr: mockRequire,
  hasPermission: async () => true,
  currentUserId: async () => "actor-1",
  accessFor: async () => ({ has: () => true }),
  PermissionError: class PermissionError extends Error {},
}));
mock.module("@/lib/notify", () => ({ notify: mockNotify }));
mock.module("next/cache", () => ({ revalidatePath: mock() }));
mock.module("@/lib/realtime/store", () => ({ recordProjectChange: mock() }));
mock.module("@/lib/webhooks/deliver", () => ({
  fireWebhookEvent: mockWebhook,
}));
mock.module("@/features/api-v1/queries", () => ({
  getIssueUnchecked: async () => null,
  getCommentUnchecked: async () => null,
}));

import { createIssue } from "@/features/issues/actions";
import { Prisma } from "@/lib/generated/prisma/client";
import type { PMDoc } from "@/lib/richtext/types";

const WS = "ws-1";
const PROJECT = "p-1";
const EMPTY: PMDoc = { type: "doc", content: [] };

function base(more: Record<string, unknown> = {}) {
  return {
    title: "New thing",
    description: EMPTY,
    status: "todo",
    priority: 2,
    assignee: null,
    labels: [],
    type: "task",
    projectId: PROJECT,
    reporterId: "ignored",
    ...more,
  };
}

function fieldRow(id: string, more: Record<string, unknown> = {}) {
  return {
    id,
    key: id,
    name: `Field ${id}`,
    description: "",
    icon: null,
    type: "text",
    config: { maxLength: 10 },
    position: 0,
    archivedAt: null,
    pluginId: null,
    workspaceId: WS,
    projectId: null,
    ...more,
  };
}
let fields: Record<string, ReturnType<typeof fieldRow>> = {};

beforeEach(() => {
  for (const m of [
    mockProjectFind,
    mockProjectUpdate,
    mockIssueCreate,
    mockDefFind,
    mockMemberFind,
    mockValueCreate,
    mockAuditCreate,
    mockNotify,
    mockWebhook,
  ]) {
    m.mockReset();
  }
  fields = { a: fieldRow("a"), b: fieldRow("b") };
  mockProjectFind.mockResolvedValue({ workspaceId: WS });
  mockProjectUpdate.mockResolvedValue({
    lastIssueKey: 5,
    workspaceId: WS,
    prefix: "WEB",
  });
  mockIssueCreate.mockResolvedValue({});
  mockDefFind.mockImplementation(
    async ({ where }: { where: { id: string } }) => fields[where.id] ?? null,
  );
  mockMemberFind.mockResolvedValue({ userId: "someone" });
  mockValueCreate.mockResolvedValue({});
  mockAuditCreate.mockResolvedValue({});
});

const written = () => mockIssueCreate.mock.calls.length > 0;
const stored = () =>
  mockValueCreate.mock.calls.map(
    (call) => call[0].data as Record<string, unknown>,
  );

describe("creating an issue without answers", () => {
  it("is what it was: nothing about custom fields is looked up or written", async () => {
    const result = await createIssue(base());
    expect(result).toMatchObject({ id: expect.any(String) });
    expect(mockDefFind).not.toHaveBeenCalled();
    expect(mockProjectFind).not.toHaveBeenCalled();
    expect(mockValueCreate).not.toHaveBeenCalled();
  });

  it("treats an empty set of answers the same", async () => {
    await createIssue(base({ customFields: {} }));
    expect(mockValueCreate).not.toHaveBeenCalled();
    expect(written()).toBe(true);
  });
});

describe("creating an issue with answers", () => {
  it("writes each answer in the column of its type, for the issue that was made", async () => {
    fields.c = fieldRow("c", {
      type: "number",
      config: { integer: false, min: null, max: null },
    });
    const result = await createIssue(
      base({ customFields: { a: "Acme", c: 7 } }),
    );
    const id = (result as { id: string }).id;
    expect(stored()).toEqual([
      {
        issueId: id,
        fieldId: "a",
        text: "Acme",
        number: null,
        date: null,
        userId: null,
      },
      {
        issueId: id,
        fieldId: "c",
        text: null,
        number: 7,
        date: null,
        userId: null,
      },
    ]);
    expect(mockIssueCreate.mock.calls[0][0].data.id).toBe(id);
  });

  it("looks the project's workspace up itself: the client's says nothing", async () => {
    await createIssue(base({ customFields: { a: "x" } }));
    expect(mockProjectFind.mock.calls[0][0]).toEqual({
      where: { id: PROJECT },
      select: { workspaceId: true },
    });
  });

  it("does not log the answers one by one: the creation is one event", async () => {
    await createIssue(base({ customFields: { a: "x", b: "y" } }));
    const actions = mockAuditCreate.mock.calls.map((c) => c[0].data.action);
    expect(actions).toEqual(["issue.created"]);
  });

  it("writes nothing for an empty answer", async () => {
    await createIssue(base({ customFields: { a: "", b: "   " } }));
    expect(mockValueCreate).not.toHaveBeenCalled();
    expect(written()).toBe(true);
  });

  it("checks a person against the workspace's members", async () => {
    fields.u = fieldRow("u", { type: "user", config: {} });
    mockMemberFind.mockResolvedValue(null);
    expect(
      await createIssue(base({ customFields: { u: "stranger" } })),
    ).toEqual({
      error: "Field u must be a member of this workspace.",
    });
    expect(written()).toBe(false);
  });
});

describe("an answer that does not fit", () => {
  it("refuses the whole creation, says which field and what, and writes nothing", async () => {
    const result = await createIssue(
      base({ customFields: { a: "fine", b: "x".repeat(11) } }),
    );
    expect(result).toEqual({
      error: "Field b must be at most 10 characters.",
    });
    expect(written()).toBe(false);
    expect(mockValueCreate).not.toHaveBeenCalled();
    expect(mockAuditCreate).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("does not use up the project's next issue number", async () => {
    await createIssue(base({ customFields: { a: "x".repeat(11) } }));
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it("still asks who may create before it looks at anything", async () => {
    await createIssue(base({ customFields: { a: "x" } }));
    expect(mockRequire).toHaveBeenCalledWith("issue.create", {
      projectId: PROJECT,
    });
    expect(mockRequire.mock.invocationCallOrder[0]).toBeLessThan(
      mockDefFind.mock.invocationCallOrder[0],
    );
  });
});

describe("a field that no longer applies", () => {
  it("is left out, and the issue is made with the rest", async () => {
    fields.a = fieldRow("a", { archivedAt: new Date() });
    const result = await createIssue(
      base({ customFields: { a: "x", b: "y" } }),
    );
    expect(result).toMatchObject({ id: expect.any(String) });
    expect(stored().map((row) => row.fieldId)).toEqual(["b"]);
  });

  it("is left out when it belongs to another project, another workspace, or nowhere", async () => {
    fields.a = fieldRow("a", { projectId: "p-other" });
    fields.b = fieldRow("b", { workspaceId: "ws-other" });
    const result = await createIssue(
      base({ customFields: { a: "x", b: "y", ghost: "z" } }),
    );
    expect(result).toMatchObject({ id: expect.any(String) });
    expect(mockValueCreate).not.toHaveBeenCalled();
  });

  it("is skipped when it was deleted between the check and the write, and the issue stays", async () => {
    mockValueCreate.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("fk", {
        code: "P2003",
        clientVersion: "test",
      }),
    );
    const result = await createIssue(
      base({ customFields: { a: "x", b: "y" } }),
    );
    expect(result).toMatchObject({ id: expect.any(String) });
    expect(mockValueCreate).toHaveBeenCalledTimes(2);
  });

  it("does not hide any other failure of the write", async () => {
    mockValueCreate.mockRejectedValueOnce(new Error("connection lost"));
    await expect(
      createIssue(base({ customFields: { a: "x" } })),
    ).rejects.toThrow("connection lost");
  });
});

describe("answers that are not a set of fields", () => {
  it("are no answers at all", async () => {
    for (const nonsense of [null, "text", 5, ["a"]]) {
      mockIssueCreate.mockClear();
      const result = await createIssue(base({ customFields: nonsense }));
      expect(result).toMatchObject({ id: expect.any(String) });
    }
    expect(mockValueCreate).not.toHaveBeenCalled();
  });

  it("are no answers even when they are long enough to look like too many", async () => {
    for (const nonsense of ["x".repeat(500), Array(200).fill("a")]) {
      const result = await createIssue(base({ customFields: nonsense }));
      expect(result).toMatchObject({ id: expect.any(String) });
    }
  });

  it("are accepted up to the most a workspace can have", async () => {
    const most = Object.fromEntries(
      Array.from({ length: 100 }, (_, i) => [`f${i}`, "x"]),
    );
    expect(await createIssue(base({ customFields: most }))).toMatchObject({
      id: expect.any(String),
    });
  });

  it("are refused when there are more than a workspace can have", async () => {
    const many = Object.fromEntries(
      Array.from({ length: 101 }, (_, i) => [`f${i}`, "x"]),
    );
    expect(await createIssue(base({ customFields: many }))).toEqual({
      error: "Too many custom fields.",
    });
    expect(written()).toBe(false);
  });
});
