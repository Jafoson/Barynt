import { notFound, redirect } from "next/navigation";
import { getMyPreferences } from "@/features/account/queries";
import { IssuePeek } from "@/features/issues/components/IssuePeek/IssuePeek";
import { ListView } from "@/features/issues/components/ListView/ListView";
import { Topbar } from "@/features/issues/components/Topbar/Topbar";
import { getIssueComposerData } from "@/features/issues/editor-data";
import { groupKeyFromParam } from "@/features/issues/group";
import {
  getMyIssuesViewGroups,
  getMyIssuesViewPreference,
  getWorkspaceIssues,
} from "@/features/issues/queries";
import { sortKeyFromParam } from "@/features/issues/sort";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/** The workspace's issues as a list (V8) — with a column for the project. */
export default async function WorkspaceListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; workspace: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { locale, workspace } = await params;
  const filters = await searchParams;
  setCurrentWorkspaceId(workspace);
  // The grouping and order a view opens with when the address names none.
  const defaults = await getMyPreferences();

  const session = await getSession();
  if (!session) redirect(`/${locale}/login`);

  const [issues, composer, hiddenCardFields, groups] = await Promise.all([
    getWorkspaceIssues(session.userId, workspace, filters),
    getIssueComposerData(),
    getMyIssuesViewPreference("list"),
    getMyIssuesViewGroups("list"),
  ]);
  if (!composer) notFound();

  return (
    <>
      <Topbar count={issues.length} view="list" />
      <ListView
        issues={issues}
        composer={composer}
        hiddenCardFields={hiddenCardFields}
        hiddenGroups={groups.hiddenGroups}
        hideEmptyGroups={groups.hideEmptyGroups}
        groupOrder={groups.groupOrder}
        sortKey={sortKeyFromParam(filters.sort ?? defaults.defaultSort)}
        groupKey={groupKeyFromParam(filters.group ?? defaults.defaultGrouping)}
      />
      {/* Opens the clicked issue as a side panel (`?issue=` in the URL). */}
      <IssuePeek data={composer} />
    </>
  );
}
