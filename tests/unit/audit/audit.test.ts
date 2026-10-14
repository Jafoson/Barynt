import { beforeEach, describe, expect, it, mock } from "bun:test";

// The audit log itself: what gets recorded on write, and what happens
// when something goes wrong along the way.

const mockAuditCreate = mock();
const mockAuditFindMany = mock();
const mockAuditCount = mock();
const mockUserFindUnique = mock();
const mockUserFindMany = mock();
const mockProjectFindMany = mock();
const mockWorkspaceFindMany = mock();

mock.module("@/lib/db", () => ({
  db: {
    auditLog: {
      create: mockAuditCreate,
      findMany: mockAuditFindMany,
      count: mockAuditCount,
    },
    user: { findUnique: mockUserFindUnique, findMany: mockUserFindMany },
    project: { findMany: mockProjectFindMany },
    workspace: { findMany: mockWorkspaceFindMany },
  },
}));

import {
  AUDIT_ACTION_KEYS,
  listAudit,
  parseTargetLabel,
  recordAudit,
  recordAuditIn,
  toAuditAction,
} from "@/lib/audit";

beforeEach(() => {
  mock.clearAllMocks();
  mockAuditCreate.mockResolvedValue({});
  mockAuditFindMany.mockResolvedValue([]);
  mockAuditCount.mockResolvedValue(0);
  mockUserFindUnique.mockResolvedValue({
    firstName: "Ada",
    lastName: "Lovelace",
    email: "ada@example.com",
    color: "#6e63e6",
  });
  mockUserFindMany.mockResolvedValue([]);
  mockProjectFindMany.mockResolvedValue([]);
  mockWorkspaceFindMany.mockResolvedValue([]);
});

describe("Writing", () => {
  it("freezes the name and address of the actor", async () => {
    await recordAudit({ action: "auth.login", actorId: "u1" });

    expect(mockAuditCreate.mock.calls[0][0].data.actorLabel).toBe(
      "Ada Lovelace (ada@example.com)",
    );
  });

  it("freezes the account color for the avatar", async () => {
    await recordAudit({ action: "auth.login", actorId: "u1" });
    expect(mockAuditCreate.mock.calls[0][0].data.actorColor).toBe("#6e63e6");
  });

  it("uses the given label when there's no id", async () => {
    // The failed login attempt: no one is identified yet, only a typed
    // address.
    await recordAudit({
      action: "auth.login.failed",
      actorLabel: "  wer@auch.immer  ",
    });

    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.actorId).toBeNull();
    expect(entry.actorLabel).toBe("wer@auch.immer");
    expect(mockUserFindUnique).not.toHaveBeenCalled();
  });

  it("makes do when the account is already gone", async () => {
    mockUserFindUnique.mockResolvedValue(null);

    await recordAudit({ action: "user.deactivated", actorId: "geloescht" });

    const entry = mockAuditCreate.mock.calls[0][0].data;
    expect(entry.actorLabel).toBe("Unbekannt");
    // No color without an account — the list then shows the placeholder avatar.
    expect(entry.actorColor).toBeNull();
  });

  it("doesn't turn an empty justification into an empty field", async () => {
    await recordAudit({ action: "auth.login", actorId: "u1", reason: "   " });
    expect(mockAuditCreate.mock.calls[0][0].data.reason).toBeNull();
  });

  it("doesn't let the action fail when the log jams", async () => {
    // A login shouldn't fail just because the audit log table happens to
    // be unreachable.
    const error = console.error;
    console.error = () => {};
    mockAuditCreate.mockRejectedValueOnce(new Error("DB weg"));

    expect(
      await recordAudit({ action: "auth.login", actorId: "u1" }),
    ).toBeUndefined();

    console.error = error;
  });

  it("passes the error through where the entry is the condition", async () => {
    // `recordAuditIn` runs inside the caller's transaction. If it swallowed
    // the error here, it would create exactly the state it's meant to
    // prevent: access without a trace.
    const client = {
      auditLog: {
        create: mock(async () => {
          throw new Error("DB weg");
        }),
      },
      user: { findUnique: mockUserFindUnique },
    };

    await expect(
      // biome-ignore lint/suspicious/noExplicitAny: narrow test client
      recordAuditIn(client as any, {
        action: "project.breakglass",
        actorId: "u1",
      }),
    ).rejects.toThrow("DB weg");
  });
});

describe("Reading", () => {
  it("caps the amount even when someone asks for more", async () => {
    await listAudit({ limit: 10_000 });
    expect(mockAuditFindMany.mock.calls[0][0].take).toBe(500);
  });

  it("reads newest first, including `meta` for status/priority/label icons", async () => {
    await listAudit();

    const args = mockAuditFindMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: "desc" });
    expect(args.take).toBe(100);
    expect(args.select.meta).toBe(true);
    expect(args.select.actorColor).toBe(true);
  });

  it("restricts to one workspace and hides routine project activity", async () => {
    // Without projectId this is the workspace feed: issues and
    // project-bound labels belong to a single project, not to the workspace
    // as a whole, even though they carry `workspaceId` (see `whereFor`).
    await listAudit({ workspaceId: "ws1" });
    expect(mockAuditFindMany.mock.calls[0][0].where).toEqual({
      workspaceId: "ws1",
      NOT: [
        { action: { startsWith: "issue." } },
        { action: "label.created", projectId: { not: null } },
        { action: "label.deleted", projectId: { not: null } },
        { action: "view.deleted", projectId: { not: null } },
      ],
    });
  });

  it("leaves issue and label actions untouched in the project feed", async () => {
    // With projectId (project feed) the workspace exclusion doesn't apply —
    // that's exactly where issues and labels belong.
    await listAudit({ projectId: "p1" });
    expect(mockAuditFindMany.mock.calls[0][0].where).toEqual({
      projectId: "p1",
    });
  });

  it("doesn't filter at all without any filters given", async () => {
    await listAudit();
    expect(mockAuditFindMany.mock.calls[0][0].where).toEqual({});
  });

  it("fills in the current color for rows without a frozen one", async () => {
    // Rows created before the `actorColor` column existed — the list should
    // still be able to show an avatar instead of staying on the placeholder
    // forever.
    mockAuditFindMany.mockResolvedValue([
      { id: "a1", actorId: "u1", actorColor: null },
      { id: "a2", actorId: "u2", actorColor: "#already-frozen" },
      { id: "a3", actorId: null, actorColor: null },
    ]);
    mockUserFindMany.mockResolvedValue([{ id: "u1", color: "#current" }]);

    const entries = await listAudit();

    // Only the one missing color is looked up — not the one already frozen
    // and not the one without an account.
    expect(mockUserFindMany.mock.calls[0][0].where.id.in).toEqual(["u1"]);
    expect(entries).toMatchObject([
      { id: "a1", actorId: "u1", actorColor: "#current" },
      { id: "a2", actorId: "u2", actorColor: "#already-frozen" },
      { id: "a3", actorId: null, actorColor: null },
    ]);
  });

  it("doesn't ask again for the color when every row already has one — only still for the avatar", async () => {
    mockAuditFindMany.mockResolvedValue([
      { id: "a1", actorId: "u1", actorColor: "#frozen" },
    ]);

    await listAudit();

    // The avatar image is never frozen (see `AuditEntry.actorAvatarUrl`) and
    // is therefore always looked up live — even when the color is already
    // frozen. Exactly one call instead of two: no extra one for the color.
    expect(mockUserFindMany).toHaveBeenCalledTimes(1);
    expect(mockUserFindMany.mock.calls[0][0].select).toEqual({
      id: true,
      avatarKey: true,
    });
  });

  it("resolves avatar, color, slug, and name of the project behind `projectId`", async () => {
    mockAuditFindMany.mockResolvedValue([
      { id: "a1", actorId: "u1", actorColor: "#frozen", projectId: "p1" },
    ]);
    mockProjectFindMany.mockResolvedValue([
      { id: "p1", slug: "mobile", name: "Mobile App", color: "#3b82f6" },
    ]);

    const entries = await listAudit();

    expect(mockProjectFindMany.mock.calls[0][0].where.id.in).toEqual(["p1"]);
    expect(entries[0].projectRef).toEqual({
      slug: "mobile",
      name: "Mobile App",
      color: "#3b82f6",
      avatarUrl: null,
    });
  });

  it("resolves avatar, color, slug, and name of the workspace behind `workspaceId`", async () => {
    mockAuditFindMany.mockResolvedValue([
      { id: "a1", actorId: "u1", actorColor: "#frozen", workspaceId: "ws1" },
    ]);
    mockWorkspaceFindMany.mockResolvedValue([
      { id: "ws1", slug: "nimbus", name: "Nimbus", color: "#6e63e6" },
    ]);

    const entries = await listAudit();

    expect(mockWorkspaceFindMany.mock.calls[0][0].where.id.in).toEqual(["ws1"]);
    expect(entries[0].workspaceRef).toEqual({
      slug: "nimbus",
      name: "Nimbus",
      color: "#6e63e6",
      avatarUrl: null,
    });
  });

  it("leaves `workspaceRef` empty when the workspace has since been deleted", async () => {
    mockAuditFindMany.mockResolvedValue([
      { id: "a1", actorId: "u1", actorColor: "#frozen", workspaceId: "ws-weg" },
    ]);
    mockWorkspaceFindMany.mockResolvedValue([]);

    const entries = await listAudit();

    expect(entries[0].workspaceRef).toBeNull();
  });

  it("leaves `projectRef` empty when no row carries a `projectId`", async () => {
    mockAuditFindMany.mockResolvedValue([
      { id: "a1", actorId: "u1", actorColor: "#frozen", projectId: null },
    ]);

    const entries = await listAudit();

    expect(mockProjectFindMany).not.toHaveBeenCalled();
    expect(entries[0].projectRef).toBeNull();
  });

  it("leaves `projectRef` empty when the project has since been deleted", async () => {
    mockAuditFindMany.mockResolvedValue([
      { id: "a1", actorId: "u1", actorColor: "#frozen", projectId: "p-weg" },
    ]);
    mockProjectFindMany.mockResolvedValue([]);

    const entries = await listAudit();

    expect(entries[0].projectRef).toBeNull();
  });
});

describe("Keys", () => {
  it("recognizes known actions", () => {
    expect(toAuditAction("project.breakglass")).toBe("project.breakglass");
  });

  it("returns null for an unknown one", () => {
    // The audit log is older than any version of the UI.
    expect(toAuditAction("etwas.ganz.neues")).toBeNull();
  });

  it("lists every action exactly once", () => {
    expect(new Set(AUDIT_ACTION_KEYS).size).toBe(AUDIT_ACTION_KEYS.length);
  });
});

describe("parseTargetLabel", () => {
  it("splits the ref code and old/new values", () => {
    expect(parseTargetLabel("MOB-1: Offen → In Arbeit")).toEqual({
      ref: "MOB-1",
      before: "Offen",
      after: "In Arbeit",
    });
  });

  it("splits the ref code without a remainder", () => {
    expect(parseTargetLabel("MOB-1")).toEqual({ ref: "MOB-1" });
  });

  it("splits the ref code with a remainder but no arrow", () => {
    expect(parseTargetLabel("MOB-1: Fix login bug")).toEqual({
      ref: "MOB-1",
      after: "Fix login bug",
    });
  });

  it("leaves text without a recognizable ref code untouched", () => {
    expect(parseTargetLabel("Ada Lovelace")).toEqual({
      after: "Ada Lovelace",
    });
  });

  it("recognizes a one-character ref code just as well as a four-character one", () => {
    expect(parseTargetLabel("A-1: Titel")).toEqual({
      ref: "A-1",
      after: "Titel",
    });
    expect(parseTargetLabel("ABCD-42: Titel")).toEqual({
      ref: "ABCD-42",
      after: "Titel",
    });
  });
});
