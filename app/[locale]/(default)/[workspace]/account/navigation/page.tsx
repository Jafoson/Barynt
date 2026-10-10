import { AccountNavigation } from "@/features/account/components/AccountNavigation/AccountNavigation";
import { getMyPreferences } from "@/features/account/queries";
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

  const preferences = await getMyPreferences();

  return (
    <AccountNavigation
      values={{
        projectLanding: preferences.projectLanding,
        startPage: preferences.startPage,
        issueOpenMode: preferences.issueOpenMode,
        issuePageOpenMode: preferences.issuePageOpenMode,
        defaultGrouping: preferences.defaultGrouping,
        defaultSort: preferences.defaultSort,
        defaultShowSubIssues: preferences.defaultShowSubIssues,
        sidebarCollapsed: preferences.sidebarCollapsed,
        projectOrder: preferences.projectOrder,
      }}
    />
  );
}
