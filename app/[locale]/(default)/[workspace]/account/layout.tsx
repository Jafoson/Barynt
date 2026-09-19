import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { enabledOAuthProviders } from "@/auth.config";
import { SettingsHeader } from "@/components/ui/layout/SettingsHeader/SettingsHeader";
import { SettingsBody } from "@/components/ui/layout/SettingsNav/SettingsBody";
import {
  SettingsNav,
  type SettingsNavItem,
} from "@/components/ui/layout/SettingsNav/SettingsNav";
import { getMyProfile } from "@/features/account/queries";
import { getWorkspaceProjects } from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import {
  ACCOUNT_SETTINGS_NAV,
  accountPath,
  PROJECT_SETTINGS_PERMISSIONS,
  settingsScopeItems,
  visibleSettingsScope,
  WORKSPACE_SETTINGS_PERMISSIONS,
} from "@/lib/nav";
import { getAccess } from "@/lib/permissions";
import styles from "./account.module.scss";

export const dynamic = "force-dynamic";

/**
 * Frame of your own account settings: sections on the left, the open one on
 * the right.
 *
 * Structured like the frame of the workspace and project settings — it's the
 * same second level, only it doesn't belong to a workspace but to whoever
 * opens it. That's why the header shows your own name rather than the
 * workspace's: the sidebar next to it shows workspaces and projects, and
 * without this line it would stay unclear whose settings these are.
 *
 * Nothing gets filtered here. Permissions decide nothing in this layout —
 * everyone sees exactly their own account, and someone else's is unreachable
 * through any URL (`features/account/queries.ts`).
 */
export default async function AccountLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  setCurrentWorkspaceId(workspace);

  const [t, profile, projects, workspaceAccess] = await Promise.all([
    getTranslations(),
    getMyProfile(),
    // Only for the switcher, see the workspace layout: "Project" opens the
    // first visible one, and without one (or without permission in it) the
    // segment drops out (`visibleSettingsScope`).
    getWorkspaceProjects(),
    getAccess({ workspaceId: workspace }),
  ]);
  if (!profile) notFound();

  const firstProject = projects[0];
  const projectAccess = firstProject
    ? await getAccess({ projectId: firstProject.id })
    : null;

  const scope = visibleSettingsScope(
    settingsScopeItems({
      workspaceId: workspace,
      projectSlug: firstProject?.slug,
      labels: {
        workspace: t("settings.scopeWorkspace"),
        project: t("settings.scopeProject"),
        account: t("settings.scopeAccount"),
      },
    }),
    {
      workspace: WORKSPACE_SETTINGS_PERMISSIONS.some(workspaceAccess.has),
      project: projectAccess
        ? PROJECT_SETTINGS_PERMISSIONS.some(projectAccess.has)
        : false,
    },
  );

  // No provider configured → no list to show. The tab drops out entirely
  // instead of standing there empty (see security/page.tsx for the matching
  // case in the security view).
  const hasOAuthProviders = enabledOAuthProviders.length > 0;

  const items: SettingsNavItem[] = ACCOUNT_SETTINGS_NAV.filter(
    (entry) => entry.section !== "connections" || hasOAuthProviders,
  ).map((entry) => ({
    href: accountPath(workspace, entry.section),
    label: t(`nav.${entry.labelKey}`),
    icon: entry.icon,
    // Without a keyboard there's nothing to press shortcuts on.
    needsKeyboard: entry.section === "shortcuts" || undefined,
  }));

  return (
    <div className={styles.shell}>
      {/* Only "Personal" remaining means: nothing to switch between. */}
      {scope.length > 1 && (
        <SettingsHeader
          items={scope}
          active="account"
          label={t("settings.scopeLabel")}
        />
      )}
      <SettingsBody
        className={styles.body}
        basePath={accountPath(workspace, "")}
        backLabel={t("nav.settings")}
      >
        <SettingsNav
          subject={t("nav.account")}
          title={t("nav.settings")}
          items={items}
          basePath={accountPath(workspace, "")}
        />
        <div className={styles.panel}>{children}</div>
      </SettingsBody>
    </div>
  );
}
