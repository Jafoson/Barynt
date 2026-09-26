import { notFound } from "next/navigation";
import { IssuePeek } from "@/features/issues/components/IssuePeek/IssuePeek";
import { ListView } from "@/features/issues/components/ListView/ListView";
import { Topbar } from "@/features/issues/components/Topbar/Topbar";
import { getIssueComposerData } from "@/features/issues/editor-data";
import { groupKeyFromParam } from "@/features/issues/group";
import {
  getIssuesByProject,
  getIssueViewGroups,
  getIssueViewPreference,
} from "@/features/issues/queries";
import { sortKeyFromParam } from "@/features/issues/sort";
import { getViewCustomFields } from "@/features/issues/viewCustomFields";
import { getWorkspaceProjects } from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ workspace: string; projectSlug: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { workspace, projectSlug } = await params;
  const filters = await searchParams;
  setCurrentWorkspaceId(workspace);

  const projects = await getWorkspaceProjects();
  const project = projects.find((p) => p.slug === projectSlug);
  if (!project) notFound();

  const [issues, composer, hiddenCardFields, groups] = await Promise.all([
    getIssuesByProject(project.id, filters),
    getIssueComposerData(),
    getIssueViewPreference(project.id, "list"),
    getIssueViewGroups(project.id, "list"),
  ]);
  if (!composer) notFound();

  // What this person shows of the custom fields on the cards and rows, and the answers to it.
  const customFields = await getViewCustomFields(
    "list",
    issues.map((issue) => issue.id),
    project.id,
  );

  return (
    <>
      <Topbar count={issues.length} view="list" projectId={project.id} />
      <ListView
        issues={issues}
        projectId={project.id}
        composer={composer}
        hiddenCardFields={hiddenCardFields}
        customFields={customFields}
        hiddenGroups={groups.hiddenGroups}
        hideEmptyGroups={groups.hideEmptyGroups}
        sortKey={sortKeyFromParam(filters.sort)}
        groupKey={groupKeyFromParam(filters.group)}
      />
      {/* Opens the clicked issue as a side panel (`?issue=` in the URL). */}
      <IssuePeek data={composer} />
    </>
  );
}
