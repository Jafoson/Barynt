import "server-only";
import { db } from "@/lib/db";
import { canEnterWorkspace } from "@/lib/permissions";

/**
 * The fixed choices an issue field takes, as a workspace has them enabled
 * (`WorkspacePriority`, `WorkspaceIssueType`) — what a caller needs to know
 * before writing `priority`/`type`. Same shape of answer as
 * `listStatusesForUser` (`features/api-v1/views.ts`): sorted by `position`,
 * `null` when the caller isn't a member.
 */

export interface ApiPriority {
  /** What `priority` takes when writing an issue. */
  id: number;
  key: string;
  name: string;
  color: string;
  position: number;
}

export interface ApiIssueTypeOption {
  /** What `type` takes when writing an issue. */
  id: string;
  name: string;
  color: string;
  position: number;
}

export async function listPrioritiesForUser(
  userId: string,
  workspaceId: string,
): Promise<ApiPriority[] | null> {
  if (!(await canEnterWorkspace(userId, workspaceId))) return null;
  const rows = await db.workspacePriority.findMany({
    where: { workspaceId },
    select: {
      priority: {
        select: {
          id: true,
          key: true,
          name: true,
          color: true,
          position: true,
        },
      },
    },
  });
  return rows.map((r) => r.priority).sort((a, b) => a.position - b.position);
}

export async function listIssueTypesForUser(
  userId: string,
  workspaceId: string,
): Promise<ApiIssueTypeOption[] | null> {
  if (!(await canEnterWorkspace(userId, workspaceId))) return null;
  const rows = await db.workspaceIssueType.findMany({
    where: { workspaceId },
    select: {
      issueType: {
        select: { id: true, name: true, color: true, position: true },
      },
    },
  });
  return rows.map((r) => r.issueType).sort((a, b) => a.position - b.position);
}
