import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SettingsHeader } from "@/components/ui/layout/SettingsHeader/SettingsHeader";
import { SettingsBody } from "@/components/ui/layout/SettingsNav/SettingsBody";
import {
  SettingsNav,
  type SettingsNavItem,
  type SettingsNavSubject,
} from "@/components/ui/layout/SettingsNav/SettingsNav";
import {
  getCurrentWorkspace,
  getMyWorkspaces,
  getWorkspaceProjects,
} from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import {
  navEntryAllowed,
  PROJECT_SETTINGS_PERMISSIONS,
  settingsScopeItems,
  visibleSettingsScope,
  WORKSPACE_SETTINGS_NAV,
  WORKSPACE_SETTINGS_PERMISSIONS,
  workspaceSettingsPath,
} from "@/lib/nav";
import { getAccess } from "@/lib/permissions";
import styles from "./settings.module.scss";

export const dynamic = "force-dynamic";

/**
 * Frame of the workspace settings: sections on the left, the open one on the
 * right.
 *
 * Structured like the frame of the project settings and for the same
 * reasons. This layout only holds the navigation together. Every subpage
 * loads its own data and checks access again — a layout doesn't protect a
 * Server Action, and a hidden row in the sidebar isn't access control.
 * What's missing here is simply not offered; it's denied on the page itself.
 */
export default async function WorkspaceSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  setCurrentWorkspaceId(workspace);

  const [t, current, access, projects, myWorkspaces] = await Promise.all([
    getTranslations(),
    getCurrentWorkspace(),
    getAccess({ workspaceId: workspace }),
    // Only for the switcher: from here no project context carries forward, so
    // "Project" opens the first visible one (the list is sorted by name). If
    // there is none, or none with its own gate passed, the segment drops out
    // (`visibleSettingsScope`).
    getWorkspaceProjects(),
    // For the switcher in the header of the sidebar — the same list also
    // shown by the sidebar's own switcher.
    getMyWorkspaces(),
  ]);
  if (!current) notFound();

  // The header switches the workspace while staying within settings. Anyone
  // without an access right there won't see the page — that's checked in
  // `getWorkspaceSettingsView` per subpage, not at this line.
  const siblings: SettingsNavSubject[] = myWorkspaces.map((ws) => ({
    id: ws.id,
    name: ws.name,
    color: ws.color,
    image: ws.avatarUrl ?? undefined,
    href: workspaceSettingsPath(ws.id, ""),
  }));

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
        plugin: t("settings.scopePlugin"),
      },
    }),
    {
      workspace: WORKSPACE_SETTINGS_PERMISSIONS.some(access.has),
      project: projectAccess
        ? PROJECT_SETTINGS_PERMISSIONS.some(projectAccess.has)
        : false,
      // The settings of the plugins the workspace switched on: whoever may switch them on.
      plugin: access.has("plugin.enable"),
    },
  );

  // Roles and members are the only sections with their own gate (`role.manage`
  // and `member.view` respectively) — the rest stay visible even without
  // write access; they then show what's in effect, just read-only.
  const items: SettingsNavItem[] = WORKSPACE_SETTINGS_NAV.filter((entry) =>
    navEntryAllowed(access.has, entry),
  ).map((entry) => ({
    href: workspaceSettingsPath(workspace, entry.section),
    label: t(`nav.${entry.labelKey}`),
    icon: entry.icon,
  }));

  return (
    <div className={styles.shell}>
      {/* Only "Personal" remaining means: nothing to switch between — the bar
          would otherwise be a single active segment without a real choice. */}
      {scope.length > 1 && (
        <SettingsHeader
          items={scope}
          active="workspace"
          label={t("settings.scopeLabel")}
        />
      )}
      <SettingsBody
        className={styles.body}
        basePath={workspaceSettingsPath(workspace, "")}
        backLabel={t("nav.settings")}
      >
        <SettingsNav
          subject={current.name}
          color={current.color}
          image={current.avatarUrl ?? undefined}
          siblings={siblings}
          siblingsLabel={t("settings.scopeWorkspace")}
          title={t("nav.settings")}
          items={items}
          basePath={workspaceSettingsPath(workspace, "")}
        />
        <div className={styles.panel}>{children}</div>
      </SettingsBody>
    </div>
  );
}
