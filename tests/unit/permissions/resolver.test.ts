import { beforeEach, describe, expect, it, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockUserFindUnique = mock();
const mockWorkspaceFindUnique = mock();
const mockWorkspaceMemberFindUnique = mock();
const mockProjectFindUnique = mock();
const mockProjectMemberFindUnique = mock();
const mockProjectFindMany = mock();
const mockProjectMemberFindMany = mock();
const mockProjectMemberFindFirst = mock();

mock.module("@/lib/db", () => ({
  db: {
    user: { findUnique: mockUserFindUnique },
    workspace: { findUnique: mockWorkspaceFindUnique },
    workspaceMember: { findUnique: mockWorkspaceMemberFindUnique },
    project: {
      findUnique: mockProjectFindUnique,
      findMany: mockProjectFindMany,
    },
    projectMember: {
      findUnique: mockProjectMemberFindUnique,
      findMany: mockProjectMemberFindMany,
      findFirst: mockProjectMemberFindFirst,
    },
  },
}));

const mockGetSession = mock(async () => ({ userId: "u1" }));
mock.module("@/lib/session", () => ({ getSession: mockGetSession }));

// `cache()` deduplicates per request. In the test we want to see every call,
// otherwise cases within one file would overwrite each other's answers.
mock.module("react", () => ({
  cache: <T>(fn: T) => fn,
}));

import {
  accessFor,
  accessibleProjectIds,
  assignmentCeiling,
  can,
  canEnterWorkspace,
} from "@/lib/permissions";

// ── Helpers ───────────────────────────────────────────────────────────────────

function role(key: string, rank: number, permissions: string[]) {
  return {
    key,
    rank,
    permissions: permissions.map((permissionKey) => ({ permissionKey })),
  };
}

/** Reads better at the call site than a bare array. */
const allow = (...keys: string[]): string[] => keys;

/** Default setup: no global permission, an open workspace, a public project. */
function setup(
  opts: {
    platform?: ReturnType<typeof role> | null;
    workspace?: ReturnType<typeof role> | null;
    project?: ReturnType<typeof role> | null;
    pending?: boolean;
    suspended?: boolean;
    visibility?: string;
    deactivated?: boolean;
  } = {},
) {
  mockUserFindUnique.mockResolvedValue({
    platformRole: opts.platform ?? null,
    deactivatedAt: opts.deactivated ? new Date("2026-01-01") : null,
  });
  mockWorkspaceFindUnique.mockResolvedValue({
    suspended: opts.suspended ?? false,
  });
  mockWorkspaceMemberFindUnique.mockResolvedValue(
    opts.workspace
      ? { pending: opts.pending ?? false, role: opts.workspace }
      : null,
  );
  mockProjectFindUnique.mockResolvedValue({
    workspaceId: "ws1",
    visibility: opts.visibility ?? "public",
  });
  mockProjectMemberFindUnique.mockResolvedValue(
    opts.project ? { role: opts.project } : null,
  );
  // `canEnterWorkspace` asks this: is the person in any project
  // of the workspace? The default assumption is "only if they have a project role".
  mockProjectMemberFindFirst.mockResolvedValue(
    opts.project ? { projectId: "p1" } : null,
  );
}

beforeEach(() => {
  mock.clearAllMocks();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Im Projekt entscheidet die Projektrolle", () => {
  it("ersetzt die projektbezogenen Rechte der Workspace-Rolle", async () => {
    setup({
      workspace: role("member", 2, allow("project.view", "issue.create")),
      project: role("project_viewer", 2, allow("project.view")),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    // From the project role.
    expect(access.has("project.view")).toBe(true);
    // The workspace role exists, but it doesn't count in the project.
    expect(access.has("issue.create")).toBe(false);
  });

  it("gibt im Projekt nichts heraus, was nur im Workspace gilt", async () => {
    setup({
      workspace: role("manager", 4, allow("audit.view", "project.create")),
      project: role("project_viewer", 2, allow("project.view")),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    // The project context only answers project questions. Anyone who wants to
    // know whether someone may create a project asks the workspace context.
    expect(access.has("audit.view")).toBe(false);
    expect(access.has("project.create")).toBe(false);
    expect(access.has("project.view")).toBe(true);
  });

  it("übergeht einen Eintrag, den die Projektrolle gar nicht tragen darf", async () => {
    // The scope filter in `collect()`: a row from an earlier version or set by
    // hand becomes ineffective instead of handing out permissions.
    setup({
      project: role(
        "project_admin",
        4,
        allow("project.view", "workspace.delete", "team.create"),
      ),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(true);
    expect(access.has("workspace.delete")).toBe(false);
    expect(access.has("team.create")).toBe(false);
  });

  it("gibt ohne Projektrolle keine Projektrechte", async () => {
    // `ProjectMember` is the list of who is in the project — no entry, no
    // access, even for a public project.
    setup({
      workspace: role("member", 2, allow("project.view", "issue.create")),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(false);
    expect(access.has("issue.create")).toBe(false);
  });

  it("gewährt ohne jede Rolle nichts", async () => {
    setup();
    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(false);
  });

  it("gewährt ohne Session nichts", async () => {
    setup({ workspace: role("owner", 6, allow("project.view")) });
    const access = await accessFor(null, { projectId: "p1" });
    expect(access.has("project.view")).toBe(false);
  });

  it("merkt sich Rolle und Rang je Ebene", async () => {
    setup({
      workspace: role("admin", 5, allow("project.view")),
      project: role("project_viewer", 2, []),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.roleKey("WORKSPACE")).toBe("admin");
    expect(access.rank("WORKSPACE")).toBe(5);
    expect(access.roleKey("PROJECT")).toBe("project_viewer");
    expect(access.rank("PROJECT")).toBe(2);
    expect(access.rank("PLATFORM")).toBe(-1);
  });
});

// There is no longer a deny — a role lists what it allows, and everything else
// doesn't apply. Since only one role counts in a given context anyway, a DENY
// would have been indistinguishable from "not in the list".
describe("Die Liste der Rolle ist abschließend", () => {
  it("stuft in diesem einen Projekt herab", async () => {
    // Exactly the real-world case: someone with weight in the workspace is
    // only a reader in this project. That needs no deny — whatever isn't in
    // the project role simply doesn't apply here.
    setup({
      workspace: role("project_lead", 3, allow("project.create")),
      project: role("project_viewer", 2, allow("project.view")),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(true);
    expect(access.has("issue.update.any")).toBe(false);
  });

  it("nimmt eine Permission nicht an, nur weil sie irgendwo steht", async () => {
    // As a control check: same person, same project, but this time the
    // project role carries the permission — so it applies.
    setup({
      workspace: role("project_lead", 3, allow("project.create")),
      project: role(
        "contributor",
        3,
        allow("project.view", "issue.update.any"),
      ),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("issue.update.any")).toBe(true);
  });
});

// The guarantee that the layering of scopes ultimately exists for: the
// leadership of a workspace remains able to act in every one of its projects,
// no matter what `ProjectMember` says.
describe("Generalschlüssel project.admin.all", () => {
  it("gibt alle Projektrechte ohne jeden Projekteintrag", async () => {
    setup({ workspace: role("admin", 5, allow("project.admin.all")) });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(true);
    expect(access.has("issue.delete.any")).toBe(true);
    expect(access.has("member.invite")).toBe(true);
    expect(access.has("role.manage")).toBe(true);
  });

  it("lässt sich von `blocked` nicht aussperren", async () => {
    // Otherwise a project admin could throw the owner out of their own
    // project — and no one could reach member management anymore.
    setup({
      workspace: role("owner", 6, allow("project.admin.all")),
      project: role("blocked", 0, []),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(true);
    expect(access.has("member.invite")).toBe(true);
    // And the rank ceiling stays open-ended upward, otherwise the demotion
    // couldn't be undone.
    expect(assignmentCeiling(access, "PROJECT")).toBe(Number.POSITIVE_INFINITY);
  });

  it("hilft in einem gesperrten Workspace nicht", async () => {
    // An operator-level suspension outranks the tenant's master key.
    setup({
      workspace: role("owner", 6, allow("project.admin.all")),
      suspended: true,
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(false);
  });

  it("bleibt eine Workspace-Sache — als Projektrolle wirkungslos", async () => {
    setup({ project: role("seltsam", 4, allow("project.admin.all")) });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.admin.all")).toBe(false);
    expect(access.has("issue.create")).toBe(false);
  });
});

describe("Generalschlüssel project.view.all", () => {
  it("öffnet jedes Projekt lesend, aber nicht mehr", async () => {
    setup({ workspace: role("auditor", 3, allow("project.view.all")) });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(true);
    expect(access.has("issue.create")).toBe(false);
    expect(access.has("member.invite")).toBe(false);
  });

  it("ergänzt eine vorhandene Projektrolle, statt sie zu ersetzen", async () => {
    setup({
      workspace: role("auditor", 3, allow("project.view.all")),
      project: role("contributor", 3, allow("issue.create")),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(true);
    expect(access.has("issue.create")).toBe(true);
  });
});

describe("Plattform-Scope und tenant.access", () => {
  it("gibt einer Plattform-Rolle ohne tenant.access keinen Mandanten-Zugriff", async () => {
    // The registry doesn't even allow tenant permissions in the PLATFORM
    // scope — so there's no way to sneak this in via a platform role.
    setup({ platform: role("platform_admin", 2, allow("platform.access")) });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("issue.update.any")).toBe(false);
    expect(access.has("project.view")).toBe(false);
  });

  it("hält Plattform-Rechte aus dem Mandanten-Kontext heraus", async () => {
    // The separation applies downward too: in the workspace, the workspace
    // role counts. Platform permissions are queried in the platform context
    // — that's where they live.
    setup({ platform: role("platform_admin", 2, allow("platform.access")) });

    expect(
      (await accessFor("u1", { workspaceId: "ws1" })).has("platform.access"),
    ).toBe(false);
    expect(
      (await accessFor("u1", { scope: "platform" })).has("platform.access"),
    ).toBe(true);
  });

  it("lässt jemanden, der nur plugin.enable hat, keine Plugins installieren", async () => {
    // Der Workspace-Admin schaltet Plugins ein, die die Plattform installiert
    // hat. Installiert wird auf der Plattform: dort zählt allein die
    // Plattform-Rolle, die Workspace-Rolle kommt nicht mit.
    setup({
      platform: role("platform_member", 0, []),
      workspace: role("admin", 5, allow("plugin.enable")),
    });

    expect(
      (await accessFor("u1", { workspaceId: "ws1" })).has("plugin.enable"),
    ).toBe(true);
    expect(
      (await accessFor("u1", { scope: "platform" })).has("plugin.manage"),
    ).toBe(false);
    expect(
      (await accessFor("u1", { workspaceId: "ws1" })).has("plugin.manage"),
    ).toBe(false);
  });

  it("gibt dem Plattform-Admin plugin.manage nur im Plattform-Kontext", async () => {
    setup({ platform: role("platform_admin", 2, allow("plugin.manage")) });

    expect(
      (await accessFor("u1", { scope: "platform" })).has("plugin.manage"),
    ).toBe(true);
    // Mit plugin.manage allein aktiviert er in keinem Workspace etwas.
    expect(
      (await accessFor("u1", { workspaceId: "ws1" })).has("plugin.enable"),
    ).toBe(false);
  });

  it("stört die Rechte des Benutzers nicht", async () => {
    setup({
      platform: role("platform_member", 0, []),
      workspace: role("member", 2, []),
      project: role("contributor", 3, allow("project.view")),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(true);
  });

  it("öffnet mit tenant.access alles im Mandanten", async () => {
    // The master key: `tenant.access` can only appear in a platform role, and
    // then applies to the entire tenant.
    setup({
      platform: role(
        "platform_support",
        1,
        allow("platform.access", "tenant.access"),
      ),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(true);
    expect(access.has("issue.update.any")).toBe(true);
  });

  it("gibt mit tenant.access im Workspace-Kontext die Workspace-Rechte", async () => {
    setup({ platform: role("platform_support", 1, allow("tenant.access")) });

    const access = await accessFor("u1", { workspaceId: "ws1" });
    expect(access.has("member.invite")).toBe(true);
    // But nothing that doesn't exist in the workspace at all.
    expect(access.has("user.manage")).toBe(false);
  });
});

describe("Gesperrter Workspace und offene Einladung", () => {
  it("nimmt in einem gesperrten Workspace alle Mandanten-Rechte", async () => {
    setup({
      workspace: role("owner", 6, allow("project.view", "workspace.delete")),
      suspended: true,
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(false);
    // `workspace.delete` can also be granted in the PLATFORM scope — but here
    // it came from the workspace role, and so it must disappear too.
    expect(access.has("workspace.delete")).toBe(false);
  });

  it("lässt Plattform-Rechte von einer Sperre unberührt", async () => {
    // The suspension hits the tenant, not the platform role. It lives in its
    // own context and remains there — otherwise no one could unsuspend the
    // workspace again.
    setup({
      platform: role("platform_admin", 2, allow("workspace.suspend")),
      workspace: role("owner", 6, allow("workspace.update")),
      suspended: true,
    });

    expect(
      (await accessFor("u1", { scope: "platform" })).has("workspace.suspend"),
    ).toBe(true);
    expect(
      (await accessFor("u1", { workspaceId: "ws1" })).has("workspace.update"),
    ).toBe(false);
  });

  it("gibt einer offenen Einladung noch keine Rechte", async () => {
    setup({
      workspace: role("member", 2, allow("project.view")),
      pending: true,
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(false);
  });

  it("nimmt Support davon aus", async () => {
    setup({
      platform: role(
        "platform_support",
        1,
        allow("tenant.access", "project.view"),
      ),
      suspended: true,
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(true);
  });
});

describe("Mitgliedschaft entscheidet", () => {
  it("sperrt ein Projekt ohne Eintrag, egal wie sichtbar es ist", async () => {
    setup({ workspace: role("member", 2, allow("audit.view")) });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(false);
    // In the workspace context the permission is still there unchanged — it
    // just answers a different question than the one about this project.
    expect(
      (await accessFor("u1", { workspaceId: "ws1" })).has("audit.view"),
    ).toBe(true);
  });

  it("öffnet es mit einem eigenen Projekteintrag", async () => {
    setup({
      workspace: role("member", 2, []),
      project: role("contributor", 3, allow("project.view")),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(true);
  });

  it("öffnet es für project.view.all auch ohne Eintrag", async () => {
    setup({ workspace: role("admin", 5, allow("project.view.all")) });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(true);
  });

  it("lässt die Leitung des Workspace nicht herabstufen", async () => {
    // Otherwise a project admin could lock the owner out of their own
    // project — and no one could reach member management anymore.
    setup({
      workspace: role(
        "owner",
        6,
        allow("project.view.all", "project.admin.all"),
      ),
      project: role("project_viewer", 2, allow("project.view")),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    // The project role doesn't carry `member.invite` — the master key
    // decides anyway, because it's checked before the role.
    expect(access.has("member.invite")).toBe(true);
    // And the rank ceiling stays open-ended upward, otherwise the demotion
    // couldn't be undone.
    expect(assignmentCeiling(access, "PROJECT")).toBe(Number.POSITIVE_INFINITY);
  });
});

describe("can()", () => {
  it("antwortet false statt zu werfen", async () => {
    setup();
    expect(await can("u1", "project.view", { projectId: "p1" })).toBe(false);
  });

  it("meldet ein unbekanntes Projekt als kein Zugriff", async () => {
    setup();
    mockProjectFindUnique.mockResolvedValue(null);
    expect(await can("u1", "project.view", { projectId: "weg" })).toBe(false);
  });
});

describe("assignmentCeiling", () => {
  it("begrenzt auf den eigenen Rang der Ebene", async () => {
    setup({ project: role("project_admin", 4, []) });
    const access = await accessFor("u1", { projectId: "p1" });
    expect(assignmentCeiling(access, "PROJECT")).toBe(4);
  });

  it("ist nach oben offen, wo der Handelnde keine Rolle trägt", async () => {
    // A workspace admin without their own project role derives their
    // authority from the level above and may assign any project role.
    setup({ workspace: role("admin", 5, allow("member.invite")) });
    const access = await accessFor("u1", { projectId: "p1" });
    expect(assignmentCeiling(access, "PROJECT")).toBe(Number.POSITIVE_INFINITY);
    expect(assignmentCeiling(access, "WORKSPACE")).toBe(5);
  });
});

// Entry is not a permission — it decides whether the workspace shell renders
// at all. There are three ways in, and a pending invitation is not one of them.
describe("canEnterWorkspace", () => {
  it("lässt Mitglieder hinein", async () => {
    setup({ workspace: role("member", 2, allow("project.view")) });
    expect(await canEnterWorkspace("u1", "ws1")).toBe(true);
  });

  it("sperrt aus, wer weder im Workspace noch in einem Projekt ist", async () => {
    setup();
    expect(await canEnterWorkspace("u1", "ws1")).toBe(false);
  });

  it("lässt einen Projekt-Gast ohne Workspace-Mitgliedschaft hinein", async () => {
    setup();
    // No `WorkspaceMember`, but a row in a project of the workspace.
    mockProjectMemberFindFirst.mockResolvedValue({ projectId: "p1" });
    expect(await canEnterWorkspace("u1", "ws1")).toBe(true);
  });

  it("sperrt einen gesperrten Workspace zu", async () => {
    setup({
      workspace: role("owner", 6, allow("project.view.all")),
      suspended: true,
    });
    expect(await canEnterWorkspace("u1", "ws1")).toBe(false);
  });

  it("lässt eine offene Einladung nicht hinein", async () => {
    setup({
      workspace: role("member", 2, allow("project.view")),
      pending: true,
    });
    expect(await canEnterWorkspace("u1", "ws1")).toBe(false);
  });

  it("lässt Support überall hinein", async () => {
    setup({
      platform: role("platform_support", 1, allow("tenant.access")),
      suspended: true,
    });
    expect(await canEnterWorkspace("u1", "ws1")).toBe(true);
  });

  it("lässt einen Plattform-Admin ohne tenant.access nicht hinein", async () => {
    setup({
      platform: role(
        "platform_admin",
        2,
        allow("platform.access", "user.manage"),
      ),
    });
    expect(await canEnterWorkspace("u1", "ws1")).toBe(false);
  });

  it("verlangt eine Session", async () => {
    setup({ workspace: role("owner", 6, allow("project.view.all")) });
    expect(await canEnterWorkspace(null, "ws1")).toBe(false);
  });
});

describe("accessibleProjectIds", () => {
  it("zeigt nur, wo eine Projektrolle vorliegt", async () => {
    setup({ workspace: role("member", 2, allow("project.view")) });
    mockProjectFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    mockProjectMemberFindMany.mockResolvedValue([
      { projectId: "p1", role: role("contributor", 3, allow("project.view")) },
    ]);

    const visible = await accessibleProjectIds("u1", "ws1");
    expect([...visible]).toEqual(["p1"]);
  });

  it("zeigt nichts ohne jede Projektrolle", async () => {
    setup({ workspace: role("member", 2, allow("project.view")) });
    mockProjectFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    mockProjectMemberFindMany.mockResolvedValue([]);

    const visible = await accessibleProjectIds("u1", "ws1");
    expect([...visible]).toEqual([]);
  });

  it("verbirgt ein Projekt, dessen Rolle project.view nicht führt", async () => {
    setup({ workspace: role("member", 2, allow("project.view")) });
    mockProjectFindMany.mockResolvedValue([{ id: "p1" }]);
    mockProjectMemberFindMany.mockResolvedValue([
      { projectId: "p1", role: role("blocked", 0, []) },
    ]);

    const visible = await accessibleProjectIds("u1", "ws1");
    expect([...visible]).toEqual([]);
  });

  it("zeigt einem Owner alles, auch ohne Eintrag", async () => {
    setup({
      workspace: role("owner", 6, allow("project.view", "project.view.all")),
    });
    mockProjectFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    mockProjectMemberFindMany.mockResolvedValue([]);

    const visible = await accessibleProjectIds("u1", "ws1");
    expect([...visible].sort()).toEqual(["p1", "p2"]);
  });

  it("zeigt in einem gesperrten Workspace nichts", async () => {
    setup({
      workspace: role("owner", 6, allow("project.view")),
      suspended: true,
    });
    mockProjectFindMany.mockResolvedValue([{ id: "p1" }]);
    mockProjectMemberFindMany.mockResolvedValue([
      {
        projectId: "p1",
        role: role("project_admin", 4, allow("project.view")),
      },
    ]);

    expect([...(await accessibleProjectIds("u1", "ws1"))]).toEqual([]);
  });

  it("gibt ohne Session eine leere Menge", async () => {
    expect([...(await accessibleProjectIds(null, "ws1"))]).toEqual([]);
  });
});

// ── Deactivated accounts ────────────────────────────────────────────────────
//
// The suspension happens before any role resolution. The cases here check
// exactly that: not that a deactivated account gets less, but that it gets
// *nothing* — even when its roles, taken by themselves, would allow everything.

describe("Ein stillgelegtes Konto bekommt nirgends Rechte", () => {
  it("nicht auf der Plattform, auch mit voller Plattform-Rolle", async () => {
    setup({
      deactivated: true,
      platform: role(
        "platform_admin",
        2,
        allow("platform.access", "user.manage"),
      ),
    });

    const access = await accessFor("u1", { scope: "platform" });
    expect(access.has("platform.access")).toBe(false);
    expect(access.has("user.manage")).toBe(false);
  });

  it("nicht im Workspace, auch als Owner", async () => {
    setup({
      deactivated: true,
      workspace: role(
        "owner",
        6,
        allow("workspace.update", "project.admin.all"),
      ),
    });

    const access = await accessFor("u1", { workspaceId: "ws1" });
    expect(access.has("workspace.update")).toBe(false);
  });

  it("nicht im Projekt, auch mit Projektrolle", async () => {
    setup({
      deactivated: true,
      workspace: role("member", 2, []),
      project: role("project_admin", 4, allow("project.view", "issue.create")),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(false);
    expect(access.has("issue.create")).toBe(false);
  });

  it("hebt auch den Support-Generalschlüssel auf", async () => {
    // `tenant.access` otherwise outranks every rule. Deactivation outranks it.
    setup({
      deactivated: true,
      platform: role("platform_support", 1, allow("tenant.access")),
    });

    const access = await accessFor("u1", { projectId: "p1" });
    expect(access.has("project.view")).toBe(false);
  });

  it("lässt es nicht mehr in den Workspace", async () => {
    setup({
      deactivated: true,
      workspace: role("owner", 6, allow("workspace.update")),
    });

    expect(await canEnterWorkspace("u1", "ws1")).toBe(false);
  });

  it("zeigt ihm kein einziges Projekt", async () => {
    setup({
      deactivated: true,
      workspace: role("owner", 6, allow("project.view.all")),
    });
    mockProjectFindMany.mockResolvedValue([{ id: "p1" }, { id: "p2" }]);
    mockProjectMemberFindMany.mockResolvedValue([]);

    expect([...(await accessibleProjectIds("u1", "ws1"))]).toEqual([]);
  });
});
