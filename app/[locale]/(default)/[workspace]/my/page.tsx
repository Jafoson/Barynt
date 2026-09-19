import { notFound, redirect } from "next/navigation";
import { Board } from "@/features/issues/components/Board/Board";
import { BoardUnlessPhone } from "@/features/issues/components/Board/BoardUnlessPhone";
import { IssuePeek } from "@/features/issues/components/IssuePeek/IssuePeek";
import { Topbar } from "@/features/issues/components/Topbar/Topbar";
import { getIssueComposerData } from "@/features/issues/editor-data";
import { groupKeyFromParam } from "@/features/issues/group";
import {
  getMyIssues,
  getMyIssuesViewPreference,
} from "@/features/issues/queries";
import { sortKeyFromParam } from "@/features/issues/sort";
import { getWorkspaceStatuses } from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Your own issues as a board — the same view as in a project, just across
 * all projects you're responsible for. No new issue gets created here: the
 * project it would belong to is missing (see `Board`).
 */
export default async function MyPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; workspace: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const { locale, workspace } = await params;
  const filters = await searchParams;
  setCurrentWorkspaceId(workspace);

  const session = await getSession();
  if (!session) redirect(`/${locale}/login`);

  const [issues, statuses, composer, hiddenCardFields] = await Promise.all([
    getMyIssues(session.userId, workspace, filters),
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
          sortKey={sortKeyFromParam(filters.sort)}
          groupKey={groupKeyFromParam(filters.group)}
        />
      </BoardUnlessPhone>
      {/* Opens the clicked issue as a side panel (`?issue=` in the URL). */}
      <IssuePeek data={composer} />
    </>
  );
}
