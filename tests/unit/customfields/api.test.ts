import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("@/lib/db", () => ({
  db: {
    customField: { findMany: mock() },
    workspaceMember: { findMany: mock() },
  },
}));
mock.module("@/features/issues/audit", () => ({
  recordIssueAudit: mock(async () => {}),
}));

import {
  apiFieldValues,
  fieldFiltersWhere,
  translateApiFields,
} from "@/features/custom-fields/api";
import { db } from "@/lib/db";

const findMany = db.customField.findMany as ReturnType<typeof mock>;
const SCOPE = { workspaceId: "ws1", projectId: "p1" };

const sizeOptions = [
  { id: "o_s", label: "Small", color: null },
  { id: "o_m", label: "Medium", color: null },
];
const text = { id: "f_text", key: "customer", type: "TEXT", options: [] };
const size = {
  id: "f_size",
  key: "size",
  type: "SELECT",
  options: sizeOptions,
};
const tags = {
  id: "f_tags",
  key: "tags",
  type: "MULTI_SELECT",
  options: sizeOptions,
};
const num = { id: "f_num", key: "score", type: "NUMBER", options: [] };

const withBase = (f: object) => ({
  workspaceId: "ws1",
  projectId: null,
  name: "x",
  description: "",
  archivedAt: null,
  icon: null,
  dateMode: "DATE",
  allowCustomOptions: false,
  ...f,
});

beforeEach(() => findMany.mockReset());

describe("apiFieldValues()", () => {
  it("keys values by field key and shows choices as id and label", () => {
    const out = apiFieldValues([
      { value: "Acme", field: { ...text, archivedAt: null } },
      { value: "o_m", field: { ...size, archivedAt: null } },
      { value: ["o_s", "gone"], field: { ...tags, archivedAt: null } },
      { value: 4, field: { ...num, archivedAt: null } },
    ] as never);
    expect(out).toEqual({
      customer: "Acme",
      size: { id: "o_m", label: "Medium" },
      tags: [
        { id: "o_s", label: "Small" },
        { id: "gone", label: "gone" },
      ],
      score: 4,
    });
  });

  it("leaves archived fields out", () => {
    const out = apiFieldValues([
      { value: "x", field: { ...text, archivedAt: new Date() } },
    ] as never);
    expect(out).toEqual({});
  });
});

describe("translateApiFields()", () => {
  it("passes nothing through for an absent or empty object", async () => {
    expect(await translateApiFields(SCOPE, undefined)).toEqual({
      ok: true,
      values: {},
    });
    expect(await translateApiFields(SCOPE, {})).toEqual({
      ok: true,
      values: {},
    });
    expect(findMany).not.toHaveBeenCalled();
  });

  it("rejects a body that is not an object", async () => {
    for (const bad of ["x", 5, [], null]) {
      expect(await translateApiFields(SCOPE, bad)).toEqual({
        ok: false,
        reason: "invalid_body",
      });
    }
  });

  it("maps keys to ids and choices from a label to an id", async () => {
    findMany.mockResolvedValue([withBase(text), withBase(size)]);
    const r = await translateApiFields(SCOPE, {
      customer: "Acme",
      size: "medium",
    });
    expect(r).toEqual({
      ok: true,
      values: { f_text: "Acme", f_size: "o_m" },
    });
    expect(findMany.mock.calls[0][0].where).toMatchObject({
      workspaceId: "ws1",
      archivedAt: null,
      OR: [{ projectId: null }, { projectId: "p1" }],
    });
  });

  it("clears a value with null", async () => {
    findMany.mockResolvedValue([withBase(size)]);
    const r = await translateApiFields(SCOPE, { size: null });
    expect(r).toEqual({ ok: true, values: { f_size: null } });
  });

  it("rejects an unknown key, an unknown choice and a wrong type", async () => {
    findMany.mockResolvedValue([withBase(size), withBase(num)]);
    expect(await translateApiFields(SCOPE, { nope: 1 })).toEqual({
      ok: false,
      reason: "unknown_field",
    });
    expect(await translateApiFields(SCOPE, { size: "Huge" })).toEqual({
      ok: false,
      reason: "invalid_value",
    });
    expect(await translateApiFields(SCOPE, { score: "abc" })).toEqual({
      ok: false,
      reason: "invalid_value",
    });
  });

  it("maps a list of choices", async () => {
    findMany.mockResolvedValue([withBase(tags)]);
    const r = await translateApiFields(SCOPE, { tags: ["Small", "o_m"] });
    expect(r).toEqual({ ok: true, values: { f_tags: ["o_s", "o_m"] } });
    expect(await translateApiFields(SCOPE, { tags: "Small" })).toEqual({
      ok: false,
      reason: "invalid_value",
    });
  });
});

describe("translateApiFields() with own values", () => {
  it("turns an unknown label into a new choice when the field allows it", async () => {
    findMany.mockResolvedValue([
      withBase({ ...size, allowCustomOptions: true }),
    ]);
    const r = await translateApiFields(SCOPE, { size: "Huge" });
    expect(r).toEqual({ ok: true, values: { f_size: expect.anything() } });
  });

  it("rejects an unknown label when the field does not", async () => {
    findMany.mockResolvedValue([withBase(size)]);
    expect(await translateApiFields(SCOPE, { size: "Huge" })).toEqual({
      ok: false,
      reason: "invalid_value",
    });
  });
});

describe("fieldFiltersWhere()", () => {
  it("builds one condition per filter", async () => {
    findMany.mockResolvedValue([withBase(text), withBase(size), withBase(num)]);
    const where = await fieldFiltersWhere(SCOPE, {
      customer: "Acme",
      size: "Small",
      score: "3,5",
    });
    expect(where).toEqual([
      {
        fieldValues: { some: { fieldId: "f_text", value: { equals: "Acme" } } },
      },
      {
        fieldValues: { some: { fieldId: "f_size", value: { equals: "o_s" } } },
      },
      { fieldValues: { some: { fieldId: "f_num", value: { equals: 3.5 } } } },
    ]);
  });

  it("matches a multi-choice field by containment", async () => {
    findMany.mockResolvedValue([withBase(tags)]);
    const where = await fieldFiltersWhere(SCOPE, { tags: "Medium" });
    expect(where).toEqual([
      {
        fieldValues: {
          some: { fieldId: "f_tags", value: { array_contains: ["o_m"] } },
        },
      },
    ]);
  });

  it("returns null for a key that names no field, or a value that cannot match", async () => {
    findMany.mockResolvedValue([withBase(size)]);
    expect(await fieldFiltersWhere(SCOPE, { nope: "x" })).toBeNull();
    expect(await fieldFiltersWhere(SCOPE, { size: "Huge" })).toBeNull();
  });

  it("does nothing without filters", async () => {
    expect(await fieldFiltersWhere(SCOPE, {})).toEqual([]);
    expect(findMany).not.toHaveBeenCalled();
  });
});
