import { getTranslations } from "next-intl/server";
import { getMyPreferences } from "@/features/account/queries";
import { viewIconOf } from "@/features/views/icons";
import { getFavoriteProjects, getNavViews } from "@/features/views/queries";
import { viewPath } from "@/features/views/url";
import {
  getCurrentWorkspace,
  getWorkspaceProjects,
} from "@/features/workspaces/queries";
import styles from "../../../sidebar.module.scss";
import { projectLandingHref } from "../landing";
import { type FavoriteItem, FavoritesList } from "./FavoritesList";

/**
 * The person's favorites (V7): views and projects in one list of their own
 * order, above the projects. Nothing at all without a favorite.
 */
export default async function NavGroupFavorites() {
  const t = await getTranslations();
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const [projects, navViews, { projectLanding }] = await Promise.all([
    getWorkspaceProjects(),
    getNavViews(workspace.id),
    getMyPreferences(),
  ]);
  const starredProjects = await getFavoriteProjects(projects.map((p) => p.id));

  const bySlug = new Map(projects.map((p) => [p.id, p]));
  const items: (FavoriteItem & { position: number })[] = [
    ...starredProjects.flatMap((f) => {
      const p = bySlug.get(f.projectId);
      if (!p) return [];
      const startView = navViews.find(
        (v) => v.projectId === p.id && v.startView,
      );
      return [
        {
          kind: "project" as const,
          id: p.id,
          label: p.name,
          href: projectLandingHref(
            workspace.id,
            p.slug,
            projectLanding,
            startView?.slug ?? null,
          ),
          color: p.color,
          image: p.avatarUrl ?? undefined,
          position: f.favoritePosition ?? 0,
        },
      ];
    }),
    // Views in a project, and the workspace's own (V8).
    ...navViews.flatMap((v) => {
      const p = v.projectId ? bySlug.get(v.projectId) : undefined;
      if (!v.favorite || (v.projectId && !p)) return [];
      return [
        {
          kind: "view" as const,
          id: v.id,
          label: v.name,
          hint: p?.name,
          href: viewPath(workspace.id, p?.slug ?? null, v.slug),
          icon: viewIconOf(v),
          color: v.color ?? undefined,
          position: v.favoritePosition ?? 0,
        },
      ];
    }),
  ].sort((a, b) => a.position - b.position);

  if (!items.length) return null;

  return (
    <>
      <div className={styles.titleWrapper}>
        <span>{t("views.favoritesHeading")}</span>
      </div>
      <div className={styles.favoritesWrapper}>
        <FavoritesList
          items={items.map(({ position: _p, ...item }) => item)}
          unfavoriteLabel={t("views.unfavorite")}
        />
      </div>
    </>
  );
}
