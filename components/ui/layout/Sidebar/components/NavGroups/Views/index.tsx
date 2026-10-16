import { getTranslations } from "next-intl/server";
import { viewIconOf } from "@/features/views/icons";
import { getNavViews } from "@/features/views/queries";
import { viewPath } from "@/features/views/url";
import { getCurrentWorkspace } from "@/features/workspaces/queries";
import styles from "../../../sidebar.module.scss";
import TabList, { type TabGroup } from "../components/TabList";

/**
 * The workspace's cross-project views the person pinned (V8), below the
 * projects — project views sit under their project instead. Nothing at all
 * without one.
 */
export default async function NavGroupViews() {
  const t = await getTranslations();
  const workspace = await getCurrentWorkspace();
  if (!workspace) return null;

  const pinned = (await getNavViews(workspace.id)).filter(
    (v) => v.pinned && v.projectId === null,
  );
  if (!pinned.length) return null;

  const tabs: TabGroup[] = pinned.map((v) => ({
    href: viewPath(workspace.id, null, v.slug),
    activeHref: `${viewPath(workspace.id, null, v.slug)}/*`,
    label: v.name,
    icon: viewIconOf(v),
    color: v.color ?? undefined,
    action: { kind: "unpinView", id: v.id, label: t("views.unpin") },
  }));

  return (
    <>
      <div className={styles.titleWrapper}>
        <span>{t("views.sidebarHeading")}</span>
      </div>
      <div className={styles.favoritesWrapper}>
        <TabList tabs={tabs} />
      </div>
    </>
  );
}
