import { getTranslations } from "next-intl/server";
import { getMyPreferences } from "@/features/account/queries";
import { NewProjectButton } from "@/features/projects/components/NewProjectButton/NewProjectButton";
import {
  getCurrentWorkspace,
  getWorkspaceProjects,
} from "@/features/workspaces/queries";
import { db } from "@/lib/db";
import { navEntryAllowed, PROJECT_NAV, projectPath } from "@/lib/nav";
import { getAccess } from "@/lib/permissions";
import styles from "../../../sidebar.module.scss";
import TabList, { type TabGroup } from "../components/TabList";

export default async function NavGroupProjects() {
  const t = await getTranslations();
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const [visibleProjects, access, { projectLanding, projectOrder }] =
    await Promise.all([
      getWorkspaceProjects(),
      getAccess({ workspaceId: workspace.id }),
      getMyPreferences(),
    ]);

  // The list arrives alphabetical. "Newest first" needs the creation time,
  // which the shared project shape doesn't carry — read here, for the one
  // place that orders by it.
  let projects = visibleProjects;
  if (projectOrder === "newest" && projects.length > 1) {
    const created = new Map(
      (
        await db.project.findMany({
          where: { id: { in: projects.map((p) => p.id) } },
          select: { id: true, createdAt: true },
        })
      ).map((row) => [row.id, row.createdAt.getTime()]),
    );
    projects = [...projects].sort(
      (a, b) => (created.get(b.id) ?? 0) - (created.get(a.id) ?? 0),
    );
  }

  // The project's row: where a click on its name leads (the person's
  // choice). Every one of these is also an entry in the group below.
  const landingSection =
    projectLanding === "list"
      ? "list"
      : projectLanding === "dashboard"
        ? "overview"
        : "";

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
      href: projectPath(workspace.id, p.slug, landingSection),
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
            // A phone has no board — only the list ("Issues").
            ...(entry.section === "" ? { hideOnPhone: true } : {}),
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
