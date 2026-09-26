"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import {
  type DefinitionInput,
  deriveFieldKey,
  isFieldKey,
  parseDefinition,
} from "@/lib/custom-fields/config";
import {
  MAX_CUSTOM_FIELDS_PER_WORKSPACE,
  type SelectConfig,
} from "@/lib/custom-fields/types";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { currentUserId, hasPermission } from "@/lib/permissions";
import { uid } from "@/lib/utils/id";
import { rowOf } from "./queries";
import type { CustomFieldResult, CustomFieldScope } from "./types";

// The definitions of custom fields: create, change, archive, delete. Every one asks for
// `customfield.manage` **where the field applies**: in the workspace for a workspace-wide field, in
// the project for that project's, so a project admin cannot touch a field that applies in every
// project. The definition is checked by `parseDefinition` (lib/custom-fields), which reports every
// problem and never throws; what the client sends is data, never trusted. Like the label actions
// these report the reason instead of throwing: they are called from a management page that shows it.

const NOT_ALLOWED = "You are not allowed to manage custom fields here.";
const GONE = "This field no longer exists.";
const PLUGIN_OWNED =
  "This field belongs to a plugin: the plugin's manifest decides what it is.";

/** The workspace, the project (or none) and the permission context a scope stands for. */
async function resolveScope(scope: unknown) {
  if (typeof scope !== "object" || scope === null) return null;
  const { workspaceId, projectId } = scope as {
    workspaceId?: unknown;
    projectId?: unknown;
  };

  if (typeof projectId === "string" && projectId) {
    const project = await db.project.findUnique({
      where: { id: projectId },
      select: { workspaceId: true },
    });
    if (!project) return null;
    return {
      workspaceId: project.workspaceId,
      projectId,
      ctx: { projectId } as const,
    };
  }
  if (typeof workspaceId === "string" && workspaceId) {
    return { workspaceId, projectId: null, ctx: { workspaceId } as const };
  }
  return null;
}

async function revalidate(): Promise<void> {
  revalidatePath("/", "layout");
}

/** A key that is free in the workspace: the one asked for, or the name's, numbered while it is taken. */
async function freeKey(
  workspaceId: string,
  wanted: string | null,
  name: string,
): Promise<string | null> {
  const taken = async (key: string) =>
    (await db.customFieldDefinition.findUnique({
      where: { workspaceId_key: { workspaceId, key } },
      select: { id: true },
    })) !== null;

  if (wanted) return (await taken(wanted)) ? null : wanted;

  const base = deriveFieldKey(name);
  if (!(await taken(base))) return base;
  for (let n = 2; n < 1000; n++) {
    // Room for the number inside the key's own limit.
    const candidate = `${base.slice(0, 36)}-${n}`;
    if (!(await taken(candidate))) return candidate;
  }
  return null;
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" &&
  error !== null &&
  (error as { code?: unknown }).code === "P2002";

/**
 * A new field in the workspace (for every project) or in one project. The key is made of the name
 * unless one is given; it cannot be changed afterwards (the API and a plugin's manifest use it), and
 * neither can the type (the answers would no longer fit).
 */
export async function createCustomField(
  scope: CustomFieldScope,
  input: DefinitionInput,
): Promise<CustomFieldResult> {
  const where = await resolveScope(scope);
  if (!where) return { error: "Unknown workspace or project." };
  if (!(await hasPermission("customfield.manage", where.ctx))) {
    return { error: NOT_ALLOWED };
  }

  const parsed = parseDefinition(input ?? ({} as DefinitionInput));
  if (!parsed.ok) {
    return { error: "Some of the field is not valid.", issues: parsed.issues };
  }
  const { definition } = parsed;

  const existing = await db.customFieldDefinition.aggregate({
    where: { workspaceId: where.workspaceId },
    _count: { _all: true },
    _max: { position: true },
  });
  if (existing._count._all >= MAX_CUSTOM_FIELDS_PER_WORKSPACE) {
    return {
      error: `A workspace can have at most ${MAX_CUSTOM_FIELDS_PER_WORKSPACE} custom fields.`,
    };
  }

  // A key that was asked for must be free, one made of the name is numbered until it is.
  const asked =
    typeof input?.key === "string" && isFieldKey(input.key) ? input.key : null;
  const key = await freeKey(where.workspaceId, asked, definition.name);
  if (!key) {
    return {
      error: "A field with this key already exists.",
      issues: [{ path: "key", message: "is taken" }],
    };
  }

  const id = uid("cf");
  try {
    await db.customFieldDefinition.create({
      data: {
        id,
        workspaceId: where.workspaceId,
        projectId: where.projectId,
        key,
        name: definition.name,
        description: definition.description,
        icon: definition.icon,
        type: definition.type,
        config: definition.config as unknown as Prisma.InputJsonValue,
        position: (existing._max.position ?? -1) + 1,
      },
    });
  } catch (error) {
    // Two people made the same key at once: the database says which one came second.
    if (isUniqueViolation(error)) {
      return {
        error: "A field with this key already exists.",
        issues: [{ path: "key", message: "is taken" }],
      };
    }
    throw error;
  }

  await recordAudit({
    action: "customfield.created",
    actorId: await currentUserId(),
    target: { type: "customField", id, label: definition.name },
    workspaceId: where.workspaceId,
    projectId: where.projectId,
    meta: { key, type: definition.type },
  });
  await revalidate();
  return { ok: true, id };
}

/** The field, and the permission context of where it applies. */
async function loadField(fieldId: unknown) {
  if (typeof fieldId !== "string" || !fieldId) return null;
  const field = await db.customFieldDefinition.findUnique({
    where: { id: fieldId },
    select: {
      id: true,
      key: true,
      name: true,
      description: true,
      icon: true,
      type: true,
      config: true,
      position: true,
      archivedAt: true,
      pluginId: true,
      workspaceId: true,
      projectId: true,
    },
  });
  if (!field) return null;
  return {
    field,
    row: rowOf(field),
    ctx: field.projectId
      ? ({ projectId: field.projectId } as const)
      : ({ workspaceId: field.workspaceId } as const),
  };
}

export interface CustomFieldChange {
  name?: unknown;
  description?: unknown;
  /** One of the icons, or `null` for the icon of its type; left out it stays. */
  icon?: unknown;
  config?: unknown;
}

/**
 * Change a field's name, description or what its type allows. The key and the type stay. What
 * is left out stays as it is. Taking an option away from a choice is refused while an issue still
 * answers with it: it would leave those answers pointing at nothing.
 */
export async function changeCustomField(
  fieldId: string,
  change: CustomFieldChange,
): Promise<CustomFieldResult> {
  const found = await loadField(fieldId);
  if (!found) return { error: GONE };
  if (!(await hasPermission("customfield.manage", found.ctx))) {
    return { error: NOT_ALLOWED };
  }
  if (found.field.pluginId) return { error: PLUGIN_OWNED };
  const { field, row } = found;
  if (!row) return { error: GONE };

  const parsed = parseDefinition({
    name: change?.name ?? row.name,
    key: row.key,
    description: change?.description ?? row.description,
    icon: change?.icon !== undefined ? change.icon : row.icon,
    type: row.type,
    config: change?.config ?? row.config,
  });
  if (!parsed.ok) {
    return { error: "Some of the field is not valid.", issues: parsed.issues };
  }
  const { definition } = parsed;

  if (row.type === "select") {
    const before = (row.config as SelectConfig).options;
    const after = new Set(
      (definition.config as SelectConfig).options.map((o) => o.id),
    );
    const removed = before.filter((option) => !after.has(option.id));
    if (removed.length > 0) {
      const used = await db.customFieldValue.groupBy({
        by: ["text"],
        where: {
          fieldId: field.id,
          text: { in: removed.map((option) => option.id) },
        },
        _count: { _all: true },
      });
      if (used.length > 0) {
        const named = used
          .map((group) => {
            const label =
              removed.find((option) => option.id === group.text)?.label ??
              group.text;
            return `"${label}" (${group._count._all})`;
          })
          .join(", ");
        return {
          error: `An option is still used by issues, so it cannot be removed: ${named}.`,
          issues: [{ path: "config", message: "an option is in use" }],
        };
      }
    }
  }

  const changed: string[] = [];
  if (definition.name !== row.name) changed.push("name");
  if (definition.description !== row.description) changed.push("description");
  if (definition.icon !== row.icon) changed.push("icon");
  if (JSON.stringify(definition.config) !== JSON.stringify(row.config)) {
    changed.push("config");
  }
  if (changed.length === 0) return { ok: true, id: field.id };

  await db.customFieldDefinition.update({
    where: { id: field.id },
    data: {
      name: definition.name,
      description: definition.description,
      icon: definition.icon,
      config: definition.config as unknown as Prisma.InputJsonValue,
    },
  });

  await recordAudit({
    action: "customfield.updated",
    actorId: await currentUserId(),
    target: { type: "customField", id: field.id, label: definition.name },
    workspaceId: field.workspaceId,
    projectId: field.projectId,
    meta: { key: field.key, changed },
  });
  await revalidate();
  return { ok: true, id: field.id };
}

/**
 * Retire a field, or bring it back. An archived field leaves the screens and the API; **its answers
 * stay**, so restoring it restores them.
 */
export async function setCustomFieldArchived(
  fieldId: string,
  archived: boolean,
): Promise<CustomFieldResult> {
  const found = await loadField(fieldId);
  if (!found) return { error: GONE };
  if (!(await hasPermission("customfield.manage", found.ctx))) {
    return { error: NOT_ALLOWED };
  }
  if (found.field.pluginId) return { error: PLUGIN_OWNED };
  const { field } = found;

  const isArchived = field.archivedAt !== null;
  if (archived === isArchived) return { ok: true, id: field.id };

  await db.customFieldDefinition.update({
    where: { id: field.id },
    data: { archivedAt: archived ? new Date() : null },
  });
  await recordAudit({
    action: archived ? "customfield.archived" : "customfield.restored",
    actorId: await currentUserId(),
    target: { type: "customField", id: field.id, label: field.name },
    workspaceId: field.workspaceId,
    projectId: field.projectId,
    meta: { key: field.key },
  });
  await revalidate();
  return { ok: true, id: field.id };
}

/**
 * Delete a field **and every answer to it**. The audit entry says how many, because that is what
 * cannot be undone: archiving is the way to retire a field without losing them.
 */
export async function deleteCustomField(
  fieldId: string,
): Promise<CustomFieldResult> {
  const found = await loadField(fieldId);
  if (!found) return { error: GONE };
  if (!(await hasPermission("customfield.manage", found.ctx))) {
    return { error: NOT_ALLOWED };
  }
  if (found.field.pluginId) return { error: PLUGIN_OWNED };
  const { field } = found;

  const values = await db.customFieldValue.count({
    where: { fieldId: field.id },
  });
  await db.customFieldDefinition.delete({ where: { id: field.id } });

  await recordAudit({
    action: "customfield.deleted",
    actorId: await currentUserId(),
    target: { type: "customField", id: field.id, label: field.name },
    workspaceId: field.workspaceId,
    projectId: field.projectId,
    meta: { key: field.key, type: field.type, values },
  });
  await revalidate();
  return { ok: true, id: field.id };
}
