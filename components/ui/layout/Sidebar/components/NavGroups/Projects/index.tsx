import { getTranslations } from "next-intl/server";
import { NewProjectButton } from "@/features/projects/components/NewProjectButton/NewProjectButton";
import {
  getCurrentWorkspace,
  getWorkspaceProjects,
} from "@/features/workspaces/queries";
import {
  navEntryAllowed,
  PROJECT_NAV,
  PROJECT_OVERVIEW_NAV,
  projectPath,
} from "@/lib/nav";
import { getAccess } from "@/lib/permissions";
import styles from "../../../sidebar.module.scss";
import TabList, { type TabGroup } from "../components/TabList";

export default async function NavGroupProjects() {
  const t = await getTranslations();
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const [projects, access] = await Promise.all([
    getWorkspaceProjects(),
    getAccess({ workspaceId: workspace.id }),
  ]);

  // Each project has its own role — the visibility of "Settings"
  // (`role.manage`/`label.create`/`project.update`) depends on the project
  // role, not the workspace role above it.
  const projectAccess = await Promise.all(
    projects.map((p) => getAccess({ projectId: p.id })),
  );

  // The project row carries `/*` and is thus marked active as long as
  // you're anywhere within the project — the pattern is evaluated in
  // `lib/nav.ts` (`isNavActive`).
  const projectTabs: TabGroup[] = projects.map((p, i) => {
    const projPath = projectPath(workspace.id, p.slug, "");
    const pAccess = projectAccess[i];
    return {
      href: `${projPath}/${PROJECT_OVERVIEW_NAV.section}`,
      activeHref: `${projPath}/*`,
      label: p.name,
      color: p.color,
      image: p.avatarUrl ?? undefined,
      shape: "square",
      group: [
        ...PROJECT_NAV.filter((entry) =>
          navEntryAllowed(pAccess.has, entry),
        ).map((entry) => {
          const href = projectPath(workspace.id, p.slug, entry.section);
          return {
            href,
            label: t(`nav.${entry.labelKey}`),
            icon: entry.icon,
            // Settings has a second level (roles, labels). Without the
            // section below, the entry would lose its active marking as
            // soon as something in it is clicked — and the branch would
            // collapse.
            ...(entry.section === "settings"
              ? { activeHref: `${href}/*` }
              : {}),
          };
        }),
      ],
    };
  });

  return (
    <>
      <div className={styles.titleWrapper}>
        <span>{t("settings.projects")}</span>
        {access.has("project.create") && (
          <NewProjectButton workspaceId={workspace.id} compact shortcut />
        )}
      </div>
      <div className={styles.projectTabsWrapper}>
        <TabList tabs={projectTabs} />
      </div>
    </>
  );
}
