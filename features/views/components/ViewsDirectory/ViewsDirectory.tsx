"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import type { TableGroup } from "@/components/ui/layout/Table/types";
import { setViewUserState } from "@/features/views/actions";
import { viewIconOf } from "@/features/views/icons";
import { setNewViewAction } from "@/features/views/newViewAction";
import type { ViewEntry } from "@/features/views/queries";
import { viewPath } from "@/features/views/url";
import { useOpenViewModal } from "@/features/views/useOpenViewModal";
import { Link, useRouter } from "@/i18n/navigation";
import styles from "./viewsDirectory.module.scss";

export type DirectoryView = ViewEntry & { ownerName: string | null };

type Show = "all" | "mine" | "shared" | "favorites";

interface Props {
  workspaceId: string;
  me: string;
  /** `view.share` in the workspace — for the new view's "everyone". */
  canShare: boolean;
  views: DirectoryView[];
}

/**
 * Every view the person sees (BARY-178), grouped by where it lives — the
 * workspace first, then each project — with a star and a pin right in the
 * row. The sidebar shows only what's starred or pinned; here is the rest.
 */
export function ViewsDirectory({ workspaceId, me, canShare, views }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const openViewModal = useOpenViewModal();
  const [, startTransition] = useTransition();
  const [show, setShow] = useState<Show>("all");
  const [q, setQ] = useState("");
  // Star and pin show at once; the server catches up behind.
  const [own, setOwn] = useState<
    Record<string, { favorite?: boolean; pinned?: boolean }>
  >({});

  const stateOf = (v: DirectoryView) => ({
    favorite: own[v.id]?.favorite ?? v.favorite,
    pinned: own[v.id]?.pinned ?? v.pinned,
  });

  const toggle = (v: DirectoryView, key: "favorite" | "pinned") => {
    const next = !stateOf(v)[key];
    setOwn((cur) => ({ ...cur, [v.id]: { ...cur[v.id], [key]: next } }));
    startTransition(async () => {
      const result = await setViewUserState(v.id, { [key]: next });
      if (result.ok) router.refresh();
      else
        setOwn((cur) => ({ ...cur, [v.id]: { ...cur[v.id], [key]: !next } }));
    });
  };

  const needle = q.trim().toLowerCase();
  const shown = views.filter((v) => {
    if (show === "mine" && v.ownerId !== me) return false;
    if (show === "shared" && v.visibility === "PRIVATE") return false;
    if (show === "favorites" && !stateOf(v).favorite) return false;
    if (!needle) return true;
    return (
      v.name.toLowerCase().includes(needle) ||
      (v.projectName ?? "").toLowerCase().includes(needle)
    );
  });

  // The workspace's own first, then project by project (already sorted).
  const groups: TableGroup<DirectoryView>[] = [];
  for (const v of shown) {
    const id = v.projectId ?? "";
    let group = groups.find((g) => g.id === id);
    if (!group) {
      group = {
        id,
        header: (
          <span className={styles.groupHead}>
            {v.projectName ?? t("viewsPage.workspace")}
          </span>
        ),
        label: v.projectName ?? t("viewsPage.workspace"),
        rows: [],
      };
      groups.push(group);
    }
    group.rows.push(v);
  }

  const visibilityText = (v: DirectoryView) =>
    v.systemKey
      ? t("viewsPage.visibilitySystem")
      : v.visibility === "PRIVATE"
        ? t("viewsPage.visibilityPrivate")
        : v.visibility === "PROJECT"
          ? t("views.visibilityProject")
          : t("views.visibilityWorkspace");

  const columns: TableColumn<DirectoryView>[] = [
    {
      id: "name",
      header: t("viewsPage.name"),
      width: "minmax(180px, 1fr)",
      sortValue: (v) => v.name,
      cell: (v) => (
        <span className={styles.name}>
          <Icon
            icon={viewIconOf(v)}
            width={16}
            style={v.color ? { color: v.color } : undefined}
          />
          <span>{v.name}</span>
        </span>
      ),
    },
    {
      id: "layout",
      header: t("viewsPage.layout"),
      width: "minmax(90px, max-content)",
      sortValue: (v) => v.layout,
      cell: (v) => (
        <span className={styles.muted}>
          {v.layout === "list" ? t("views.layoutList") : t("nav.board")}
        </span>
      ),
    },
    {
      id: "visibility",
      header: t("viewsPage.visibility"),
      width: "minmax(150px, max-content)",
      sortValue: (v) => visibilityText(v),
      cell: (v) => <span className={styles.muted}>{visibilityText(v)}</span>,
    },
    {
      id: "owner",
      header: t("viewsPage.owner"),
      width: "minmax(130px, max-content)",
      sortValue: (v) => (v.ownerId === me ? "" : (v.ownerName ?? "￿")),
      cell: (v) => (
        <span className={styles.muted}>
          {v.systemKey
            ? "—"
            : v.ownerId === me
              ? t("viewsPage.you")
              : (v.ownerName ?? "—")}
        </span>
      ),
    },
    {
      id: "actions",
      width: "max-content",
      align: "end",
      cell: (v) => {
        const state = stateOf(v);
        return (
          <span className={styles.actions}>
            <Button
              variant="text"
              size="sm"
              className={styles.toggle}
              data-on={state.favorite || undefined}
              // Filled while starred (CSS, `data-on`).
              icon={<Icon icon="lucide:star" width={15} />}
              aria-pressed={state.favorite}
              aria-label={
                state.favorite ? t("views.unfavorite") : t("views.favorite")
              }
              title={
                state.favorite ? t("views.unfavorite") : t("views.favorite")
              }
              onClick={() => toggle(v, "favorite")}
            />
            <Button
              variant="text"
              size="sm"
              className={styles.toggle}
              data-on={state.pinned || undefined}
              icon={<Icon icon="lucide:pin" width={15} />}
              aria-pressed={state.pinned}
              aria-label={state.pinned ? t("views.unpin") : t("views.pin")}
              title={state.pinned ? t("views.unpin") : t("views.pin")}
              onClick={() => toggle(v, "pinned")}
            />
          </span>
        );
      },
    },
  ];

  const openNew = () =>
    openViewModal({
      workspaceId,
      projectId: null,
      projectSlug: null,
      canShare,
    });
  // The floating plus (phone, tablet) offers it too — see `newViewAction`.
  const openRef = useRef(openNew);
  openRef.current = openNew;
  useEffect(() => {
    setNewViewAction({
      label: t("views.newView"),
      run: () => openRef.current(),
    });
    return () => setNewViewAction(null);
  }, [t]);

  // On a phone or tablet the floating plus creates views instead.
  const newButton = (
    <span className={styles.newButton}>
      <Button
        variant="primary"
        icon={<Icon icon="lucide:plus" width={15} />}
        onClick={openNew}
      >
        {t("views.newView")}
      </Button>
    </span>
  );

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.views")}
        count={views.length}
        description={t("viewsPage.subtitle")}
        actions={newButton}
      />

      <div className={styles.toolbar}>
        <SegmentedControl
          variant="surface"
          value={show}
          onChange={(v) => setShow(v as Show)}
          items={[
            { value: "all", label: t("viewsPage.showAll") },
            { value: "mine", label: t("viewsPage.showMine") },
            { value: "shared", label: t("viewsPage.showShared") },
            { value: "favorites", label: t("viewsPage.showFavorites") },
          ]}
        />
        <Input
          variant="search"
          className={styles.search}
          placeholder={t("viewsPage.search")}
          aria-label={t("viewsPage.search")}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      <div className={styles.content}>
        <Table
          fill
          variant="card"
          label={t("nav.views")}
          columns={columns}
          groups={groups}
          getRowKey={(v) => v.id}
          // The row opens the view — as a link, so middle-click and "open
          // in new tab" keep working.
          rowOverlay={(v) => (
            <Link
              href={viewPath(workspaceId, v.projectSlug, v.slug)}
              aria-label={v.name}
            />
          )}
          empty={
            <EmptyState
              icon={<Icon icon="lucide:layers" width={32} />}
              title={
                views.length === 0
                  ? t("viewsPage.emptyTitle")
                  : t("viewsPage.noMatchTitle")
              }
              description={
                views.length === 0 ? t("viewsPage.emptyDesc") : undefined
              }
            />
          }
        />
      </div>
    </>
  );
}
