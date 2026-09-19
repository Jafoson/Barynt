import { getIssueComposerData } from "@/features/issues/editor-data";
import { getCurrentWorkspaceId } from "@/lib/current-workspace";
import { getAccess } from "@/lib/permissions";
import { NewIssueFabClient } from "./NewIssueFabClient";

/**
 * The floating plus for a phone — server half: loads what the composer needs
 * (same as the sidebar's button, `QuickActions`) and whether this person may
 * create projects. What's on offer is decided from both; with neither, there
 * is no button.
 */
export async function NewIssueFab() {
  const data = await getIssueComposerData();
  const workspaceId = data?.workspaceId ?? getCurrentWorkspaceId() ?? null;
  const canCreateProject = workspaceId
    ? (await getAccess({ workspaceId })).has("project.create")
    : false;
  if (!data && !canCreateProject) return null;
  return (
    <NewIssueFabClient
      data={data}
      workspaceId={workspaceId}
      canCreateProject={canCreateProject}
    />
  );
}
