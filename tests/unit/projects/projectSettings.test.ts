import { beforeEach, describe, expect, it, mock } from "bun:test";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockProjectFindUnique = mock();
const mockProjectUpdate = mock();
const mockProjectDelete = mock();
const mockIssueDeleteMany = mock();
const mockWorkspaceMemberFindMany = mock();
const mockProjectMemberCreateMany = mock();
const mockTransaction = mock();
const mockAuditLogCreate = mock();

const mockTx = {
  issue: { deleteMany: mockIssueDeleteMany },
  project: { delete: mockProjectDelete },
};

mock.module("@/lib/db", () => ({
  db: {
    project: {
      findUnique: mockProjectFindUnique,
      update: mockProjectUpdate,
      delete: mockProjectDelete,
      create: mock(),
    },
    issue: { deleteMany: mockIssueDeleteMany },
    user: { findUnique: mock(async () => null) },
    auditLog: { create: mockAuditLogCreate },
    workspaceMember: { findMany: mockWorkspaceMemberFindMany },
    projectMember: { createMany: mockProjectMemberCreateMany },
    $transaction: mockTransaction,
  },
}));

const mockCan = mock();
const mockCurrentUserId = mock();

mock.module("@/lib/permissions", () => ({
  can: mockCan,
  currentUserId: mockCurrentUserId,
  accessFor: mock(),
  hasPermission: mock(),
  assignmentCeiling: () => Number.POSITIVE_INFINITY,
}));

mock.module("@/lib/session", () => ({ getSession: mock() }));
mock.module("next/cache", () => ({ revalidatePath: mock() }));
mock.module("@/lib/user-defaults", () => ({
  generateHandle: mock(async () => "ada"),
  pickUserColor: () => "#6e63e6",
}));

import {
  deleteProject,
  setProjectFieldVisibility,
  updateProject,
} from "@/features/projects/actions";

const PROJECT = "p-1";
const WS = "acme";
const ACTOR = "u-actor";

/** Default state: logged in, may do anything to the project, project exists. */
function reset() {
  for (const m of [
    mockProjectFindUnique,
    mockProjectUpdate,
    mockProjectDelete,
    mockIssueDeleteMany,
    mockWorkspaceMemberFindMany,
    mockProjectMemberCreateMany,
    mockTransaction,
    mockCan,
    mockCurrentUserId,
    mockAuditLogCreate,
  ]) {
    m.mockReset();
  }

  mockCurrentUserId.mockResolvedValue(ACTOR);
  mockCan.mockResolvedValue(true);
  mockAuditLogCreate.mockResolvedValue({});
  mockProjectFindUnique.mockResolvedValue({
    workspaceId: WS,
    name: "Web App",
    visibility: "private",
    _count: { issues: 12, members: 4 },
  });
  mockProjectUpdate.mockResolvedValue({ id: PROJECT, workspaceId: WS });
  mockWorkspaceMemberFindMany.mockResolvedValue([]);
  mockTransaction.mockImplementation(
    async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
  );
}

describe("updateProject() — Zugriffsschutz", () => {
  beforeEach(reset);

  it("lehnt ab, wenn niemand eingeloggt ist", async () => {
    mockCurrentUserId.mockResolvedValue(null);
    expect(await updateProject(PROJECT, { name: "Neu" })).toEqual({
      error: "You must be logged in.",
    });
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it("verlangt project.update", async () => {
    mockCan.mockResolvedValue(false);
    expect(await updateProject(PROJECT, { name: "Neu" })).toEqual({
      error: "You are not allowed to change this project.",
    });
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it("prüft im Kontext des Projekts, nicht des Workspace", async () => {
    await updateProject(PROJECT, { name: "Neu" });
    expect(mockCan).toHaveBeenCalledWith(ACTOR, "project.update", {
      projectId: PROJECT,
    });
  });

  it("lehnt ab, wenn das Projekt nicht mehr existiert", async () => {
    mockProjectFindUnique.mockResolvedValue(null);
    expect(await updateProject(PROJECT, { name: "Neu" })).toEqual({
      error: "This project no longer exists.",
    });
  });
});

describe("updateProject() — Felder", () => {
  beforeEach(reset);

  it("schreibt nur die übergebenen Felder", async () => {
    await updateProject(PROJECT, { name: "  Web App  " });
    expect(mockProjectUpdate.mock.calls[0][0].data).toEqual({
      name: "Web App",
    });
  });

  it("lehnt einen leeren Namen ab", async () => {
    expect(await updateProject(PROJECT, { name: "   " })).toEqual({
      error: "Name is required.",
    });
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it("normalisiert das Kürzel auf vier alphanumerische Zeichen", async () => {
    mockProjectFindUnique
      .mockResolvedValueOnce({ workspaceId: WS })
      .mockResolvedValueOnce(null);
    await updateProject(PROJECT, { prefix: "we-b app" });
    expect(mockProjectUpdate.mock.calls[0][0].data.prefix).toBe("WEBA");
  });

  it("meldet ein vergebenes Kürzel statt eines anderen zu nehmen", async () => {
    mockProjectFindUnique
      .mockResolvedValueOnce({ workspaceId: WS })
      .mockResolvedValueOnce({ id: "p-anders" });
    expect(await updateProject(PROJECT, { prefix: "WEB" })).toEqual({
      error: "Another project in this workspace uses that identifier.",
    });
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it("nimmt das eigene Kürzel nicht als Kollision", async () => {
    mockProjectFindUnique
      .mockResolvedValueOnce({ workspaceId: WS })
      .mockResolvedValueOnce({ id: PROJECT });
    expect(await updateProject(PROJECT, { prefix: "WEB" })).toEqual({
      ok: true,
    });
  });

  it("lässt den Slug unberührt — geteilte Adressen bleiben gültig", async () => {
    await updateProject(PROJECT, { name: "Ganz anderer Name" });
    expect(mockProjectUpdate.mock.calls[0][0].data.slug).toBeUndefined();
  });
});

describe("updateProject() — Sichtbarkeit", () => {
  beforeEach(reset);

  it("nimmt beim Wechsel auf öffentlich alle Workspace-Mitglieder auf", async () => {
    await updateProject(PROJECT, { visibility: "public" });
    expect(mockProjectUpdate.mock.calls[0][0].data.visibility).toBe("public");
    expect(mockWorkspaceMemberFindMany).toHaveBeenCalled();
  });

  it("wirft beim Wechsel auf privat niemanden hinaus", async () => {
    mockProjectFindUnique.mockResolvedValue({
      workspaceId: WS,
      name: "Web App",
      visibility: "public",
      _count: { issues: 12, members: 4 },
    });
    await updateProject(PROJECT, { visibility: "private" });
    expect(mockProjectUpdate.mock.calls[0][0].data.visibility).toBe("private");
    // No enrolling, but no removing either: the table stays as it is.
    expect(mockWorkspaceMemberFindMany).not.toHaveBeenCalled();
    expect(mockProjectMemberCreateMany).not.toHaveBeenCalled();
  });

  it("protokolliert den Wechsel — der Feed fürs Workspace-Aktivitäts-Log", async () => {
    // Default mock is "private", so this is a real change.
    await updateProject(PROJECT, { visibility: "public" });
    expect(mockAuditLogCreate).toHaveBeenCalledTimes(1);
    const entry = mockAuditLogCreate.mock.calls[0][0].data;
    expect(entry.action).toBe("project.visibility.changed");
    expect(entry.workspaceId).toBe(WS);
    expect(entry.projectId).toBe(PROJECT);
    expect(entry.meta).toEqual({ from: "private", to: "public" });
  });

  it("protokolliert nichts, wenn sich die Sichtbarkeit nicht ändert", async () => {
    // Default mock is already "private" — the same value is not a change.
    await updateProject(PROJECT, { visibility: "private" });
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });

  it("protokolliert nichts, wenn die Sichtbarkeit gar nicht angefasst wird", async () => {
    await updateProject(PROJECT, { name: "Neuer Name" });
    expect(mockAuditLogCreate).not.toHaveBeenCalled();
  });
});

describe("setProjectFieldVisibility() (BARY-31)", () => {
  beforeEach(reset);

  it("verlangt project.update", async () => {
    mockCan.mockResolvedValue(false);
    expect(await setProjectFieldVisibility(PROJECT, ["dueDate"])).toEqual({
      error: "You are not allowed to change this project.",
    });
    expect(mockProjectUpdate).not.toHaveBeenCalled();
  });

  it("schreibt die übergebene Menge als hiddenDetailFields", async () => {
    await setProjectFieldVisibility(PROJECT, [
      "dueDate",
      "storyPoints",
      "estimateHours",
    ]);
    expect(mockProjectUpdate.mock.calls[0][0].data).toEqual({
      hiddenDetailFields: ["dueDate", "storyPoints", "estimateHours"],
    });
  });

  it("verwirft unbekannte Keys", async () => {
    await setProjectFieldVisibility(PROJECT, ["dueDate", "sowieso-nicht"]);
    expect(mockProjectUpdate.mock.calls[0][0].data.hiddenDetailFields).toEqual([
      "dueDate",
    ]);
  });

  it("lässt keine permanenten Felder zu, selbst wenn sie mitgeschickt werden", async () => {
    await setProjectFieldVisibility(PROJECT, [
      "type",
      "status",
      "assignee",
      "description",
      "dueDate",
    ]);
    expect(mockProjectUpdate.mock.calls[0][0].data.hiddenDetailFields).toEqual([
      "dueDate",
    ]);
  });
});

describe("deleteProject()", () => {
  beforeEach(reset);

  it("verlangt project.delete", async () => {
    mockCan.mockResolvedValue(false);
    expect(await deleteProject(PROJECT)).toEqual({
      error: "You are not allowed to delete this project.",
    });
    expect(mockProjectDelete).not.toHaveBeenCalled();
  });

  it("löscht die Issues vor dem Projekt — der Fremdschlüssel steht auf Restrict", async () => {
    expect(await deleteProject(PROJECT)).toEqual({ ok: true });
    expect(mockIssueDeleteMany).toHaveBeenCalledWith({
      where: { projectId: PROJECT },
    });
    expect(mockProjectDelete).toHaveBeenCalledWith({
      where: { id: PROJECT },
    });
  });
});
