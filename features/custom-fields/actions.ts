"use server";

import { revalidatePath } from "next/cache";
import type {
  CustomFieldResult,
  OptionInput,
} from "@/features/custom-fields/types";
import { recordAudit } from "@/lib/audit";
import type { AuditAction } from "@/lib/audit/actions";
import {
  FIELD_LIMITS,
  type FieldOption,
  fieldKeyFromName,
  isCustomFieldType,
  isReservedFieldKey,
  toOptions,
  usesOptions,
  validateOptions,
} from "@/lib/custom-fields";
import { db } from "@/lib/db";
import { requirePermission } from "@/lib/permissions";
import { uid } from "@/lib/utils/id";

// Defining a field is one permission, `customfield.manage`, checked in the
// scope the field lives in: a workspace field in the workspace context, a
// project field in the project context. A project role therefore can't touch
// a workspace-wide field, and the other way round nothing is implied.

type Scope = { workspaceId: string; projectId: string | null };

function ctxOf(scope: Scope) {
  return scope.projectId
    ? ({ projectId: scope.projectId } as const)
    : ({ workspaceId: scope.workspaceId } as const);
}

/** The workspace comes from the project, never from the caller's input. */
async function scopeForNew(input: {
  workspaceId: string;
  projectId?: string | null;
}): Promise<Scope | null> {
  if (!input.projectId) {
    return { workspaceId: input.workspaceId, projectId: null };
  }
  const project = await db.project.findUnique({
    where: { id: input.projectId },
    select: { workspaceId: true },
  });
  if (!project) return null;
  return { workspaceId: project.workspaceId, projectId: input.projectId };
}

async function uniqueKey(workspaceId: string, name: string): Promise<string> {
  const base = fieldKeyFromName(name);
  let key = isReservedFieldKey(base) ? `${base}_field` : base;
  let n = 1;
  while (
    await db.customField.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
      select: { id: true },
    })
  ) {
    key = `${base}_${++n}`;
  }
  return key;
}

function withIds(options: OptionInput[] | undefined) {
  return (options ?? []).map((o) => ({
    id: o.id && o.id !== "" ? o.id : uid("o_"),
    label: typeof o.label === "string" ? o.label : "",
    color: o.color ?? null,
  }));
}

/** Prisma's Json input wants plain objects, not an interface type. */
function plainOptions(options: FieldOption[]) {
  return options.map((o) => ({ id: o.id, label: o.label, color: o.color }));
}

function cleanName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const name = value.trim();
  if (name === "" || name.length > FIELD_LIMITS.name) return null;
  return name;
}

function cleanDescription(value: unknown): string | null {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length > FIELD_LIMITS.description ? null : text;
}

async function audit(
  action: AuditAction,
  actorId: string,
  field: { id: string; name: string },
  scope: Scope,
) {
  await recordAudit({
    action,
    actorId,
    target: { type: "customField", id: field.id, label: field.name },
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
  });
}

function refresh() {
  revalidatePath("/", "layout");
}

export async function createCustomField(input: {
  workspaceId: string;
  projectId?: string | null;
  name: string;
  description?: string;
  type: string;
  options?: OptionInput[];
}): Promise<CustomFieldResult<{ id: string; key: string }>> {
  const scope = await scopeForNew(input);
  if (!scope) return { error: "not_found" };
  const actorId = await requirePermission("customfield.manage", ctxOf(scope));

  const name = cleanName(input.name);
  if (!name) return { error: "name_invalid" };
  const description = cleanDescription(input.description);
  if (description === null) return { error: "description_invalid" };
  if (!isCustomFieldType(input.type)) return { error: "type_invalid" };

  const options = validateOptions(input.type, withIds(input.options));
  if (!options.ok) return { error: "options_invalid" };

  const active = await db.customField.count({
    where: { workspaceId: scope.workspaceId, archivedAt: null },
  });
  if (active >= FIELD_LIMITS.fieldsPerWorkspace) {
    return { error: "limit_reached" };
  }

  const last = await db.customField.aggregate({
    where: { workspaceId: scope.workspaceId, projectId: scope.projectId },
    _max: { position: true },
  });
  const key = await uniqueKey(scope.workspaceId, name);

  const field = await db.customField.create({
    data: {
      id: uid("cf_"),
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
      key,
      name,
      description,
      type: input.type,
      options: plainOptions(options.options),
      position: (last._max.position ?? -1) + 1,
    },
  });

  await audit("customfield.created", actorId, field, scope);
  refresh();
  return { ok: true, id: field.id, key: field.key };
}

async function loadField(id: string) {
  const field = await db.customField.findUnique({
    where: { id },
    select: {
      id: true,
      workspaceId: true,
      projectId: true,
      name: true,
      type: true,
      options: true,
    },
  });
  if (!field) return null;
  return {
    field,
    scope: {
      workspaceId: field.workspaceId,
      projectId: field.projectId,
    } satisfies Scope,
  };
}

/**
 * Rename, describe, or change the choices. The type and the key stay: a value
 * stored under another type would be wrong, and the key is what integrations
 * address the field by.
 *
 * Removing a choice clears it from the issues that carry it, in the same
 * transaction — a stored id with no matching option would otherwise show up
 * as an empty chip.
 */
export async function updateCustomField(
  id: string,
  patch: { name?: string; description?: string; options?: OptionInput[] },
): Promise<CustomFieldResult> {
  const found = await loadField(id);
  if (!found) return { error: "not_found" };
  const { field, scope } = found;
  const actorId = await requirePermission("customfield.manage", ctxOf(scope));

  const data: { name?: string; description?: string; options?: object[] } = {};
  if (patch.name !== undefined) {
    const name = cleanName(patch.name);
    if (!name) return { error: "name_invalid" };
    data.name = name;
  }
  if (patch.description !== undefined) {
    const description = cleanDescription(patch.description);
    if (description === null) return { error: "description_invalid" };
    data.description = description;
  }

  let removed: string[] = [];
  if (patch.options !== undefined && usesOptions(field.type)) {
    const options = validateOptions(field.type, withIds(patch.options));
    if (!options.ok) return { error: "options_invalid" };
    const kept = new Set(options.options.map((o) => o.id));
    removed = toOptions(field.options)
      .map((o) => o.id)
      .filter((optionId) => !kept.has(optionId));
    data.options = plainOptions(options.options);
  }

  await db.$transaction(async (tx) => {
    await tx.customField.update({ where: { id }, data });

    if (removed.length === 0) return;
    if (field.type === "SELECT") {
      await tx.issueFieldValue.deleteMany({
        where: {
          fieldId: id,
          OR: removed.map((optionId) => ({ value: { equals: optionId } })),
        },
      });
      return;
    }
    const rows = await tx.issueFieldValue.findMany({
      where: { fieldId: id },
      select: { issueId: true, value: true },
    });
    for (const row of rows) {
      if (!Array.isArray(row.value)) continue;
      const next = (row.value as unknown[]).filter(
        (v): v is string => typeof v === "string" && !removed.includes(v),
      );
      if (next.length === row.value.length) continue;
      if (next.length === 0) {
        await tx.issueFieldValue.delete({
          where: { issueId_fieldId: { issueId: row.issueId, fieldId: id } },
        });
      } else {
        await tx.issueFieldValue.update({
          where: { issueId_fieldId: { issueId: row.issueId, fieldId: id } },
          data: { value: next },
        });
      }
    }
  });

  await audit(
    "customfield.updated",
    actorId,
    { id, name: data.name ?? field.name },
    scope,
  );
  refresh();
  return { ok: true };
}

/** Puts the given fields in this order. The ids must all be in the one scope. */
export async function reorderCustomFields(input: {
  workspaceId: string;
  projectId?: string | null;
  ids: string[];
}): Promise<CustomFieldResult> {
  const scope = await scopeForNew(input);
  if (!scope) return { error: "not_found" };
  await requirePermission("customfield.manage", ctxOf(scope));

  const ids = [...new Set(input.ids)];
  const found = await db.customField.findMany({
    where: {
      id: { in: ids },
      workspaceId: scope.workspaceId,
      projectId: scope.projectId,
    },
    select: { id: true },
  });
  if (found.length !== ids.length) return { error: "not_found" };

  await db.$transaction(
    ids.map((id, position) =>
      db.customField.update({ where: { id }, data: { position } }),
    ),
  );
  refresh();
  return { ok: true };
}

/** Hides a field from pickers and cards but keeps what was entered. */
export async function setCustomFieldArchived(
  id: string,
  archived: boolean,
): Promise<CustomFieldResult> {
  const found = await loadField(id);
  if (!found) return { error: "not_found" };
  const { field, scope } = found;
  const actorId = await requirePermission("customfield.manage", ctxOf(scope));

  if (!archived) {
    // Restoring counts against the limit like creating does.
    const active = await db.customField.count({
      where: { workspaceId: scope.workspaceId, archivedAt: null },
    });
    if (active >= FIELD_LIMITS.fieldsPerWorkspace) {
      return { error: "limit_reached" };
    }
  }

  await db.customField.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
  });
  await audit(
    archived ? "customfield.archived" : "customfield.restored",
    actorId,
    field,
    scope,
  );
  refresh();
  return { ok: true };
}

/** Deletes the field and, with it, every value (cascade). Not undoable. */
export async function deleteCustomField(
  id: string,
): Promise<CustomFieldResult> {
  const found = await loadField(id);
  if (!found) return { error: "not_found" };
  const { field, scope } = found;
  const actorId = await requirePermission("customfield.manage", ctxOf(scope));

  await db.customField.delete({ where: { id } });
  await audit("customfield.deleted", actorId, field, scope);
  refresh();
  return { ok: true };
}
