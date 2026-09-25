import { beforeEach, describe, expect, it, mock } from "bun:test";

// Writing the definitions of custom fields. What matters: every write asks for `customfield.manage`
// where the field applies (the workspace for a workspace-wide field, the project for a project's;
// the workspace of a project field is the project's, never the client's), the definition is checked
// and never trusted, the key and the type never change, an option that issues still answer with
// cannot be taken away, a plugin's fields are not changed by a person, and every change is audited.
// No real database, no real permissions.

const mockProjectFind = mock();
const mockDefFind = mock();
const mockDefAggregate = mock();
const mockDefCreate = mock();
const mockDefUpdate = mock();
const mockDefDelete = mock();
const mockValueGroupBy = mock();
const mockValueCount = mock();
const mockHas = mock();
const mockUserId = mock(async (): Promise<string | null> => "u1");
const mockAudit = mock();
const mockRevalidate = mock();

mock.module("@/lib/db", () => ({
  db: {
    project: { findUnique: mockProjectFind },
    customFieldDefinition: {
      findUnique: mockDefFind,
      aggregate: mockDefAggregate,
      create: mockDefCreate,
      update: mockDefUpdate,
      delete: mockDefDelete,
    },
    customFieldValue: { groupBy: mockValueGroupBy, count: mockValueCount },
  },
}));
mock.module("@/lib/permissions", () => ({
  hasPermission: mockHas,
  currentUserId: mockUserId,
}));
mock.module("@/lib/audit", () => ({ recordAudit: mockAudit }));
mock.module("next/cache", () => ({ revalidatePath: mockRevalidate }));

import {
  changeCustomField,
  createCustomField,
  deleteCustomField,
  setCustomFieldArchived,
} from "@/features/custom-fields/actions";
import { MAX_CUSTOM_FIELDS_PER_WORKSPACE } from "@/lib/custom-fields/types";

const WS = "ws-7";
const PROJECT = "p-3";

/** The row `loadField` reads: a text field of the workspace, unless told otherwise. */
function fieldRow(more: Record<string, unknown> = {}) {
  return {
    id: "cf-1",
    key: "customer",
    name: "Customer",
    description: "Who pays",
    type: "text",
    config: { maxLength: 60 },
    position: 0,
    archivedAt: null,
    pluginId: null,
    workspaceId: WS,
    projectId: null,
    ...more,
  };
}
const select = (
  options: { id: string; label: string; color: string | null }[],
) =>
  fieldRow({
    id: "cf-2",
    key: "environment",
    name: "Environment",
    type: "select",
    config: { options },
  });

/** Who may do what: the contexts `hasPermission("customfield.manage", …)` is asked for and says yes to. */
let allowed: (ctx: unknown) => boolean = () => true;

beforeEach(() => {
  for (const m of [
    mockProjectFind,
    mockDefFind,
    mockDefAggregate,
    mockDefCreate,
    mockDefUpdate,
    mockDefDelete,
    mockValueGroupBy,
    mockValueCount,
    mockHas,
    mockAudit,
    mockRevalidate,
  ]) {
    m.mockReset();
  }
  allowed = () => true;
  mockUserId.mockResolvedValue("u1");
  mockHas.mockImplementation(async (_permission: string, ctx: unknown) =>
    allowed(ctx),
  );
  mockProjectFind.mockResolvedValue({ workspaceId: WS });
  mockDefFind.mockResolvedValue(null);
  mockDefAggregate.mockResolvedValue({
    _count: { _all: 0 },
    _max: { position: null },
  });
  mockDefCreate.mockResolvedValue({});
  mockDefUpdate.mockResolvedValue({});
  mockDefDelete.mockResolvedValue({});
  mockValueGroupBy.mockResolvedValue([]);
  mockValueCount.mockResolvedValue(0);
});

const written = () => mockDefCreate.mock.calls[0]?.[0]?.data;

describe("creating a field", () => {
  const text = { name: "Customer", type: "text" };

  it("writes a workspace-wide field with the workspace, no project and what the type starts from", async () => {
    const result = await createCustomField({ workspaceId: WS }, text);
    expect(result).toEqual({ ok: true, id: expect.stringMatching(/^cf/) });
    expect(written()).toMatchObject({
      id: (result as { id: string }).id,
      workspaceId: WS,
      projectId: null,
      key: "customer",
      name: "Customer",
      description: "",
      type: "text",
      config: { maxLength: 200 },
      position: 0,
    });
  });

  it("writes the description, trimmed", async () => {
    await createCustomField(
      { workspaceId: WS },
      { ...text, description: "  Who pays  " },
    );
    expect(written().description).toBe("Who pays");
  });

  it("writes a project's field in its project, with the project's workspace", async () => {
    await createCustomField({ projectId: PROJECT }, text);
    expect(written()).toMatchObject({ workspaceId: WS, projectId: PROJECT });
  });

  it("takes the workspace of a project from the project, never from the caller", async () => {
    mockProjectFind.mockResolvedValue({ workspaceId: "the-real-one" });
    await createCustomField(
      { projectId: PROJECT, workspaceId: "someone-elses" } as never,
      text,
    );
    expect(written().workspaceId).toBe("the-real-one");
    expect(mockHas.mock.calls[0][1]).toEqual({ projectId: PROJECT });
  });

  it("asks for customfield.manage in the workspace for a workspace field, in the project for a project's", async () => {
    await createCustomField({ workspaceId: WS }, text);
    await createCustomField({ projectId: PROJECT }, text);
    expect(mockHas.mock.calls).toEqual([
      ["customfield.manage", { workspaceId: WS }],
      ["customfield.manage", { projectId: PROJECT }],
    ]);
  });

  it("writes nothing for someone who may not, and says so", async () => {
    allowed = () => false;
    const result = await createCustomField({ workspaceId: WS }, text);
    expect(result).toEqual({
      error: "You are not allowed to manage custom fields here.",
    });
    expect(mockDefCreate).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("does not let a project admin write a field for the whole workspace", async () => {
    allowed = (ctx) => "projectId" in (ctx as object);
    expect(
      "error" in (await createCustomField({ workspaceId: WS }, text)),
    ).toBe(true);
    expect(
      "ok" in (await createCustomField({ projectId: PROJECT }, text)),
    ).toBe(true);
  });

  it("does not know a scope that is none, or a project that does not exist", async () => {
    for (const scope of [
      null,
      undefined,
      {},
      "ws",
      5,
      { workspaceId: 5 },
      { workspaceId: "" },
      { projectId: "" },
    ]) {
      expect(await createCustomField(scope as never, text)).toEqual({
        error: "Unknown workspace or project.",
      });
    }
    mockProjectFind.mockResolvedValue(null);
    expect(await createCustomField({ projectId: "gone" }, text)).toEqual({
      error: "Unknown workspace or project.",
    });
    expect(mockDefCreate).not.toHaveBeenCalled();
    expect(mockHas).not.toHaveBeenCalled();
  });

  it("says what is wrong with the definition, part by part, and writes nothing", async () => {
    const result = await createCustomField(
      { workspaceId: WS },
      { name: "", type: "nope" },
    );
    expect(result).toMatchObject({ error: "Some of the field is not valid." });
    expect(
      (result as { issues: { path: string }[] }).issues
        .map((i) => i.path)
        .sort(),
    ).toEqual(["name", "type"]);
    expect(mockDefCreate).not.toHaveBeenCalled();
  });

  it("copes with an input that is not an object", async () => {
    for (const input of [null, undefined, "x", 5]) {
      const result = await createCustomField(
        { workspaceId: WS },
        input as never,
      );
      expect("error" in result).toBe(true);
    }
    expect(mockDefCreate).not.toHaveBeenCalled();
  });

  it("writes the config in the normal form of its type, options with ids", async () => {
    await createCustomField(
      { workspaceId: WS },
      {
        name: "Env",
        type: "select",
        config: {
          options: [
            { label: "Staging" },
            { label: "Production", color: "#FF0000" },
          ],
        },
      },
    );
    expect(written().config).toEqual({
      options: [
        { id: "staging", label: "Staging", color: null },
        { id: "production", label: "Production", color: "#ff0000" },
      ],
    });
  });

  it("refuses a setting the type does not have", async () => {
    const result = await createCustomField(
      { workspaceId: WS },
      { name: "N", type: "text", config: { min: 1 } },
    );
    expect((result as { issues: { path: string }[] }).issues[0].path).toBe(
      "config",
    );
    expect(mockDefCreate).not.toHaveBeenCalled();
  });

  it("makes the key of the name, and numbers it while it is taken", async () => {
    mockDefFind.mockImplementation(async ({ where }) =>
      ["customer", "customer-2"].includes(where.workspaceId_key.key)
        ? { id: "x" }
        : null,
    );
    await createCustomField({ workspaceId: WS }, text);
    expect(written().key).toBe("customer-3");
  });

  it("looks for a free key in this workspace, and this one only", async () => {
    await createCustomField({ workspaceId: WS }, text);
    expect(mockDefFind.mock.calls[0][0].where).toEqual({
      workspaceId_key: { workspaceId: WS, key: "customer" },
    });
  });

  it("keeps a key it is asked for, and refuses one that is taken, naming the key", async () => {
    await createCustomField({ workspaceId: WS }, { ...text, key: "cust" });
    expect(written().key).toBe("cust");

    mockDefCreate.mockClear();
    mockDefFind.mockResolvedValue({ id: "x" });
    const result = await createCustomField(
      { workspaceId: WS },
      { ...text, key: "cust" },
    );
    expect(result).toEqual({
      error: "A field with this key already exists.",
      issues: [{ path: "key", message: "is taken" }],
    });
    expect(mockDefCreate).not.toHaveBeenCalled();
  });

  it("refuses a key that is no key, before it asks the database", async () => {
    const result = await createCustomField(
      { workspaceId: WS },
      { ...text, key: "Not A Key" },
    );
    expect(
      (result as { issues: { path: string }[] }).issues.map((i) => i.path),
    ).toContain("key");
    expect(mockDefFind).not.toHaveBeenCalled();
  });

  it("keeps a numbered key inside the limit of a key", async () => {
    mockDefFind.mockImplementation(async ({ where }) =>
      where.workspaceId_key.key.length <= 40 &&
      !where.workspaceId_key.key.includes("-2")
        ? { id: "x" }
        : null,
    );
    await createCustomField(
      { workspaceId: WS },
      { name: "a".repeat(60), type: "text" },
    );
    expect(written().key.length).toBeLessThanOrEqual(40);
    expect(written().key.endsWith("-2")).toBe(true);
  });

  it("puts the new field after the last one of the workspace", async () => {
    mockDefAggregate.mockResolvedValue({
      _count: { _all: 3 },
      _max: { position: 7 },
    });
    await createCustomField({ workspaceId: WS }, text);
    expect(written().position).toBe(8);
    expect(mockDefAggregate.mock.calls[0][0].where).toEqual({
      workspaceId: WS,
    });
  });

  it("allows a workspace so many fields, and not one more", async () => {
    mockDefAggregate.mockResolvedValue({
      _count: { _all: MAX_CUSTOM_FIELDS_PER_WORKSPACE - 1 },
      _max: { position: 5 },
    });
    expect("ok" in (await createCustomField({ workspaceId: WS }, text))).toBe(
      true,
    );

    mockDefCreate.mockClear();
    mockDefAggregate.mockResolvedValue({
      _count: { _all: MAX_CUSTOM_FIELDS_PER_WORKSPACE },
      _max: { position: 5 },
    });
    const result = await createCustomField({ workspaceId: WS }, text);
    expect(result).toEqual({
      error: `A workspace can have at most ${MAX_CUSTOM_FIELDS_PER_WORKSPACE} custom fields.`,
    });
    expect(mockDefCreate).not.toHaveBeenCalled();
  });

  it("says the key is taken when the database says another one was faster", async () => {
    mockDefCreate.mockRejectedValue(
      Object.assign(new Error("dup"), { code: "P2002" }),
    );
    const result = await createCustomField({ workspaceId: WS }, text);
    expect(result).toMatchObject({
      error: "A field with this key already exists.",
    });
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("does not take any other failure for a taken key", async () => {
    mockDefCreate.mockRejectedValue(new Error("database is down"));
    await expect(createCustomField({ workspaceId: WS }, text)).rejects.toThrow(
      "database is down",
    );
  });

  it("is audited with who, what and where, and the page reads again", async () => {
    const result = (await createCustomField(
      { projectId: PROJECT },
      { name: "Env", type: "date" },
    )) as { id: string };
    expect(mockAudit.mock.calls).toEqual([
      [
        {
          action: "customfield.created",
          actorId: "u1",
          target: { type: "customField", id: result.id, label: "Env" },
          workspaceId: WS,
          projectId: PROJECT,
          meta: { key: "env", type: "date" },
        },
      ],
    ]);
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });
});

describe("changing a field", () => {
  beforeEach(() => {
    mockDefFind.mockResolvedValue(fieldRow());
  });

  it("changes the name and the description, and keeps the key and the type", async () => {
    const result = await changeCustomField("cf-1", {
      name: " Client ",
      description: "Who orders",
    });
    expect(result).toEqual({ ok: true, id: "cf-1" });
    expect(mockDefUpdate.mock.calls[0][0]).toEqual({
      where: { id: "cf-1" },
      data: {
        name: "Client",
        description: "Who orders",
        config: { maxLength: 60 },
      },
    });
  });

  it("does not take a key or a type from the change", async () => {
    await changeCustomField("cf-1", {
      name: "Client",
      key: "other",
      type: "number",
    } as never);
    const data = mockDefUpdate.mock.calls[0][0].data;
    expect(data).not.toHaveProperty("key");
    expect(data).not.toHaveProperty("type");
  });

  it("leaves out what is not said", async () => {
    await changeCustomField("cf-1", { name: "Client" });
    expect(mockDefUpdate.mock.calls[0][0].data).toEqual({
      name: "Client",
      description: "Who pays",
      config: { maxLength: 60 },
    });
  });

  it("changes what the type allows", async () => {
    await changeCustomField("cf-1", { config: { maxLength: 120 } });
    expect(mockDefUpdate.mock.calls[0][0].data.config).toEqual({
      maxLength: 120,
    });
  });

  it("refuses a config the type does not have, with the part that is wrong", async () => {
    const result = await changeCustomField("cf-1", { config: { min: 1 } });
    expect(result).toMatchObject({ error: "Some of the field is not valid." });
    expect((result as { issues: { path: string }[] }).issues[0].path).toBe(
      "config",
    );
    expect(mockDefUpdate).not.toHaveBeenCalled();
  });

  it("refuses an empty name", async () => {
    const result = await changeCustomField("cf-1", { name: "  " });
    expect((result as { issues: { path: string }[] }).issues[0].path).toBe(
      "name",
    );
    expect(mockDefUpdate).not.toHaveBeenCalled();
  });

  it("says nothing changed, and writes and audits nothing, when nothing did", async () => {
    expect(
      await changeCustomField("cf-1", {
        name: "Customer",
        description: "Who pays",
        config: { maxLength: 60 },
      }),
    ).toEqual({ ok: true, id: "cf-1" });
    expect(await changeCustomField("cf-1", {})).toEqual({
      ok: true,
      id: "cf-1",
    });
    expect(mockDefUpdate).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
    expect(mockRevalidate).not.toHaveBeenCalled();
  });

  it("names what changed in the audit entry, and nothing else", async () => {
    await changeCustomField("cf-1", {
      name: "Client",
      config: { maxLength: 10 },
    });
    expect(mockAudit.mock.calls[0][0]).toEqual({
      action: "customfield.updated",
      actorId: "u1",
      target: { type: "customField", id: "cf-1", label: "Client" },
      workspaceId: WS,
      projectId: null,
      meta: { key: "customer", changed: ["name", "config"] },
    });
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });

  it("names only the description when only that changed", async () => {
    await changeCustomField("cf-1", { description: "New" });
    expect(mockAudit.mock.calls[0][0].meta.changed).toEqual(["description"]);
  });

  it("asks in the workspace for a workspace field, in the project for a project's", async () => {
    await changeCustomField("cf-1", { name: "A" });
    mockDefFind.mockResolvedValue(fieldRow({ projectId: PROJECT }));
    await changeCustomField("cf-1", { name: "B" });
    expect(mockHas.mock.calls.map((c) => c[1])).toEqual([
      { workspaceId: WS },
      { projectId: PROJECT },
    ]);
  });

  it("does not let a project admin change a field of the whole workspace", async () => {
    allowed = (ctx) => "projectId" in (ctx as object);
    expect(await changeCustomField("cf-1", { name: "A" })).toEqual({
      error: "You are not allowed to manage custom fields here.",
    });
    expect(mockDefUpdate).not.toHaveBeenCalled();
  });

  it("does not know a field that is gone, or an id that is none", async () => {
    mockDefFind.mockResolvedValue(null);
    expect(await changeCustomField("gone", { name: "A" })).toEqual({
      error: "This field no longer exists.",
    });
    mockDefFind.mockClear();
    for (const id of [undefined, null, "", 5, {}]) {
      expect(await changeCustomField(id as never, { name: "A" })).toEqual({
        error: "This field no longer exists.",
      });
    }
    // Not even asked: an id that is none is not looked up.
    expect(mockDefFind).not.toHaveBeenCalled();
    expect(mockHas).not.toHaveBeenCalled();
  });

  it("does not know a field whose type is not one of ours", async () => {
    mockDefFind.mockResolvedValue(fieldRow({ type: "boolean" }));
    expect(await changeCustomField("cf-1", { name: "A" })).toEqual({
      error: "This field no longer exists.",
    });
  });

  it("leaves a plugin's field to the plugin", async () => {
    mockDefFind.mockResolvedValue(fieldRow({ pluginId: "crm" }));
    const result = await changeCustomField("cf-1", { name: "A" });
    expect(result).toMatchObject({
      error: expect.stringContaining("belongs to a plugin"),
    });
    expect(mockDefUpdate).not.toHaveBeenCalled();
  });

  describe("the options of a choice", () => {
    const options = [
      { id: "staging", label: "Staging", color: null },
      { id: "prod", label: "Production", color: null },
    ];
    beforeEach(() => {
      mockDefFind.mockResolvedValue(select(options));
    });

    it("can be renamed: the id stays, so the answers still fit", async () => {
      await changeCustomField("cf-2", {
        config: {
          options: [
            { id: "staging", label: "Stage" },
            { id: "prod", label: "Production" },
          ],
        },
      });
      expect(
        mockDefUpdate.mock.calls[0][0].data.config.options.map(
          (o: { id: string; label: string }) => [o.id, o.label],
        ),
      ).toEqual([
        ["staging", "Stage"],
        ["prod", "Production"],
      ]);
    });

    it("can be added to, and get an id of their own", async () => {
      await changeCustomField("cf-2", {
        config: { options: [...options, { label: "Dev" }] },
      });
      expect(
        mockDefUpdate.mock.calls[0][0].data.config.options.map(
          (o: { id: string }) => o.id,
        ),
      ).toEqual(["staging", "prod", "dev"]);
    });

    it("can be taken away while no issue answers with them", async () => {
      await changeCustomField("cf-2", {
        config: { options: [{ id: "prod", label: "Production" }] },
      });
      expect(mockDefUpdate).toHaveBeenCalledTimes(1);
      expect(mockValueGroupBy.mock.calls[0][0].where).toEqual({
        fieldId: "cf-2",
        text: { in: ["staging"] },
      });
    });

    it("cannot be taken away while an issue answers with them, and the reason names the option and how many", async () => {
      mockValueGroupBy.mockResolvedValue([
        { text: "staging", _count: { _all: 4 } },
      ]);
      const result = await changeCustomField("cf-2", {
        config: { options: [{ id: "prod", label: "Production" }] },
      });
      expect(result).toMatchObject({
        error: expect.stringContaining('"Staging" (4)'),
      });
      expect((result as { issues: unknown[] }).issues).toEqual([
        { path: "config", message: "an option is in use" },
      ]);
      expect(mockDefUpdate).not.toHaveBeenCalled();
      expect(mockAudit).not.toHaveBeenCalled();
    });

    it("names every option that is in use", async () => {
      mockValueGroupBy.mockResolvedValue([
        { text: "staging", _count: { _all: 4 } },
        { text: "prod", _count: { _all: 1 } },
      ]);
      const result = await changeCustomField("cf-2", {
        config: { options: [{ label: "Only new" }] },
      });
      expect((result as { error: string }).error).toContain('"Staging" (4)');
      expect((result as { error: string }).error).toContain('"Production" (1)');
    });

    it("do not ask the database when none was taken away", async () => {
      await changeCustomField("cf-2", { name: "Env" });
      expect(mockValueGroupBy).not.toHaveBeenCalled();
    });

    it("are not looked at for a field that is not a choice", async () => {
      await changeCustomField("cf-1", { name: "A" });
      expect(mockValueGroupBy).not.toHaveBeenCalled();
    });
  });
});

describe("archiving a field", () => {
  beforeEach(() => {
    mockDefFind.mockResolvedValue(fieldRow());
  });

  it("sets the day, audits it and reads the page again", async () => {
    expect(await setCustomFieldArchived("cf-1", true)).toEqual({
      ok: true,
      id: "cf-1",
    });
    const data = mockDefUpdate.mock.calls[0][0].data;
    expect(data.archivedAt).toBeInstanceOf(Date);
    expect(mockAudit.mock.calls[0][0]).toMatchObject({
      action: "customfield.archived",
      actorId: "u1",
      target: { type: "customField", id: "cf-1", label: "Customer" },
      workspaceId: WS,
      projectId: null,
      meta: { key: "customer" },
    });
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });

  it("clears the day to bring it back, and audits that instead", async () => {
    mockDefFind.mockResolvedValue(fieldRow({ archivedAt: new Date() }));
    await setCustomFieldArchived("cf-1", false);
    expect(mockDefUpdate.mock.calls[0][0].data).toEqual({ archivedAt: null });
    expect(mockAudit.mock.calls[0][0].action).toBe("customfield.restored");
  });

  it("does nothing when the field already is as asked", async () => {
    expect(await setCustomFieldArchived("cf-1", false)).toEqual({
      ok: true,
      id: "cf-1",
    });
    mockDefFind.mockResolvedValue(fieldRow({ archivedAt: new Date() }));
    expect(await setCustomFieldArchived("cf-1", true)).toEqual({
      ok: true,
      id: "cf-1",
    });
    expect(mockDefUpdate).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("asks where the field applies, and refuses without it", async () => {
    mockDefFind.mockResolvedValue(fieldRow({ projectId: PROJECT }));
    allowed = (ctx) => "workspaceId" in (ctx as object);
    expect(await setCustomFieldArchived("cf-1", true)).toEqual({
      error: "You are not allowed to manage custom fields here.",
    });
    expect(mockHas.mock.calls[0][1]).toEqual({ projectId: PROJECT });
    expect(mockDefUpdate).not.toHaveBeenCalled();
  });

  it("does not know a field that is gone, and leaves a plugin's to the plugin", async () => {
    mockDefFind.mockResolvedValue(null);
    expect(await setCustomFieldArchived("gone", true)).toEqual({
      error: "This field no longer exists.",
    });
    mockDefFind.mockResolvedValue(fieldRow({ pluginId: "crm" }));
    expect(await setCustomFieldArchived("cf-1", true)).toMatchObject({
      error: expect.stringContaining("plugin"),
    });
    expect(mockDefUpdate).not.toHaveBeenCalled();
  });
});

describe("deleting a field", () => {
  beforeEach(() => {
    mockDefFind.mockResolvedValue(fieldRow());
  });

  it("deletes the field, and the audit entry says how many answers went with it", async () => {
    mockValueCount.mockResolvedValue(12);
    expect(await deleteCustomField("cf-1")).toEqual({ ok: true, id: "cf-1" });
    expect(mockDefDelete.mock.calls).toEqual([[{ where: { id: "cf-1" } }]]);
    expect(mockValueCount.mock.calls[0][0].where).toEqual({ fieldId: "cf-1" });
    expect(mockAudit.mock.calls[0][0]).toEqual({
      action: "customfield.deleted",
      actorId: "u1",
      target: { type: "customField", id: "cf-1", label: "Customer" },
      workspaceId: WS,
      projectId: null,
      meta: { key: "customer", type: "text", values: 12 },
    });
    expect(mockRevalidate).toHaveBeenCalledTimes(1);
  });

  it("counts before it deletes, so the number is what was lost", async () => {
    const order: string[] = [];
    mockValueCount.mockImplementation(async () => {
      order.push("count");
      return 1;
    });
    mockDefDelete.mockImplementation(async () => {
      order.push("delete");
    });
    await deleteCustomField("cf-1");
    expect(order).toEqual(["count", "delete"]);
  });

  it("asks where the field applies, and deletes nothing without it", async () => {
    mockDefFind.mockResolvedValue(fieldRow({ projectId: PROJECT }));
    allowed = () => false;
    expect(await deleteCustomField("cf-1")).toEqual({
      error: "You are not allowed to manage custom fields here.",
    });
    expect(mockHas.mock.calls[0][1]).toEqual({ projectId: PROJECT });
    expect(mockDefDelete).not.toHaveBeenCalled();
    expect(mockAudit).not.toHaveBeenCalled();
  });

  it("does not know a field that is gone, and leaves a plugin's to the plugin", async () => {
    mockDefFind.mockResolvedValue(null);
    expect(await deleteCustomField("gone")).toEqual({
      error: "This field no longer exists.",
    });
    mockDefFind.mockResolvedValue(fieldRow({ pluginId: "crm" }));
    expect(await deleteCustomField("cf-1")).toMatchObject({
      error: expect.stringContaining("plugin"),
    });
    expect(mockDefDelete).not.toHaveBeenCalled();
  });
});
