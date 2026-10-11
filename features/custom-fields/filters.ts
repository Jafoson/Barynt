import "server-only";
import { narrowFieldValue } from "@/lib/custom-fields";
import {
  dayString,
  fieldKeyOfParam,
  isFilterableField,
  matchesFieldFilter,
} from "@/lib/custom-fields/filter";
import { db } from "@/lib/db";

/**
 * The `where` conditions for the `cf.<fieldKey>=…` parameters of a board or
 * list address, one per field (they are AND'd by the caller).
 *
 * A parameter that names no field of this scope, or one that can't be
 * filtered, is dropped — a stale link shows everything rather than nothing,
 * like every other filter here. The match is made in memory over that
 * field's stored values: JSON values can't be compared in a `where`
 * across all the types, and the rows of one field are few.
 */
export async function customFieldConditions(
  filters: Record<string, unknown>,
  scope: { projectId: string } | { workspaceId: string },
): Promise<Record<string, unknown>[]> {
  const wanted = Object.entries(filters).flatMap(([param, raw]) => {
    const key = fieldKeyOfParam(param);
    // A repeated parameter arrives as a list: only plain text is read.
    const answers =
      typeof raw === "string" ? raw.split(",").filter(Boolean) : [];
    return key && answers.length > 0 ? [{ key, answers }] : [];
  });
  if (wanted.length === 0) return [];

  let workspaceId: string;
  let projectId: string | null = null;
  if ("projectId" in scope) {
    const project = await db.project.findUnique({
      where: { id: scope.projectId },
      select: { workspaceId: true },
    });
    if (!project) return [];
    workspaceId = project.workspaceId;
    projectId = scope.projectId;
  } else {
    workspaceId = scope.workspaceId;
  }

  const fields = await db.customField.findMany({
    where: {
      workspaceId,
      archivedAt: null,
      key: { in: wanted.map((w) => w.key) },
      ...(projectId ? { OR: [{ projectId: null }, { projectId }] } : {}),
    },
    select: { id: true, key: true, type: true, dateMode: true },
  });

  const now = new Date();
  const today = dayString(now);
  const inAWeek = new Date(now);
  inAWeek.setDate(inAWeek.getDate() + 7);
  const weekEnd = dayString(inAWeek);

  const conditions: Record<string, unknown>[] = [];
  for (const { key, answers } of wanted) {
    const field = fields.find((f) => f.key === key);
    if (!field || !isFilterableField(field)) continue;

    const rows = await db.issueFieldValue.findMany({
      where: { fieldId: field.id },
      select: { issueId: true, value: true },
    });
    const hasValue = new Set(rows.map((r) => r.issueId));
    const matching = rows
      .filter((r) =>
        matchesFieldFilter(
          field,
          narrowFieldValue(r.value),
          answers,
          today,
          weekEnd,
        ),
      )
      .map((r) => r.issueId);

    // Issues without a row have no value: they match what "no value" matches.
    const unsetMatches = matchesFieldFilter(
      field,
      null,
      answers,
      today,
      weekEnd,
    );
    conditions.push(
      unsetMatches
        ? { OR: [{ id: { in: matching } }, { id: { notIn: [...hasValue] } }] }
        : { id: { in: matching } },
    );
  }
  return conditions;
}
