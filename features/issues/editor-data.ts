import "server-only";
import { cache } from "react";
import { getFieldsForNewIssues } from "@/features/custom-fields/queries";
import type {
  IssueComposerData,
  IssueEditorData,
} from "@/features/issues/types";
import {
  getCurrentWorkspace,
  getMe,
  getWorkspaceIssueTypes,
  getWorkspaceLabels,
  getWorkspaceMembers,
  getWorkspacePriorities,
  getWorkspaceProjects,
  getWorkspaceSearchIssues,
  getWorkspaceStatuses,
} from "@/features/workspaces/queries";
import { hasPermission } from "@/lib/permissions";

// A separate file instead of `queries.ts`: `features/workspaces/queries`
// imports from there, so a call in the other direction would be a cycle.
//
// Both wrapped in `cache()` — the board page and the sidebar fetch the same
// bundle within the same request and share the queries.

/** Workspace data for an issue editing UI (e.g. `IssueDetail`). */
export const getIssueEditorData = cache(
  async (): Promise<IssueEditorData | null> => {
    const [
      workspace,
      me,
      projects,
      members,
      labels,
      statuses,
      priorities,
      searchIssues,
    ] = await Promise.all([
      getCurrentWorkspace(),
      getMe(),
      getWorkspaceProjects(),
      getWorkspaceMembers(),
      getWorkspaceLabels(),
      getWorkspaceStatuses(),
      getWorkspacePriorities(),
      // For the `#` trigger. The command palette uses the same query, and
      // both share it via `cache()` within the same request.
      getWorkspaceSearchIssues(),
    ]);

    if (!workspace || !me) return null;
    return {
      workspaceId: workspace.id,
      me,
      projects,
      members,
      labels,
      statuses,
      priorities,
      searchIssues,
    };
  },
);

/**
 * Like `getIssueEditorData`, plus the issue types for the composer — and
 * the projects the user is even allowed to create an issue in.
 *
 * The permission is resolved **once** here, not in every button: the
 * sidebar button, the board columns, and the list's group headers all need
 * the same answer. One resolution per project, deduplicated via the
 * `cache()` layers in `lib/permissions.ts` — a workspace's projects are a
 * short list, and `projects` is already filtered down to the visible ones.
 */
export const getIssueComposerData = cache(
  async (): Promise<IssueComposerData | null> => {
    const [editor, issueTypes] = await Promise.all([
      getIssueEditorData(),
      getWorkspaceIssueTypes(),
    ]);
    if (!editor) return null;

    const creatable = await Promise.all(
      editor.projects.map(async (project) => ({
        id: project.id,
        allowed: await hasPermission("issue.create", { projectId: project.id }),
      })),
    );

    const creatableProjectIds = creatable
      .filter((p) => p.allowed)
      .map((p) => p.id);

    return {
      ...editor,
      issueTypes,
      creatableProjectIds,
      // Nothing to answer where nothing can be created.
      customFields:
        creatableProjectIds.length > 0
          ? await getFieldsForNewIssues(editor.workspaceId, creatableProjectIds)
          : [],
    };
  },
);
