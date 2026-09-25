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
  getMyProjects,
  getWorkspaceProjects,
} from "@/features/workspaces/queries";
import { setCurrentWorkspaceId } from "@/lib/current-workspace";
import {
  navEntryAllowed,
  PROJECT_SETTINGS_NAV,
  PROJECT_SETTINGS_PERMISSIONS,
  projectSettingsPath,
  settingsScopeItems,
  visibleSettingsScope,
  WORKSPACE_SETTINGS_PERMISSIONS,
} from "@/lib/nav";
import { getAccess } from "@/lib/permissions";
import styles from "./settings.module.scss";

export const dynamic = "force-dynamic";

/**
 * Frame of the project settings: sections on the left, the open one on the
 * right.
 *
 * This layout only holds the navigation together. Every subpage loads its
 * own data and checks access again — a layout doesn't protect a Server
 * Action, and a hidden row in the sidebar isn't access control. What's
 * missing here is simply not offered; it's denied on the page itself.
 */
export default async function ProjectSettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspace: string; projectSlug: string }>;
}) {
  const { workspace, projectSlug } = await params;
  setCurrentWorkspaceId(workspace);

  const projects = await getWorkspaceProjects();
  const project = projects.find((p) => p.slug === projectSlug);
  if (!project) notFound();

  const [t, access, workspaceAccess] = await Promise.all([
    getTranslations(),
    getAccess({ projectId: project.id }),
    getAccess({ workspaceId: workspace }),
  ]);
  if (!access.has("project.view")) notFound();

  // The project is known here — the switcher leads back to exactly the one
  // you're currently in, not to some arbitrary other one.
  const scope = visibleSettingsScope(
    settingsScopeItems({
      workspaceId: workspace,
      projectSlug,
      labels: {
        workspace: t("settings.scopeWorkspace"),
        project: t("settings.scopeProject"),
        account: t("settings.scopeAccount"),
        plugin: t("settings.scopePlugin"),
      },
    }),
    {
      workspace: WORKSPACE_SETTINGS_PERMISSIONS.some(workspaceAccess.has),
      project: PROJECT_SETTINGS_PERMISSIONS.some(access.has),
      // The settings of the plugins a workspace switched on: whoever may switch them on.
      plugin: workspaceAccess.has("plugin.enable"),
    },
  );

  // The sidebar's header switches the project while staying within
  // settings — across workspace boundaries, because you look up a project by
  // its name, not by which workspace it hangs off of. `getMyProjects` returns
  // exactly the ones with `project.view`, the same gate this layout checks
  // right below: whatever's listed here also opens.
  const siblings: SettingsNavSubject[] = (await getMyProjects()).map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    image: p.avatarUrl ?? undefined,
    href: projectSettingsPath(p.workspaceId, p.slug, ""),
    group: p.workspaceName,
  }));

  // Roles is the only section with its own gate: it holds the rules that
  // decide everything else. General and Labels stay visible even without
  // write access — they then show what's in effect, just read-only.
  const items: SettingsNavItem[] = PROJECT_SETTINGS_NAV.filter((entry) =>
    navEntryAllowed(access.has, entry),
  ).map((entry) => ({
    href: projectSettingsPath(workspace, projectSlug, entry.section),
    label: t(`nav.${entry.labelKey}`),
    icon: entry.icon,
  }));

  return (
    <div className={styles.shell}>
      {/* Only "Personal" remaining means: nothing to switch between. */}
      {scope.length > 1 && (
        <SettingsHeader
          items={scope}
          active="project"
          label={t("settings.scopeLabel")}
        />
      )}
      <SettingsBody
        className={styles.body}
        basePath={projectSettingsPath(workspace, projectSlug, "")}
        backLabel={t("nav.settings")}
      >
        <SettingsNav
          subject={project.name}
          color={project.color}
          image={project.avatarUrl ?? undefined}
          siblings={siblings}
          siblingsLabel={t("settings.scopeProject")}
          title={t("nav.settings")}
          items={items}
          basePath={projectSettingsPath(workspace, projectSlug, "")}
        />
        <div className={styles.panel}>{children}</div>
      </SettingsBody>
    </div>
  );
}
