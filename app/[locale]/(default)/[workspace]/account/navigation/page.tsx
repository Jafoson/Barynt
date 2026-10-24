import { AccountNavigation } from "@/features/account/components/AccountNavigation/AccountNavigation";
import { getMyPreferences } from "@/features/account/queries";
import { getStartViewChoices } from "@/features/views/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";

export const dynamic = "force-dynamic";

/** Where clicks lead, where you start, how issues open. */
export default async function AccountNavigationPage({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  setCurrentWorkspaceId(workspace);

  const [preferences, viewChoices] = await Promise.all([
    getMyPreferences(),
    getStartViewChoices(workspace),
  ]);

  return (
    <AccountNavigation
      values={{
        projectLanding: preferences.projectLanding,
        startPage: preferences.startPage,
        startViewId: preferences.startViewId,
        issueOpenMode: preferences.issueOpenMode,
        issuePageOpenMode: preferences.issuePageOpenMode,
        defaultGrouping: preferences.defaultGrouping,
        defaultSort: preferences.defaultSort,
        defaultShowSubIssues: preferences.defaultShowSubIssues,
        sidebarCollapsed: preferences.sidebarCollapsed,
        projectOrder: preferences.projectOrder,
      }}
      viewChoices={viewChoices}
    />
  );
}
