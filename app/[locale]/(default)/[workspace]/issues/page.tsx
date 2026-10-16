import { notFound, redirect } from "next/navigation";
import { getMyPreferences } from "@/features/account/queries";
import { setMyIssuesViewGroups } from "@/features/issues/actions";
import { Board } from "@/features/issues/components/Board/Board";
import { BoardUnlessPhone } from "@/features/issues/components/Board/BoardUnlessPhone";
import { IssuePeek } from "@/features/issues/components/IssuePeek/IssuePeek";
import { Topbar } from "@/features/issues/components/Topbar/Topbar";
import { getIssueComposerData } from "@/features/issues/editor-data";
import { groupKeyFromParam } from "@/features/issues/group";
import {
  getMyIssuesViewGroups,
  getMyIssuesViewPreference,
  getWorkspaceIssues,
} from "@/features/issues/queries";
import { sortKeyFromParam } from "@/features/issues/sort";
import { getWorkspaceStatuses } from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * The workspace's board (V8): the issues of every project you see — the
 * same board as in a project, just across projects. No new issue gets
 * created here: the project it would belong to is missing (see `Board`).
 * Its display settings are still the former "my issues" ones.
 */
export default async function WorkspaceBoardPage({
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

  const groups = await getMyIssuesViewGroups("board");
  const [issues, statuses, composer, hiddenCardFields] = await Promise.all([
    getWorkspaceIssues(session.userId, workspace, filters, {
      subIssues: groups.showSubIssues,
    }),
    getWorkspaceStatuses(),
    getIssueComposerData(),
    getMyIssuesViewPreference("board"),
  ]);
  if (!composer) notFound();

  return (
    <>
      <Topbar count={issues.length} view="board" />
      <BoardUnlessPhone>
        <Board
          issues={issues}
          statuses={statuses}
          composer={composer}
          hiddenCardFields={hiddenCardFields}
          hiddenGroups={groups.hiddenGroups}
          hideEmptyGroups={groups.hideEmptyGroups}
          groupOrder={groups.groupOrder}
          onGroupsChange={setMyIssuesViewGroups.bind(null, "board")}
          sortKey={sortKeyFromParam(filters.sort ?? defaults.defaultSort)}
          groupKey={groupKeyFromParam(
            filters.group ?? defaults.defaultGrouping,
          )}
        />
      </BoardUnlessPhone>
      {/* Opens the clicked issue as a side panel (`?issue=` in the URL). */}
      <IssuePeek data={composer} />
    </>
  );
}
