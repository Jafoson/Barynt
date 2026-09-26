import "server-only";
import {
  type CardCustomFields,
  NO_CARD_FIELDS,
} from "@/features/custom-fields/cardFields";
import { getCardCustomFields } from "@/features/custom-fields/queries";
import {
  getIssueViewCustomFields,
  getMyIssuesViewCustomFields,
} from "@/features/issues/queries";
import { getWorkspaceProjects } from "@/features/workspaces/queries";
import { getCurrentWorkspaceId } from "@/lib/current-workspace";

/**
 * The custom fields a board or list shows and the answers of its issues to them (BARY-81), as this
 * person configured the view: `projectId` for a project's board or list, none for the cross-project
 * "my issues" (then every project this person can see counts). Reads nothing beyond the preference
 * when nothing is shown, which is the usual case.
 */
export async function getViewCustomFields(
  view: "board" | "list",
  issueIds: string[],
  projectId?: string,
): Promise<CardCustomFields> {
  const workspaceId = getCurrentWorkspaceId();
  if (!workspaceId) return NO_CARD_FIELDS;

  const shown = projectId
    ? await getIssueViewCustomFields(projectId, view)
    : await getMyIssuesViewCustomFields(view);
  if (shown.length === 0) return NO_CARD_FIELDS;

  const projectIds = projectId
    ? [projectId]
    : (await getWorkspaceProjects()).map((project) => project.id);
  return getCardCustomFields(workspaceId, projectIds, shown, issueIds);
}
