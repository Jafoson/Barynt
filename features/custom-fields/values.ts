import "server-only";
import { recordIssueAudit } from "@/features/issues/audit";
import type { FieldValue, SelectConfig } from "@/lib/custom-fields/types";
import { fromColumns, sameValue, toColumns } from "@/lib/custom-fields/value";
import { db } from "@/lib/db";
import { Prisma } from "@/lib/generated/prisma/client";
import { fullName } from "@/lib/utils/string";
import { FIELD_SELECT, rowOf } from "./queries";
import type { CustomFieldRow, FieldValueResult } from "./types";

// Answering a custom field on an issue: the one place that checks the answer, writes it and logs
// it. The web app's action (`valueActions.ts`) and, later, the REST API and the MCP tools call it
// after **they** have decided who may edit the issue, so each surface asks its own way and the
// answer is treated the same everywhere.

const NOT_APPLICABLE = "This field does not apply to this issue.";

/** What the issue is: enough to route the audit entry and to know which fields apply. */
export interface FieldWriteIssue {
  id: string;
  key: number;
  projectId: string;
  title: string;
  project: { workspaceId: string; prefix: string };
}

const isForeignKeyViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2003";

/** An answer as the log reads it: a choice by its label, a person by their name, nothing as a dash. */
async function displayOf(
  field: CustomFieldRow,
  value: FieldValue | null,
): Promise<string> {
  if (value === null) return "—";
  if (field.type === "select") {
    const option = (field.config as SelectConfig).options.find(
      (candidate) => candidate.id === value,
    );
    return option?.label ?? String(value);
  }
  if (field.type === "user") {
    const user = await db.user.findUnique({
      where: { id: String(value) },
      select: { firstName: true, lastName: true },
    });
    return user ? fullName(user) : String(value);
  }
  return String(value);
}

/**
 * Sets an issue's answer to one field, or clears it (`null`, an empty text). Says why it could not:
 * a field that is not this issue's (another workspace's, another project's, archived, gone), an
 * answer that does not fit the type, or a person who is not a member of the workspace. Writing the
 * answer it already has changes nothing and logs nothing.
 */
export async function writeFieldValue(input: {
  issue: FieldWriteIssue;
  fieldId: string;
  value: unknown;
  actorId: string;
}): Promise<FieldValueResult> {
  const { issue, fieldId, actorId } = input;
  const workspaceId = issue.project.workspaceId;

  const found = await db.customFieldDefinition.findUnique({
    where: { id: String(fieldId) },
    select: FIELD_SELECT,
  });
  const field = found ? rowOf(found) : null;
  if (
    !field ||
    field.workspaceId !== workspaceId ||
    field.archived ||
    (field.projectId !== null && field.projectId !== issue.projectId)
  ) {
    return { error: NOT_APPLICABLE };
  }

  const checked = toColumns(field, input.value);
  if (!checked.ok) {
    return { error: `${field.name} ${checked.message}.` };
  }

  if (checked.columns?.userId) {
    const member = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: { workspaceId, userId: checked.columns.userId },
      },
      select: { userId: true },
    });
    if (!member) {
      return { error: `${field.name} must be a member of this workspace.` };
    }
  }

  const stored = await db.customFieldValue.findUnique({
    where: { issueId_fieldId: { issueId: issue.id, fieldId: field.id } },
  });
  const before = stored ? fromColumns(field.type, stored) : null;
  const after = checked.columns
    ? fromColumns(field.type, checked.columns)
    : null;
  if (sameValue(before, after)) return { ok: true, changed: false };

  try {
    if (checked.columns) {
      await db.customFieldValue.upsert({
        where: { issueId_fieldId: { issueId: issue.id, fieldId: field.id } },
        // All four columns, so a row that changes its answer never keeps the old one beside it.
        create: { issueId: issue.id, fieldId: field.id, ...checked.columns },
        update: checked.columns,
      });
    } else {
      await db.customFieldValue.deleteMany({
        where: { issueId: issue.id, fieldId: field.id },
      });
    }
  } catch (error) {
    // The field or the issue was deleted while this was on its way.
    if (isForeignKeyViolation(error)) return { error: NOT_APPLICABLE };
    throw error;
  }

  const [fromText, toText] = await Promise.all([
    displayOf(field, before),
    displayOf(field, after),
  ]);
  await recordIssueAudit(
    "issue.customField.changed",
    issue.id,
    issue,
    actorId,
    `${field.name}: ${fromText} → ${toText}`,
    { fieldId: field.id, key: field.key, from: before, to: after },
  );

  return { ok: true, changed: true };
}
