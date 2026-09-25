"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { PermissionError, requirePermissionOr } from "@/lib/permissions";
import { recordProjectChange } from "@/lib/realtime/store";
import type { FieldValueResult } from "./types";
import { writeFieldValue } from "./values";

// Answering a custom field on an issue, from the web app. Filling a field in is editing the issue,
// so it takes what editing the issue takes (`issue.update.any`, or `.own` for the reporter and the
// assignee), nothing of `customfield.manage`, which is for defining fields. Like the label actions
// it reports the reason instead of throwing: the editor beside the value shows it.

const NOT_ALLOWED = "You are not allowed to edit this issue.";

/**
 * Sets the issue's answer to one field, or clears it (`null`). What the client sends is data:
 * `writeFieldValue` checks it against the field and says what is wrong.
 */
export async function setCustomFieldValue(
  issueId: string,
  fieldId: string,
  value: unknown,
): Promise<FieldValueResult> {
  const issue = await db.issue.findUnique({
    where: { id: String(issueId) },
    select: {
      id: true,
      key: true,
      projectId: true,
      title: true,
      reporterId: true,
      assigneeId: true,
      project: { select: { workspaceId: true, prefix: true } },
    },
  });
  if (!issue) return { error: NOT_ALLOWED };

  const ctx = { projectId: issue.projectId };
  let actorId: string;
  try {
    actorId = await requirePermissionOr([
      { permission: "issue.update.any", ctx },
      {
        permission: "issue.update.own",
        ctx,
        ownerIds: [issue.reporterId, issue.assigneeId],
      },
    ]);
  } catch (error) {
    if (error instanceof PermissionError) return { error: NOT_ALLOWED };
    throw error;
  }

  const result = await writeFieldValue({ issue, fieldId, value, actorId });
  if ("ok" in result && result.changed) {
    revalidatePath("/", "layout");
    recordProjectChange(issue.project.workspaceId, actorId);
  }
  return result;
}
