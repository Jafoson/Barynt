import { beforeEach, describe, expect, it, mock } from "bun:test";

const tx = {
  customField: { update: mock() },
  issueFieldValue: {
    deleteMany: mock(),
    findMany: mock(),
    update: mock(),
    delete: mock(),
  },
};

mock.module("@/lib/db", () => ({
  db: {
    project: { findUnique: mock() },
    customField: {
      findUnique: mock(),
      findMany: mock(),
      count: mock(),
      aggregate: mock(),
      create: mock(),
      update: mock(),
      delete: mock(),
    },
    $transaction: mock(async (arg: unknown) =>
      typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : arg,
    ),
  },
}));

mock.module("@/lib/permissions", () => ({
  requirePermission: mock(async () => "u1"),
  PermissionError: class PermissionError extends Error {},
}));

mock.module("@/lib/audit", () => ({ recordAudit: mock(async () => {}) }));
mock.module("@/lib/storage", () => ({
  finalizeAvatarUpload: mock(async () => ({ ok: true })),
  deleteAvatarObject: mock(async () => {}),
  requestAvatarUpload: mock(async () => ({
    ok: true,
    key: "fieldoptions/ws-1/new.png",
    uploadUrl: "https://storage.example/put",
  })),
}));
mock.module("next/cache", () => ({ revalidatePath: mock() }));

import {
  createCustomField,
  deleteCustomField,
  reorderCustomFields,
  requestOptionImageUpload,
  setCustomFieldArchived,
  updateCustomField,
} from "@/features/custom-fields/actions";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import {
  deleteAvatarObject,
  finalizeAvatarUpload,
  requestAvatarUpload,
} from "@/lib/storage";

const cf = db.customField as unknown as Record<string, ReturnType<typeof mock>>;
const project = db.project.findUnique as ReturnType<typeof mock>;
const perm = requirePermission as ReturnType<typeof mock>;
const audit = recordAudit as ReturnType<typeof mock>;

function reset() {
  for (const fn of Object.values(cf)) fn.mockReset();
  project.mockReset();
  perm.mockClear();
  audit.mockClear();
  for (const group of Object.values(tx)) {
    for (const fn of Object.values(group)) fn.mockReset();
  }
  cf.findUnique.mockResolvedValue(null);
  cf.count.mockResolvedValue(3);
  cf.aggregate.mockResolvedValue({ _max: { position: 4 } });
  cf.create.mockImplementation(async ({ data }: { data: object }) => data);
}

describe("createCustomField()", () => {
  beforeEach(reset);

  it("creates a workspace field in the workspace context", async () => {
    const r = await createCustomField({
      workspaceId: "ws-1",
      name: "Customer ID",
      type: "TEXT",
    });
    expect(r).toMatchObject({ ok: true, key: "customer_id" });
    expect(perm.mock.calls[0]).toEqual([
      "customfield.manage",
      { workspaceId: "ws-1" },
    ]);
    const data = cf.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      workspaceId: "ws-1",
      projectId: null,
      key: "customer_id",
      position: 5,
    });
    expect(audit.mock.calls[0][0]).toMatchObject({
      action: "customfield.created",
      target: { type: "customField", label: "Customer ID" },
    });
  });

  it("takes the workspace of a project field from the project", async () => {
    project.mockResolvedValue({ workspaceId: "ws-real" });
    await createCustomField({
      workspaceId: "ws-forged",
      projectId: "p-1",
      name: "Version",
      type: "TEXT",
    });
    expect(perm.mock.calls[0][1]).toEqual({ projectId: "p-1" });
    expect(cf.create.mock.calls[0][0].data).toMatchObject({
      workspaceId: "ws-real",
      projectId: "p-1",
    });
  });

  it("reports an unknown project without checking anything else", async () => {
    project.mockResolvedValue(null);
    const r = await createCustomField({
      workspaceId: "ws-1",
      projectId: "gone",
      name: "X",
      type: "TEXT",
    });
    expect(r).toEqual({ error: "not_found" });
    expect(cf.create).not.toHaveBeenCalled();
  });

  it("finds a free key and avoids the issue's own property names", async () => {
    cf.findUnique
      .mockResolvedValueOnce({ id: "a" })
      .mockResolvedValueOnce(null);
    const r = await createCustomField({
      workspaceId: "ws-1",
      name: "Size",
      type: "TEXT",
    });
    expect(r).toMatchObject({ key: "size_2" });

    reset();
    const s = await createCustomField({
      workspaceId: "ws-1",
      name: "Status",
      type: "TEXT",
    });
    expect(s).toMatchObject({ key: "status_field" });
  });

  it("rejects bad input and stores nothing", async () => {
    const base = { workspaceId: "ws-1" };
    expect(
      await createCustomField({ ...base, name: "  ", type: "TEXT" }),
    ).toEqual({ error: "name_invalid" });
    expect(
      await createCustomField({ ...base, name: "x".repeat(61), type: "TEXT" }),
    ).toEqual({ error: "name_invalid" });
    expect(
      await createCustomField({ ...base, name: "A", type: "BOGUS" }),
    ).toEqual({ error: "type_invalid" });
    expect(
      await createCustomField({ ...base, name: "A", type: "SELECT" }),
    ).toEqual({ error: "options_invalid" });
    expect(cf.create).not.toHaveBeenCalled();
  });

  it("assigns ids to new choices", async () => {
    await createCustomField({
      workspaceId: "ws-1",
      name: "Size",
      type: "SELECT",
      options: [{ label: "S" }, { label: "M", color: "#112233" }],
      optionVisuals: ["color"],
    });
    const options = cf.create.mock.calls[0][0].data.options;
    expect(options).toHaveLength(2);
    expect(options[0].id).toMatch(/^o_/);
    expect(options[1]).toMatchObject({ label: "M", color: "#112233" });
  });

  it("stops at the limit of active fields", async () => {
    cf.count.mockResolvedValue(100);
    const r = await createCustomField({
      workspaceId: "ws-1",
      name: "One more",
      type: "TEXT",
    });
    expect(r).toEqual({ error: "limit_reached" });
  });
});

describe("createCustomField() icon, date mode and own values", () => {
  beforeEach(reset);

  it("stores an icon from the list and rejects any other name", async () => {
    await createCustomField({
      workspaceId: "ws-1",
      name: "Owner",
      type: "TEXT",
      icon: "lucide:user",
    });
    expect(cf.create.mock.calls[0][0].data.icon).toBe("lucide:user");

    const r = await createCustomField({
      workspaceId: "ws-1",
      name: "Owner",
      type: "TEXT",
      icon: "lucide:made-up-icon",
    });
    expect(r).toEqual({ error: "icon_invalid" });
  });

  it("keeps the date mode for a date field and ignores it elsewhere", async () => {
    await createCustomField({
      workspaceId: "ws-1",
      name: "Release",
      type: "DATE",
      dateMode: "DATETIME",
    });
    expect(cf.create.mock.calls[0][0].data.dateMode).toBe("DATETIME");

    await createCustomField({
      workspaceId: "ws-1",
      name: "Note",
      type: "TEXT",
      dateMode: "TIME",
    });
    expect(cf.create.mock.calls[1][0].data.dateMode).toBe("DATE");

    expect(
      await createCustomField({
        workspaceId: "ws-1",
        name: "X",
        type: "DATE",
        dateMode: "WEEK",
      }),
    ).toEqual({ error: "date_mode_invalid" });
  });

  it("only a choice field can allow its own values", async () => {
    await createCustomField({
      workspaceId: "ws-1",
      name: "Size",
      type: "SELECT",
      options: [{ label: "S" }],
      allowCustomOptions: true,
    });
    expect(cf.create.mock.calls[0][0].data.allowCustomOptions).toBe(true);

    await createCustomField({
      workspaceId: "ws-1",
      name: "Text",
      type: "TEXT",
      allowCustomOptions: true,
    });
    expect(cf.create.mock.calls[1][0].data.allowCustomOptions).toBe(false);
  });
});

describe("option images", () => {
  const finalize = finalizeAvatarUpload as ReturnType<typeof mock>;
  const dropObject = deleteAvatarObject as ReturnType<typeof mock>;
  const requestUpload = requestAvatarUpload as ReturnType<typeof mock>;

  beforeEach(() => {
    reset();
    finalize.mockClear();
    dropObject.mockClear();
    requestUpload.mockClear();
  });

  it("keeps an uploaded image after checking it belongs to the workspace", async () => {
    const r = await createCustomField({
      workspaceId: "ws-1",
      name: "Team",
      type: "SELECT",
      options: [{ label: "A", image: "fieldoptions/ws-1/a.png" }],
      optionVisuals: ["image"],
    });
    expect(r).toMatchObject({ ok: true });
    expect(finalize.mock.calls[0]).toEqual([
      "fieldoption",
      "ws-1",
      "fieldoptions/ws-1/a.png",
    ]);
    expect(cf.create.mock.calls[0][0].data.options[0].image).toBe(
      "fieldoptions/ws-1/a.png",
    );
  });

  it("refuses a key of another workspace without asking storage", async () => {
    const r = await createCustomField({
      workspaceId: "ws-1",
      name: "Team",
      type: "SELECT",
      options: [{ label: "A", image: "fieldoptions/ws-OTHER/a.png" }],
      optionVisuals: ["image"],
    });
    expect(r).toEqual({ error: "image_invalid" });
    expect(finalize).not.toHaveBeenCalled();
    expect(cf.create).not.toHaveBeenCalled();
  });

  it("refuses an image storage does not have", async () => {
    finalize.mockResolvedValueOnce({ error: "Upload not found" });
    const r = await createCustomField({
      workspaceId: "ws-1",
      name: "Team",
      type: "SELECT",
      options: [{ label: "A", image: "fieldoptions/ws-1/missing.png" }],
      optionVisuals: ["image"],
    });
    expect(r).toEqual({ error: "image_invalid" });
  });

  it("does not check a key the field already carried, and removes dropped images", async () => {
    cf.findUnique.mockResolvedValue({
      id: "f1",
      workspaceId: "ws-1",
      projectId: null,
      name: "Team",
      type: "SELECT",
      optionVisuals: ["image"],
      options: [
        {
          id: "o_a",
          label: "A",
          color: null,
          image: "fieldoptions/ws-1/keep.png",
        },
        {
          id: "o_b",
          label: "B",
          color: null,
          image: "fieldoptions/ws-1/gone.png",
        },
      ],
    });
    const r = await updateCustomField("f1", {
      options: [{ id: "o_a", label: "A", image: "fieldoptions/ws-1/keep.png" }],
    });
    expect(r).toEqual({ ok: true });
    expect(finalize).not.toHaveBeenCalled();
    expect(dropObject.mock.calls.map((c) => c[0])).toEqual([
      "fieldoptions/ws-1/gone.png",
    ]);
  });

  it("removes the images of a deleted field", async () => {
    cf.findUnique
      .mockResolvedValueOnce({
        id: "f1",
        workspaceId: "ws-1",
        projectId: null,
        name: "Team",
      })
      .mockResolvedValueOnce({
        options: [{ id: "o_a", label: "A", image: "fieldoptions/ws-1/a.png" }],
      });
    await deleteCustomField("f1");
    expect(dropObject.mock.calls.map((c) => c[0])).toEqual([
      "fieldoptions/ws-1/a.png",
    ]);
  });

  it("issues an upload URL in the workspace's name and refuses large files", async () => {
    const ok = await requestOptionImageUpload({
      workspaceId: "ws-1",
      contentType: "image/png",
      contentLength: 1000,
    });
    expect(ok).toMatchObject({ ok: true });
    expect(requestUpload.mock.calls[0][0]).toMatchObject({
      kind: "fieldoption",
      ownerId: "ws-1",
    });
    expect(perm.mock.calls.at(-1)).toEqual([
      "customfield.manage",
      { workspaceId: "ws-1" },
    ]);

    const big = await requestOptionImageUpload({
      workspaceId: "ws-1",
      contentType: "image/png",
      contentLength: 2 * 1024 * 1024,
    });
    expect(big).toEqual({ error: "too_large" });
  });
});

describe("what a choice may carry", () => {
  beforeEach(reset);

  const rich = {
    label: "A",
    icon: "lucide:user",
    color: "#aabbcc",
    image: "fieldoptions/ws-1/a.png",
  };

  it("stores only the kinds the field allows", async () => {
    const r = await createCustomField({
      workspaceId: "ws-1",
      name: "Team",
      type: "SELECT",
      options: [rich],
      optionVisuals: ["color"],
    });
    expect(r).toMatchObject({ ok: true });
    const data = cf.create.mock.calls[0][0].data;
    expect(data.optionVisuals).toEqual(["color"]);
    expect(data.options[0]).toMatchObject({
      color: "#aabbcc",
      icon: null,
      image: null,
    });
  });

  it("stores nothing extra when no kind is allowed", async () => {
    await createCustomField({
      workspaceId: "ws-1",
      name: "Team",
      type: "SELECT",
      options: [rich],
    });
    const data = cf.create.mock.calls[0][0].data;
    expect(data.optionVisuals).toEqual([]);
    expect(data.options[0]).toMatchObject({
      color: null,
      icon: null,
      image: null,
    });
  });

  it("rejects an unknown kind", async () => {
    const r = await createCustomField({
      workspaceId: "ws-1",
      name: "Team",
      type: "SELECT",
      options: [{ label: "A" }],
      optionVisuals: ["sparkle"],
    });
    expect(r).toEqual({ error: "visuals_invalid" });
  });

  it("strips stored choices and drops their images when a kind is turned off", async () => {
    cf.findUnique.mockResolvedValue({
      id: "f1",
      workspaceId: "ws-1",
      projectId: null,
      name: "Team",
      type: "SELECT",
      optionVisuals: ["icon", "image"],
      options: [
        {
          id: "o_a",
          label: "A",
          color: null,
          icon: "lucide:user",
          image: "fieldoptions/ws-1/a.png",
        },
      ],
    });
    const r = await updateCustomField("f1", { optionVisuals: ["icon"] });
    expect(r).toEqual({ ok: true });
    const written = tx.customField.update.mock.calls[0][0].data;
    expect(written.optionVisuals).toEqual(["icon"]);
    expect(written.options[0]).toMatchObject({
      icon: "lucide:user",
      image: null,
    });
    const dropped = (
      deleteAvatarObject as ReturnType<typeof mock>
    ).mock.calls.map((c) => c[0]);
    expect(dropped).toEqual(["fieldoptions/ws-1/a.png"]);
  });
});

describe("updateCustomField()", () => {
  beforeEach(reset);

  const field = (over: object = {}) => ({
    id: "f1",
    workspaceId: "ws-1",
    projectId: null,
    name: "Size",
    type: "SELECT",
    options: [
      { id: "o_s", label: "S", color: null },
      { id: "o_m", label: "M", color: null },
    ],
    ...over,
  });

  it("checks the permission in the field's own scope", async () => {
    cf.findUnique.mockResolvedValue(field({ projectId: "p-1" }));
    await updateCustomField("f1", { name: "Shirt size" });
    expect(perm.mock.calls[0]).toEqual([
      "customfield.manage",
      { projectId: "p-1" },
    ]);
  });

  it("clears a removed choice from single-choice values", async () => {
    cf.findUnique.mockResolvedValue(field());
    await updateCustomField("f1", {
      options: [{ id: "o_s", label: "Small" }],
    });
    expect(tx.issueFieldValue.deleteMany.mock.calls[0][0]).toEqual({
      where: { fieldId: "f1", OR: [{ value: { equals: "o_m" } }] },
    });
  });

  it("drops a removed choice from multi-choice values and deletes empty ones", async () => {
    cf.findUnique.mockResolvedValue(field({ type: "MULTI_SELECT" }));
    tx.issueFieldValue.findMany.mockResolvedValue([
      { issueId: "i1", value: ["o_s", "o_m"] },
      { issueId: "i2", value: ["o_m"] },
      { issueId: "i3", value: ["o_s"] },
    ]);
    await updateCustomField("f1", {
      options: [{ id: "o_s", label: "S" }],
    });
    expect(tx.issueFieldValue.update.mock.calls).toHaveLength(1);
    expect(tx.issueFieldValue.update.mock.calls[0][0]).toMatchObject({
      where: { issueId_fieldId: { issueId: "i1", fieldId: "f1" } },
      data: { value: ["o_s"] },
    });
    expect(tx.issueFieldValue.delete.mock.calls).toHaveLength(1);
    expect(tx.issueFieldValue.delete.mock.calls[0][0]).toMatchObject({
      where: { issueId_fieldId: { issueId: "i2", fieldId: "f1" } },
    });
  });

  it("leaves values alone when no choice was removed", async () => {
    cf.findUnique.mockResolvedValue(field());
    await updateCustomField("f1", {
      options: [
        { id: "o_s", label: "Small" },
        { id: "o_m", label: "Medium" },
      ],
    });
    expect(tx.issueFieldValue.deleteMany).not.toHaveBeenCalled();
    expect(tx.issueFieldValue.findMany).not.toHaveBeenCalled();
  });

  it("ignores options for a type without choices", async () => {
    cf.findUnique.mockResolvedValue(field({ type: "TEXT", options: [] }));
    await updateCustomField("f1", { options: [{ label: "x" }] });
    expect(tx.customField.update.mock.calls[0][0].data).toEqual({});
  });

  it("reports a missing field", async () => {
    cf.findUnique.mockResolvedValue(null);
    expect(await updateCustomField("nope", { name: "x" })).toEqual({
      error: "not_found",
    });
  });
});

describe("reorderCustomFields()", () => {
  beforeEach(reset);

  it("refuses ids outside the scope", async () => {
    cf.findMany.mockResolvedValue([{ id: "a" }]);
    const r = await reorderCustomFields({
      workspaceId: "ws-1",
      ids: ["a", "foreign"],
    });
    expect(r).toEqual({ error: "not_found" });
    expect(cf.update).not.toHaveBeenCalled();
  });

  it("writes the new order", async () => {
    cf.findMany.mockResolvedValue([{ id: "b" }, { id: "a" }]);
    await reorderCustomFields({ workspaceId: "ws-1", ids: ["b", "a"] });
    expect(cf.update.mock.calls.map((c) => c[0].data.position)).toEqual([0, 1]);
    expect(cf.update.mock.calls.map((c) => c[0].where.id)).toEqual(["b", "a"]);
  });
});

describe("archive and delete", () => {
  beforeEach(reset);

  const found = { id: "f1", workspaceId: "ws-1", projectId: null, name: "N" };

  it("archives and restores with the right audit action", async () => {
    cf.findUnique.mockResolvedValue(found);
    await setCustomFieldArchived("f1", true);
    expect(cf.update.mock.calls[0][0].data.archivedAt).toBeInstanceOf(Date);
    expect(audit.mock.calls[0][0].action).toBe("customfield.archived");

    await setCustomFieldArchived("f1", false);
    expect(cf.update.mock.calls[1][0].data.archivedAt).toBeNull();
    expect(audit.mock.calls[1][0].action).toBe("customfield.restored");
  });

  it("will not restore past the limit", async () => {
    cf.findUnique.mockResolvedValue(found);
    cf.count.mockResolvedValue(100);
    expect(await setCustomFieldArchived("f1", false)).toEqual({
      error: "limit_reached",
    });
  });

  it("deletes and records it", async () => {
    cf.findUnique.mockResolvedValue(found);
    expect(await deleteCustomField("f1")).toEqual({ ok: true });
    expect(cf.delete.mock.calls[0][0]).toEqual({ where: { id: "f1" } });
    expect(audit.mock.calls[0][0].action).toBe("customfield.deleted");
  });

  it("does not touch anything for an unknown field", async () => {
    cf.findUnique.mockResolvedValue(null);
    expect(await deleteCustomField("nope")).toEqual({ error: "not_found" });
    expect(cf.delete).not.toHaveBeenCalled();
  });
});
