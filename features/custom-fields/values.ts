import "server-only";
import { recordIssueAudit } from "@/features/issues/audit";
import { recordAudit } from "@/lib/audit";
import {
  type CustomFieldType,
  FIELD_LIMITS,
  type FieldOption,
  type FieldValue,
  type NumberMode,
  narrowFieldValue,
  toOptions,
  usesOptions,
  validateFieldValue,
} from "@/lib/custom-fields";
import { db } from "@/lib/db";
import type { Prisma } from "@/lib/generated/prisma/client";
import { uid } from "@/lib/utils/id";

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

function auditText(
  value: FieldValue | null,
  names: Map<string, string>,
  instant = false,
) {
  if (value === null) return "—";
  // An instant is stored in UTC and the log has no viewer's zone: say UTC.
  const text =
    instant && typeof value === "string"
      ? `${value.slice(0, 10)} ${value.slice(11, 16)} UTC`
      : Array.isArray(value)
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
  dateMode?: string;
  numberMode?: string;
  numberDecimals?: number | null;
}

/** What a client sends to add a choice while filling a field in. */
function isCreate(value: unknown): value is { create: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as { create?: unknown }).create === "string"
  );
}

/**
 * Checks a batch of values for an issue of this workspace and project and
 * returns what would be stored, without writing anything:
 *
 * - the field must exist, be active, belong to the workspace and be either
 *   workspace-wide or of this project — a field id from another project or
 *   tenant is "unknown", never "forbidden", so the answer doesn't reveal
 *   that it exists;
 * - the value must fit the field's type and, for a date, its mode
 *   (`validateFieldValue`);
 * - a person must be a member of the workspace;
 * - a choice may be given as `{ create: "Label" }`. That reuses a choice with
 *   the same label, or — only when the field allows it — adds one. The new
 *   choices come back in `newOptions` and are stored by
 *   `writeIssueFieldValues`, together with the value.
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
  newOptions: Map<string, FieldOption[]>;
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
  const byId = new Map(fields.map((f) => [f.id, f]));

  const newOptions = new Map<string, FieldOption[]>();
  const next = new Map<string, FieldValue | null>();

  for (const id of ids) {
    const field = byId.get(id);
    if (!field) throw new FieldValueError(id, "unknown_field");

    let raw = values[id];
    const known = toOptions(field.options);
    const added: FieldOption[] = [];

    // Turn `{ create }` entries into option ids first.
    const toId = (item: unknown): unknown => {
      if (!isCreate(item)) return item;
      const label = item.create.trim();
      if (label === "" || label.length > FIELD_LIMITS.optionLabel) {
        throw new FieldValueError(id, "invalid_value");
      }
      const wanted = label.toLowerCase();
      const existing = [...known, ...added].find(
        (o) => o.label.toLowerCase() === wanted,
      );
      if (existing) return existing.id;
      if (
        !field.allowCustomOptions ||
        !usesOptions(field.type) ||
        known.length + added.length >= FIELD_LIMITS.options
      ) {
        throw new FieldValueError(id, "invalid_value");
      }
      const option: FieldOption = { id: uid("o_"), label, color: null };
      added.push(option);
      return option.id;
    };
    if (field.type === "SELECT") raw = toId(raw);
    else if (field.type === "MULTI_SELECT" && Array.isArray(raw)) {
      raw = raw.map(toId);
    }

    const result = validateFieldValue(
      {
        type: field.type as CustomFieldType,
        options: [...known, ...added],
        dateMode: field.dateMode,
        numberMode: field.numberMode as NumberMode | undefined,
        numberDecimals: field.numberDecimals,
      },
      raw,
    );
    if (!result.ok) throw new FieldValueError(id, "invalid_value");
    next.set(id, result.value);
    if (added.length > 0) newOptions.set(id, added);
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
  return { fields: byId, next, newOptions };
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

  const {
    fields: byId,
    next,
    newOptions,
  } = await resolveFieldValues(
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

  // A choice added while filling in becomes a choice of the field, stored in
  // the same transaction as the value that uses it.
  const optionWrites = [...newOptions.entries()].map(([fieldId, added]) => {
    const field = byId.get(fieldId);
    const all = [...toOptions(field?.options), ...added].map((o) => ({
      id: o.id,
      label: o.label,
      color: o.color,
    }));
    return db.customField.update({
      where: { id: fieldId },
      data: { options: all },
    });
  });

  await db.$transaction([
    ...optionWrites,
    ...changed.map(([fieldId, value]) =>
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
  ]);

  for (const [fieldId, added] of newOptions) {
    const field = byId.get(fieldId);
    if (!field) continue;
    await recordAudit({
      action: "customfield.updated",
      actorId,
      target: {
        type: "customField",
        id: fieldId,
        label: `${field.name}: + ${added.map((o) => o.label).join(", ")}`,
      },
      workspaceId: issue.project.workspaceId,
      projectId: issue.projectId,
    });
  }

  for (const [fieldId, value] of changed) {
    const field = byId.get(fieldId);
    if (!field) continue;
    // A choice shows by its label, not its internal id.
    const labels = new Map(
      [...toOptions(field.options), ...(newOptions.get(fieldId) ?? [])].map(
        (o) => [o.id, o.label] as [string, string],
      ),
    );
    const instant =
      field.type === "DATE" &&
      (field as { dateMode?: string }).dateMode === "DATETIME";
    const from = beforeBy.get(fieldId) ?? null;
    await recordIssueAudit(
      "issue.field.changed",
      issue.id,
      issue,
      actorId,
      `${field.name}: ${auditText(from, labels, instant)} → ${auditText(value, labels, instant)}`,
      { fieldId, field: field.name, from, to: value },
    );
  }
}
