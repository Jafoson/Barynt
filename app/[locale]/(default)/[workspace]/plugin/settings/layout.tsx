import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { SettingsHeader } from "@/components/ui/layout/SettingsHeader/SettingsHeader";
import { SettingsBody } from "@/components/ui/layout/SettingsNav/SettingsBody";
import {
  SettingsNav,
  type SettingsNavItem,
} from "@/components/ui/layout/SettingsNav/SettingsNav";
import { configurable } from "@/features/plugins/settingsArea";
import { getPluginSettingsArea } from "@/features/plugins/settingsAreaQueries";
import {
  getCurrentWorkspace,
  getWorkspaceProjects,
} from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import {
  PROJECT_SETTINGS_PERMISSIONS,
  pluginSettingsPath,
  settingsScopeItems,
  visibleSettingsScope,
  WORKSPACE_SETTINGS_PERMISSIONS,
} from "@/lib/nav";
import { getAccess } from "@/lib/permissions";
import styles from "./pluginSettings.module.scss";

export const dynamic = "force-dynamic";

/**
 * Frame of the plugins' settings: the plugins this workspace has switched on and that have
 * settings on the left, the open one on the right.
 *
 * Structured like the frames of the workspace, project and account settings, and the fourth
 * choice of their switcher. This layout only holds the navigation together: every page asks
 * again (`getPluginSettingsArea` needs `plugin.enable` in the workspace), because a layout
 * protects no page and no action, and a missing row in the sidebar is not access control.
 */
export default async function PluginSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string; locale: string }>;
}) {
  const { workspace, locale } = await params;
  setCurrentWorkspaceId(workspace);

  const [t, current, access, projects, area] = await Promise.all([
    getTranslations(),
    getCurrentWorkspace(),
    getAccess({ workspaceId: workspace }),
    // Only for the switcher, see the workspace layout.
    getWorkspaceProjects(),
    getPluginSettingsArea(workspace, locale),
  ]);
  // Whoever may not switch plugins on is told the area is not there.
  if (!current || !area) notFound();

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
      plugin: access.has("plugin.enable"),
    },
  );

  // The overview, then one row for each plugin that has something to set. A plugin without
  // settings is on the overview, which says so; a row that opens nothing would be a dead end.
  const items: SettingsNavItem[] = [
    {
      href: pluginSettingsPath(workspace),
      label: t("nav.overview"),
      icon: "lucide:layout-list",
    },
    ...configurable(area).map((plugin) => ({
      href: pluginSettingsPath(workspace, plugin.id),
      label: plugin.name,
      icon: "lucide:puzzle",
    })),
  ];

  return (
    <div className={styles.shell}>
      {scope.length > 1 && (
        <SettingsHeader
          items={scope}
          active="plugin"
          label={t("settings.scopeLabel")}
        />
      )}
      <SettingsBody
        className={styles.body}
        basePath={pluginSettingsPath(workspace)}
        backLabel={t("pluginSettings.areaTitle")}
      >
        <SettingsNav
          subject={current.name}
          color={current.color}
          image={current.avatarUrl ?? undefined}
          title={t("pluginSettings.areaTitle")}
          items={items}
          basePath={pluginSettingsPath(workspace)}
        />
        <div className={styles.panel}>{children}</div>
      </SettingsBody>
    </div>
  );
}
