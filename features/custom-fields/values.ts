import "server-only";
import { recordIssueAudit } from "@/features/issues/audit";
import {
  type FieldValue,
  MAX_CUSTOM_FIELDS_PER_WORKSPACE,
  type SelectConfig,
  type ValueColumns,
} from "@/lib/custom-fields/types";
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

/** Where an answer is given: the issue's workspace and project, which decide which fields apply. */
export interface AnswerPlace {
  workspaceId: string;
  projectId: string;
}

type Resolved =
  | { ok: true; field: CustomFieldRow; columns: ValueColumns | null }
  | { ok: false; notApplicable: true }
  | { ok: false; notApplicable?: false; error: string };

/**
 * One answer to one field, checked and turned into columns without touching the issue: the field
 * has to be this place's (its workspace's, workspace-wide or its own project's, not archived), the
 * answer has to fit the type, and a person has to be a member of the workspace. `null` columns
 * mean "no answer".
 */
async function resolveAnswer(
  place: AnswerPlace,
  fieldId: unknown,
  value: unknown,
): Promise<Resolved> {
  const found = await db.customFieldDefinition.findUnique({
    where: { id: String(fieldId) },
    select: FIELD_SELECT,
  });
  const field = found ? rowOf(found) : null;
  if (
    !field ||
    field.workspaceId !== place.workspaceId ||
    field.archived ||
    (field.projectId !== null && field.projectId !== place.projectId)
  ) {
    return { ok: false, notApplicable: true };
  }

  const checked = toColumns(field, value);
  if (!checked.ok) {
    return { ok: false, error: `${field.name} ${checked.message}.` };
  }

  if (checked.columns?.userId) {
    const member = await db.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: place.workspaceId,
          userId: checked.columns.userId,
        },
      },
      select: { userId: true },
    });
    if (!member) {
      return {
        ok: false,
        error: `${field.name} must be a member of this workspace.`,
      };
    }
  }

  return { ok: true, field, columns: checked.columns };
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
  const { issue, actorId } = input;

  const resolved = await resolveAnswer(
    { workspaceId: issue.project.workspaceId, projectId: issue.projectId },
    input.fieldId,
    input.value,
  );
  if (!resolved.ok) {
    return { error: "error" in resolved ? resolved.error : NOT_APPLICABLE };
  }
  const { field, columns } = resolved;

  const stored = await db.customFieldValue.findUnique({
    where: { issueId_fieldId: { issueId: issue.id, fieldId: field.id } },
  });
  const before = stored ? fromColumns(field.type, stored) : null;
  const after = columns ? fromColumns(field.type, columns) : null;
  if (sameValue(before, after)) return { ok: true, changed: false };

  try {
    if (columns) {
      await db.customFieldValue.upsert({
        where: { issueId_fieldId: { issueId: issue.id, fieldId: field.id } },
        // All four columns, so a row that changes its answer never keeps the old one beside it.
        create: { issueId: issue.id, fieldId: field.id, ...columns },
        update: columns,
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

/** The answers a new issue is created with, each checked and turned into columns. */
export type ResolvedAnswers =
  | { ok: true; rows: { fieldId: string; columns: ValueColumns }[] }
  | { ok: false; error: string };

/**
 * The answers given while an issue is created, checked **before** anything is written, so a value
 * that does not fit refuses the whole creation instead of leaving an issue behind without it. A field
 * that no longer applies (archived while the window was open, another project's after a switch) is
 * left out, not an error: there is nothing to lose. An empty answer is no answer. `answers` is data
 * from a client: anything that is not a plain object of fields is no answers at all.
 */
export async function resolveNewAnswers(
  place: AnswerPlace,
  answers: unknown,
): Promise<ResolvedAnswers> {
  if (
    typeof answers !== "object" ||
    answers === null ||
    Array.isArray(answers)
  ) {
    return { ok: true, rows: [] };
  }
  const entries = Object.entries(answers);
  if (entries.length > MAX_CUSTOM_FIELDS_PER_WORKSPACE) {
    return { ok: false, error: "Too many custom fields." };
  }

  const rows: { fieldId: string; columns: ValueColumns }[] = [];
  for (const [fieldId, value] of entries) {
    const resolved = await resolveAnswer(place, fieldId, value);
    if (!resolved.ok) {
      if ("error" in resolved) return { ok: false, error: resolved.error };
      continue;
    }
    if (resolved.columns) rows.push({ fieldId, columns: resolved.columns });
  }
  return { ok: true, rows };
}
