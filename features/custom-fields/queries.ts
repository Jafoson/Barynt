import "server-only";
import { fieldConfigOrDefault } from "@/lib/custom-fields/config";
import {
  isCustomFieldType,
  MAX_CUSTOM_FIELDS_PER_WORKSPACE,
} from "@/lib/custom-fields/types";
import { fromColumns } from "@/lib/custom-fields/value";
import { db } from "@/lib/db";
import { accessFor, currentUserId } from "@/lib/permissions";
import { type CardCustomFields, NO_CARD_FIELDS } from "./cardFields";
import type {
  CustomFieldManageRow,
  CustomFieldRow,
  CustomFieldScope,
  CustomFieldsView,
  IssueFieldEntry,
} from "./types";

// What the screens read of the definitions. A row from the database is turned into a
// `CustomFieldRow` in one place, so an unknown type or a config that no longer fits (written by an
// older version, or by hand) never reaches a component: the field is left out, or falls back to what
// its type starts from.

interface DbRow {
  id: string;
  key: string;
  name: string;
  description: string;
  type: string;
  config: unknown;
  position: number;
  archivedAt: Date | null;
  pluginId: string | null;
  workspaceId: string;
  projectId: string | null;
}

export const FIELD_SELECT = {
  id: true,
  key: true,
  name: true,
  description: true,
  type: true,
  config: true,
  position: true,
  archivedAt: true,
  pluginId: true,
  workspaceId: true,
  projectId: true,
} as const;

/** A field as the screens read it, or `null` for a row whose type is not one of ours. */
export function rowOf(row: DbRow): CustomFieldRow | null {
  if (!isCustomFieldType(row.type)) return null;
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    type: row.type,
    config: fieldConfigOrDefault(row.type, row.config),
    position: row.position,
    archived: row.archivedAt !== null,
    pluginId: row.pluginId,
    workspaceId: row.workspaceId,
    projectId: row.projectId,
  };
}

const rowsOf = (rows: DbRow[]): CustomFieldRow[] =>
  rows.map(rowOf).filter((row): row is CustomFieldRow => row !== null);

const ORDER = [{ position: "asc" }, { createdAt: "asc" }] as const;

/**
 * The management page of a workspace's or a project's own fields. A workspace's page needs
 * `customfield.manage` (it is the configuration, and its settings section is only offered to
 * whoever holds it); a project's page shows to whoever may see the project, and says whether they
 * may manage: the fields are part of how the project works, like the switches next to them. `null`
 * for someone who may not, and for a workspace or project that does not exist.
 */
export async function getCustomFieldsView(
  scope: CustomFieldScope,
): Promise<CustomFieldsView | null> {
  const userId = await currentUserId();

  let workspaceId: string;
  let projectId: string | null = null;
  let canManage: boolean;

  if ("projectId" in scope) {
    const project = await db.project.findUnique({
      where: { id: scope.projectId },
      select: { workspaceId: true },
    });
    if (!project) return null;
    workspaceId = project.workspaceId;
    projectId = scope.projectId;
    const access = await accessFor(userId, { projectId });
    if (!access.has("project.view")) return null;
    canManage = access.has("customfield.manage");
  } else {
    workspaceId = scope.workspaceId;
    const access = await accessFor(userId, { workspaceId });
    if (!access.has("customfield.manage")) return null;
    canManage = true;
  }

  const [own, inherited, total] = await Promise.all([
    db.customFieldDefinition.findMany({
      where: { workspaceId, projectId },
      select: FIELD_SELECT,
      orderBy: [...ORDER],
    }),
    projectId
      ? db.customFieldDefinition.findMany({
          where: { workspaceId, projectId: null, archivedAt: null },
          select: FIELD_SELECT,
          orderBy: [...ORDER],
        })
      : Promise.resolve([]),
    db.customFieldDefinition.count({ where: { workspaceId } }),
  ]);

  const fields = rowsOf(own);
  const counts = new Map<string, number>();
  if (fields.length > 0) {
    const grouped = await db.customFieldValue.groupBy({
      by: ["fieldId"],
      where: { fieldId: { in: fields.map((field) => field.id) } },
      _count: { _all: true },
    });
    for (const group of grouped) counts.set(group.fieldId, group._count._all);
  }

  const manageRows: CustomFieldManageRow[] = fields.map((field) => ({
    ...field,
    valueCount: counts.get(field.id) ?? 0,
  }));

  return {
    level: projectId ? "project" : "workspace",
    workspaceId,
    projectId,
    fields: manageRows,
    inherited: rowsOf(inherited),
    canManage,
    room: Math.max(0, MAX_CUSTOM_FIELDS_PER_WORKSPACE - total),
  };
}

/**
 * The fields an issue of this project has, in their order: the workspace-wide ones and the
 * project's own, the archived ones left out. For whoever may see the project; `[]` for anyone else.
 */
export async function getFieldsOfProject(
  projectId: string,
): Promise<CustomFieldRow[]> {
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { workspaceId: true },
  });
  if (!project) return [];
  const access = await accessFor(await currentUserId(), { projectId });
  if (!access.has("project.view")) return [];

  const rows = await db.customFieldDefinition.findMany({
    where: {
      workspaceId: project.workspaceId,
      archivedAt: null,
      OR: [{ projectId: null }, { projectId }],
    },
    select: FIELD_SELECT,
    orderBy: [...ORDER],
  });
  return rowsOf(rows);
}

/**
 * The fields of one issue with its answer to each, in the fields' order: the workspace-wide ones and
 * its project's own, the archived ones left out (their answers stay in the database, out of sight).
 * No permission is asked here: the caller has already let this person see the issue, and its fields
 * are part of it. A field the issue has not answered is there with `value: null`.
 */
export async function getIssueFieldEntries(issue: {
  id: string;
  projectId: string;
  workspaceId: string;
}): Promise<IssueFieldEntry[]> {
  const [definitions, values] = await Promise.all([
    db.customFieldDefinition.findMany({
      where: {
        workspaceId: issue.workspaceId,
        archivedAt: null,
        OR: [{ projectId: null }, { projectId: issue.projectId }],
      },
      select: FIELD_SELECT,
      orderBy: [...ORDER],
    }),
    db.customFieldValue.findMany({ where: { issueId: issue.id } }),
  ]);
  const byField = new Map(values.map((value) => [value.fieldId, value]));

  return rowsOf(definitions).map((field) => {
    const stored = byField.get(field.id);
    return {
      field,
      value: stored ? fromColumns(field.type, stored) : null,
    };
  });
}

/**
 * The fields that apply in the given projects, for the composer and for the Display panel: the
 * workspace-wide ones and those of the projects, archived ones left out, in their order. No
 * permission is asked here: the caller passes only projects it has already resolved (the ones this
 * person may create issues in, the ones they may see).
 */
export async function getFieldsOfProjects(
  workspaceId: string,
  projectIds: string[],
): Promise<CustomFieldRow[]> {
  const rows = await db.customFieldDefinition.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      OR: [{ projectId: null }, { projectId: { in: projectIds } }],
    },
    select: FIELD_SELECT,
    orderBy: [...ORDER],
  });
  return rowsOf(rows);
}

/**
 * What a board or list shows of the custom fields: of the ids the person chose, the ones that still
 * exist and apply in these projects, and the answers of the given issues to them. Asks for nothing
 * when nothing is chosen. An id the person no longer has (a deleted or archived field, a project they
 * can no longer see) is simply not there. The caller has already let this person see the issues.
 */
export async function getCardCustomFields(
  workspaceId: string,
  projectIds: string[],
  shownIds: string[],
  issueIds: string[],
): Promise<CardCustomFields> {
  if (shownIds.length === 0) return NO_CARD_FIELDS;

  const chosen = new Set(shownIds);
  const fields = (await getFieldsOfProjects(workspaceId, projectIds)).filter(
    (field) => chosen.has(field.id),
  );
  if (fields.length === 0 || issueIds.length === 0) return NO_CARD_FIELDS;

  const rows = await db.customFieldValue.findMany({
    where: {
      issueId: { in: issueIds },
      fieldId: { in: fields.map((field) => field.id) },
    },
  });
  const typeOf = new Map(fields.map((field) => [field.id, field.type]));
  const values: CardCustomFields["values"] = {};
  for (const row of rows) {
    const type = typeOf.get(row.fieldId);
    if (!type) continue;
    const value = fromColumns(type, row);
    if (value === null) continue;
    const answers = values[row.issueId] ?? {};
    answers[row.fieldId] = value;
    values[row.issueId] = answers;
  }
  return { fields, values };
}
