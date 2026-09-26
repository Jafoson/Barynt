import type { FieldValue } from "@/lib/custom-fields/types";
import type { CustomFieldRow } from "./types";

// The answers a new issue is being made with, while the composer is open. Pure: the composer keeps
// them in a plain object by field id, and these are the three things it does to it.

export type ComposerAnswers = Record<string, FieldValue>;

/** The fields that apply to a project: the workspace-wide ones and its own, in their order. */
export function fieldsForProject(
  fields: readonly CustomFieldRow[],
  projectId: string,
): CustomFieldRow[] {
  return fields.filter(
    (field) => field.projectId === null || field.projectId === projectId,
  );
}

/** The answers with one changed; `null` clears it (a field with no answer has no entry). */
export function withAnswer(
  answers: ComposerAnswers,
  fieldId: string,
  value: FieldValue | null,
): ComposerAnswers {
  const { [fieldId]: _dropped, ...rest } = answers;
  return value === null ? rest : { ...rest, [fieldId]: value };
}

/**
 * What is left of the answers after the project changed: those of fields that still apply there. A
 * project's own field does not come along to another project, and an answer for a field the composer
 * does not know is dropped.
 */
export function answersForProject(
  answers: ComposerAnswers,
  fields: readonly CustomFieldRow[],
  projectId: string,
): ComposerAnswers {
  const applies = new Set(fieldsForProject(fields, projectId).map((f) => f.id));
  return Object.fromEntries(
    Object.entries(answers).filter(([fieldId]) => applies.has(fieldId)),
  );
}
