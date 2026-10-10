import "server-only";
import { recordIssueAudit } from "@/features/issues/audit";
import {
  type CustomFieldType,
  type FieldValue,
  narrowFieldValue,
  validateFieldValue,
} from "@/lib/custom-fields";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";

/** What `writeIssueFieldValues` needs to know about the issue. */
export interface FieldWriteIssue {
  id: string;
  key: number;
  projectId: string;
  project: { workspaceId: string; prefix: string };
}

/** A value was rejected: unknown or foreign field, or a value that doesn't fit. */
export class FieldValueError extends Error {
  constructor(
    readonly fieldId: string,
    readonly reason: "unknown_field" | "invalid_value",
  ) {
    super(`custom field ${fieldId}: ${reason}`);
  }
}

const MAX_AUDIT_VALUE = 100;

function auditText(value: FieldValue | null, names: Map<string, string>) {
  if (value === null) return "—";
  const text = Array.isArray(value)
    ? value.map((v) => names.get(v) ?? v).join(", ")
    : typeof value === "string"
      ? (names.get(value) ?? value)
      : typeof value === "boolean"
        ? value
          ? "✓"
          : "✗"
        : String(value);
  return text.length > MAX_AUDIT_VALUE
    ? `${text.slice(0, MAX_AUDIT_VALUE)}…`
    : text;
}

interface ResolvedField {
  id: string;
  name: string;
  type: string;
  options: unknown;
}

/**
 * Checks a batch of values for an issue of this workspace and project and
 * returns what would be stored, without writing anything:
 *
 * - the field must exist, be active, belong to the workspace and be either
 *   workspace-wide or of this project — a field id from another project or
 *   tenant is "unknown", never "forbidden", so the answer doesn't reveal
 *   that it exists;
 * - the value must fit the field's type (`validateFieldValue`);
 * - a person must be a member of the workspace.
 *
 * Throws `FieldValueError`. `createIssue` calls this before it claims an
 * issue key, so a bad value doesn't leave a half-created issue behind.
 */
export async function resolveFieldValues(
  scope: { workspaceId: string; projectId: string },
  values: Record<string, unknown>,
): Promise<{
  fields: Map<string, ResolvedField>;
  next: Map<string, FieldValue | null>;
}> {
  const ids = Object.keys(values);
  const fields = await db.customField.findMany({
    where: {
      id: { in: ids },
      workspaceId: scope.workspaceId,
      archivedAt: null,
      OR: [{ projectId: null }, { projectId: scope.projectId }],
    },
  });
  const byId = new Map<string, ResolvedField>(fields.map((f) => [f.id, f]));

  const next = new Map<string, FieldValue | null>();
  for (const id of ids) {
    const field = byId.get(id);
    if (!field) throw new FieldValueError(id, "unknown_field");
    const result = validateFieldValue(
      { type: field.type as CustomFieldType, options: field.options },
      values[id],
    );
    if (!result.ok) throw new FieldValueError(id, "invalid_value");
    next.set(id, result.value);
  }

  const people = [...next.entries()].flatMap(([id, v]) =>
    byId.get(id)?.type === "USER" && typeof v === "string" ? [v] : [],
  );
  if (people.length > 0) {
    const members = await db.workspaceMember.findMany({
      where: { workspaceId: scope.workspaceId, userId: { in: people } },
      select: { userId: true },
    });
    const known = new Set(members.map((m) => m.userId));
    for (const [id, v] of next) {
      if (
        byId.get(id)?.type === "USER" &&
        typeof v === "string" &&
        !known.has(v)
      )
        throw new FieldValueError(id, "invalid_value");
    }
  }
  return { fields: byId, next };
}

/**
 * Sets, changes or clears custom field values on one issue.
 *
 * The caller has already decided that this person may edit the issue
 * (`updateIssue` checks `issue.update.any`/`.own`); `resolveFieldValues`
 * decides whether each *value* is acceptable. Everything is checked before
 * anything is written, so a batch with one bad value changes nothing.
 * Unchanged values are neither written nor logged.
 */
export async function writeIssueFieldValues(
  issue: FieldWriteIssue,
  values: Record<string, unknown>,
  actorId: string,
): Promise<void> {
  const ids = Object.keys(values);
  if (ids.length === 0) return;

  const { fields: byId, next } = await resolveFieldValues(
    { workspaceId: issue.project.workspaceId, projectId: issue.projectId },
    values,
  );

  const before = await db.issueFieldValue.findMany({
    where: { issueId: issue.id, fieldId: { in: ids } },
    select: { fieldId: true, value: true },
  });
  const beforeBy = new Map(
    before.map((r) => [r.fieldId, narrowFieldValue(r.value)]),
  );

  const changed = [...next.entries()].filter(
    ([id, value]) =>
      JSON.stringify(beforeBy.get(id) ?? null) !== JSON.stringify(value),
  );
  if (changed.length === 0) return;

  await db.$transaction(
    changed.map(([fieldId, value]) =>
      value === null
        ? db.issueFieldValue.deleteMany({
            where: { issueId: issue.id, fieldId },
          })
        : db.issueFieldValue.upsert({
            where: { issueId_fieldId: { issueId: issue.id, fieldId } },
            create: {
              issueId: issue.id,
              fieldId,
              value: value as Prisma.InputJsonValue,
            },
            update: { value: value as Prisma.InputJsonValue },
          }),
    ),
  );

  for (const [fieldId, value] of changed) {
    const field = byId.get(fieldId);
    if (!field) continue;
    // A choice shows by its label, not its internal id.
    const labels = new Map(
      (Array.isArray(field.options) ? field.options : []).flatMap((o) =>
        o && typeof o === "object" && "id" in o && "label" in o
          ? [[String(o.id), String(o.label)] as [string, string]]
          : [],
      ),
    );
    const from = beforeBy.get(fieldId) ?? null;
    await recordIssueAudit(
      "issue.field.changed",
      issue.id,
      issue,
      actorId,
      `${field.name}: ${auditText(from, labels)} → ${auditText(value, labels)}`,
      { fieldId, field: field.name, from, to: value },
    );
  }
}
