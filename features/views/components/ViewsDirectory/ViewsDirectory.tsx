"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import {
  type FilterLabelLookups,
  useFilterLabels,
} from "@/features/issues/components/Topbar/filterLabels";
import { isGroup } from "@/features/issues/filter";
import { setViewUserState } from "@/features/views/actions";
import {
  type TabEntry,
  ViewTabsEditor,
} from "@/features/views/components/ViewTabs/ViewTabsEditor";
import { viewIconOf } from "@/features/views/icons";
import { setNewViewAction } from "@/features/views/newViewAction";
import type { ViewEntry } from "@/features/views/queries";
import { tabOrder } from "@/features/views/tab-order";
import { viewPath } from "@/features/views/url";
import { useOpenViewModal } from "@/features/views/useOpenViewModal";
import { type MenuView, useViewMenu } from "@/features/views/useViewMenu";
import { Link, useRouter } from "@/i18n/navigation";
import { useModal } from "@/lib/context";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import type { Project } from "@/types";
import styles from "./viewsDirectory.module.scss";

export type DirectoryView = ViewEntry & { ownerName: string | null };

type Show = "all" | "mine" | "shared" | "favorites";
type Sort = "updated" | "name";
/** `all`, `""` for the workspace, or a project id. */
type Place = string;

interface Props {
  workspaceId: string;
  me: string;
  /** `view.share` per place — `""` the workspace, else a project id. */
  canShareIn: Record<string, boolean>;
  projects: Project[];
  lookups: FilterLabelLookups;
  views: DirectoryView[];
}

/**
 * Every view the person sees (BARY-178), as cards in one section per place
 * — the workspace first, then each project. A card says what the view is,
 * where it lives and who sees it; star and pin sit on it, everything else
 * in its "⋯". New views are made here too, in any place.
 */
export function ViewsDirectory({
  workspaceId,
  me,
  canShareIn,
  projects,
  lookups,
  views,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const labels = useFilterLabels(lookups);
  const timeAgo = useTimeAgo();
  const openViewModal = useOpenViewModal();
  const [, startTransition] = useTransition();
  const [show, setShow] = useState<Show>("all");
  const [place, setPlace] = useState<Place>("all");
  const [sort, setSort] = useState<Sort>("updated");
  const [q, setQ] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // Star and pin show at once; the server catches up behind.
  const [own, setOwn] = useState<
    Record<string, { favorite?: boolean; pinned?: boolean }>
  >({});

  const menu = useViewMenu({
    workspaceId,
    canShare: (v) => canShareIn[v.projectId ?? ""] ?? false,
    withOpen: true,
  });

  const hrefOf = (v: DirectoryView) =>
    viewPath(workspaceId, v.projectSlug, v.slug);
  const stateOf = (v: DirectoryView) => ({
    favorite: own[v.id]?.favorite ?? v.favorite,
    pinned: own[v.id]?.pinned ?? v.pinned,
  });
  const asMenuView = (v: DirectoryView): MenuView => ({
    ...v,
    ...stateOf(v),
    href: hrefOf(v),
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

  const scopes = {
    projects: projects.map((p) => ({ id: p.id, slug: p.slug, name: p.name })),
    canShareIn,
  };
  /** "New view", in the given place (`null`: the workspace). */
  const openNew = (projectId: string | null) =>
    openViewModal({
      workspaceId,
      projectId,
      projectSlug: projects.find((p) => p.id === projectId)?.slug ?? null,
      canShare: canShareIn[projectId ?? ""] ?? false,
      scopes,
    });
  // The floating plus (phone, tablet) offers it too — see `newViewAction`.
  const openRef = useRef(openNew);
  openRef.current = openNew;
  useEffect(() => {
    setNewViewAction({
      label: t("views.newView"),
      run: () => openRef.current(null),
    });
    return () => setNewViewAction(null);
  }, [t]);

  // ── What shows ──

  const needle = q.trim().toLowerCase();
  const shown = views
    .filter((v) => {
      if (show === "mine" && v.ownerId !== me) return false;
      if (show === "shared" && (v.visibility === "PRIVATE" || v.systemKey))
        return false;
      if (show === "favorites" && !stateOf(v).favorite) return false;
      if (place !== "all" && (v.projectId ?? "") !== place) return false;
      if (!needle) return true;
      return (
        v.name.toLowerCase().includes(needle) ||
        (v.projectName ?? "").toLowerCase().includes(needle)
      );
    })
    .sort((a, b) => {
      // System views first, always in their own order ("Assigned" first).
      const rank = (v: DirectoryView) =>
        v.systemKey === "my-issues" ? 0 : v.systemKey ? 1 : 2;
      return (
        rank(a) - rank(b) ||
        (sort === "name"
          ? a.name.localeCompare(b.name)
          : new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      );
    });

  // One section per place: the workspace, then the projects by name.
  const sections = [
    { id: "", project: null as Project | null },
    ...[...projects]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ id: p.id, project: p })),
  ]
    .filter((s) => place === "all" || place === s.id)
    .map((s) => ({
      ...s,
      views: shown.filter((v) => (v.projectId ?? "") === s.id),
    }))
    // Empty places show only when chosen or when nothing filters.
    .filter(
      (s) =>
        s.views.length > 0 || (place === s.id && show === "all" && !needle),
    );

  /** What the view filters, in a line — or which system view it is. */
  const summaryOf = (v: DirectoryView) => {
    if (v.systemKey === "my-issues" || v.systemKey === "created-by-me")
      return t(`views.systemTab.${v.systemKey}`);
    const parts = v.filter.rules
      .filter((n) => isGroup(n) || n.field !== "text")
      .map((n) => labels.member(n));
    return parts.length ? parts.join(" · ") : t("viewsPage.noFilter");
  };

  const visibilityOf = (v: DirectoryView) =>
    v.systemKey
      ? {
          icon: "lucide:user",
          text: t("viewsPage.visibilitySystem"),
        }
      : v.visibility === "PRIVATE"
        ? { icon: "lucide:lock", text: t("viewsPage.visibilityPrivate") }
        : v.visibility === "PROJECT"
          ? { icon: "lucide:users", text: t("views.visibilityProject") }
          : { icon: "lucide:users", text: t("views.visibilityWorkspace") };

  const placeLabel = (id: Place) =>
    id === "all"
      ? t("viewsPage.placeAll")
      : id === ""
        ? t("viewsPage.workspace")
        : (projects.find((p) => p.id === id)?.name ?? "");

  // The tab row of a place, as the person set it (BARY-184) — from here as
  // much as from the row itself.
  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const customizeTabs = (placeId: string) => {
    const entries: TabEntry[] = tabOrder(
      views.filter((v) => (v.projectId ?? "") === placeId),
    ).map((v) => ({
      id: v.id,
      name:
        v.systemKey === "my-issues" || v.systemKey === "created-by-me"
          ? t(`views.systemTab.${v.systemKey}`)
          : v.name,
      icon: v.icon,
      color: v.color,
      layout: v.layout,
      hidden: v.tabHidden,
      sharedBy:
        v.visibility !== "PRIVATE" && v.ownerId !== me ? v.ownerName : null,
    }));
    openModal(
      ({ close }) => (
        <ViewTabsEditor
          views={entries}
          scope={placeId ? "project" : "workspace"}
          close={close}
          sheet={isPhone}
        />
      ),
      isPhone ? { placement: "bottom" } : undefined,
    );
  };

  const card = (v: DirectoryView) => {
    const state = stateOf(v);
    const vis = visibilityOf(v);
    return (
      <article
        key={v.id}
        className={styles.card}
        data-menu-open={menuFor === v.id || undefined}
      >
        {/* The whole card opens the view — a link, so middle-click and
            "open in new tab" work; the buttons sit above it. */}
        <Link
          href={hrefOf(v)}
          className={styles.cardLink}
          aria-label={v.name}
        />
        <div className={styles.cardTop}>
          <span
            className={styles.cardIcon}
            style={
              v.color
                ? ({ "--view-color": v.color } as React.CSSProperties)
                : undefined
            }
          >
            <Icon icon={viewIconOf(v)} width={17} />
          </span>
          <span className={styles.cardTitle}>
            <span className={styles.cardName}>
              {v.name}
              {v.tabHidden && (
                <Icon
                  icon="lucide:eye-off"
                  width={13}
                  className={styles.cardHidden}
                  role="img"
                  aria-label={t("views.tabs.hiddenMark")}
                />
              )}
            </span>
            <span className={styles.cardSummary} title={summaryOf(v)}>
              {summaryOf(v)}
            </span>
          </span>
          <span className={styles.cardActions}>
            <button
              type="button"
              className={styles.iconButton}
              data-on={state.favorite || undefined}
              data-kind="star"
              aria-pressed={state.favorite}
              aria-label={
                state.favorite ? t("views.unfavorite") : t("views.favorite")
              }
              title={
                state.favorite ? t("views.unfavorite") : t("views.favorite")
              }
              onClick={() => toggle(v, "favorite")}
            >
              {/* Lucide's star is an outline only — starred, a filled one. */}
              <Icon
                icon={
                  state.favorite
                    ? "material-symbols:star-rounded"
                    : "lucide:star"
                }
                width={state.favorite ? 18 : 16}
              />
            </button>
            {/* Pinning puts a view under its project in the sidebar — a
                workspace view has no project to sit under. */}
            {v.projectId && (
              <button
                type="button"
                className={styles.iconButton}
                data-on={state.pinned || undefined}
                aria-pressed={state.pinned}
                aria-label={state.pinned ? t("views.unpin") : t("views.pin")}
                title={state.pinned ? t("views.unpin") : t("views.pin")}
                onClick={() => toggle(v, "pinned")}
              >
                <Icon icon="lucide:pin" width={16} />
              </button>
            )}
            <InlinePicker
              width={240}
              align="end"
              open={menuFor === v.id}
              onOpenChange={(open) => setMenuFor(open ? v.id : null)}
              trigger={
                <button
                  type="button"
                  className={styles.iconButton}
                  aria-label={t("views.menu")}
                  title={t("views.menu")}
                >
                  <Icon icon="lucide:more-horizontal" width={16} />
                </button>
              }
            >
              {(close) => (
                <SelectMenu
                  items={menu.itemsFor(asMenuView(v))}
                  value={null}
                  onPick={(action) => {
                    close();
                    menu.run(asMenuView(v), action);
                  }}
                  onClose={close}
                />
              )}
            </InlinePicker>
          </span>
        </div>
        <div className={styles.tags}>
          {v.systemKey && (
            <span className={styles.tag} data-kind="system">
              {t("views.systemBadge")}
            </span>
          )}
          <span className={styles.tag}>
            <Icon
              icon={
                v.layout === "list" ? "lucide:list" : "lucide:layout-dashboard"
              }
              width={12}
            />
            {v.layout === "list" ? t("views.layoutList") : t("nav.board")}
          </span>
          <span className={styles.tag}>
            <Icon icon={vis.icon} width={12} />
            {vis.text}
          </span>
          {!v.systemKey && (
            <span className={styles.tag}>
              {v.ownerId === me
                ? t("viewsPage.you")
                : (v.ownerName ?? t("viewsPage.formerMember"))}
              {" · "}
              {timeAgo(new Date(v.updatedAt).getTime())}
            </span>
          )}
        </div>
      </article>
    );
  };

  const placeItems = [
    { value: "all", label: t("viewsPage.placeAll") },
    {
      value: "",
      label: t("viewsPage.workspace"),
      icon: <Icon icon="lucide:layers" width={15} />,
    },
    ...projects.map((p) => ({
      value: p.id,
      label: p.name,
      icon: (
        <Avatar
          avatar={{
            name: p.name,
            color: p.color,
            image: p.avatarUrl ?? undefined,
          }}
          shape="square"
          size={16}
        />
      ),
    })),
  ];

  // Phone and tablet: place and order behind one "Options" button — a
  // sheet on a phone (BARY-178); the toolbar keeps only the switch.
  const optionsButton = (
    <span className={styles.optionsButton}>
      <InlinePicker
        width={280}
        align="end"
        title={t("viewsPage.options")}
        trigger={
          <Button
            variant="text"
            icon={<Icon icon="lucide:sliders-horizontal" width={15} />}
          >
            {t("viewsPage.options")}
          </Button>
        }
      >
        <div className={styles.options}>
          <span className={styles.optionsLabel}>{t("viewsPage.order")}</span>
          <div className={styles.fullSwitch}>
            <SegmentedControl
              variant="surface"
              value={sort}
              onChange={(v) => setSort(v as Sort)}
              items={[
                { value: "updated", label: t("viewsPage.sortUpdated") },
                { value: "name", label: t("viewsPage.sortName") },
              ]}
            />
          </div>
          <span className={styles.optionsLabel}>{t("viewsPage.place")}</span>
          <SelectMenu
            items={placeItems}
            value={place}
            onPick={(v) => setPlace(String(v ?? "all"))}
          />
        </div>
      </InlinePicker>
    </span>
  );

  const newButton = (
    <span className={styles.newButton}>
      <Button
        variant="primary"
        icon={<Icon icon="lucide:plus" width={15} />}
        onClick={() => openNew(null)}
      >
        {t("views.newView")}
      </Button>
    </span>
  );

  return (
    <div className={styles.page}>
      <PageHeader
        divider={false}
        title={t("nav.views")}
        count={views.length}
        description={t("viewsPage.subtitle")}
        actions={
          <>
            {optionsButton}
            {newButton}
          </>
        }
      />

      <div className={styles.toolbar}>
        <div className={styles.showSwitch}>
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
        </div>
        <InlinePicker
          width={240}
          trigger={
            <button type="button" className={styles.pick}>
              <Icon icon="lucide:map-pin" width={14} />
              <span>{placeLabel(place)}</span>
              <Icon icon="lucide:chevron-down" width={13} />
            </button>
          }
        >
          {(close) => (
            <SelectMenu
              items={placeItems}
              value={place}
              searchable={projects.length > 5}
              placeholder={t("placeholders.search")}
              onPick={(v) => {
                setPlace(String(v ?? "all"));
                close();
              }}
              onClose={close}
            />
          )}
        </InlinePicker>
        <InlinePicker
          width={220}
          trigger={
            <button type="button" className={styles.pick}>
              <Icon icon="lucide:arrow-up-down" width={14} />
              <span>
                {sort === "name"
                  ? t("viewsPage.sortName")
                  : t("viewsPage.sortUpdated")}
              </span>
              <Icon icon="lucide:chevron-down" width={13} />
            </button>
          }
        >
          {(close) => (
            <SelectMenu
              items={[
                { value: "updated", label: t("viewsPage.sortUpdated") },
                { value: "name", label: t("viewsPage.sortName") },
              ]}
              value={sort}
              onPick={(v) => {
                setSort(v as Sort);
                close();
              }}
              onClose={close}
            />
          )}
        </InlinePicker>
        {/* `Input` puts a class on the field, not on its frame with the
            magnifier — the size and place go on a wrapper. */}
        <div className={styles.search}>
          <Input
            variant="search"
            placeholder={t("viewsPage.search")}
            aria-label={t("viewsPage.search")}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      <div className={styles.body}>
        {sections.length === 0 ? (
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
            action={views.length === 0 ? newButton : undefined}
          />
        ) : (
          sections.map((s) => (
            <section key={s.id || "workspace"} className={styles.section}>
              <header className={styles.sectionHead}>
                {s.project ? (
                  <Avatar
                    avatar={{
                      name: s.project.name,
                      color: s.project.color,
                      image: s.project.avatarUrl ?? undefined,
                    }}
                    shape="square"
                    size={20}
                  />
                ) : (
                  <Icon icon="lucide:layers" width={18} />
                )}
                <h2>{s.project?.name ?? t("viewsPage.workspace")}</h2>
                <span className={styles.sectionCount}>{s.views.length}</span>
                <button
                  type="button"
                  className={styles.sectionAdd}
                  onClick={() => openNew(s.project?.id ?? null)}
                >
                  <Icon icon="lucide:plus" width={14} />
                  <span>
                    {s.project
                      ? t("viewsPage.addIn", { place: s.project.name })
                      : t("viewsPage.addInWorkspace")}
                  </span>
                </button>
                <Button
                  variant="elevated"
                  size="sm"
                  icon={<Icon icon="lucide:sliders-horizontal" width={14} />}
                  onClick={() => customizeTabs(s.id)}
                >
                  {t("views.tabs.customizeTabs")}
                </Button>
              </header>
              {s.views.length ? (
                <div className={styles.cards}>{s.views.map(card)}</div>
              ) : (
                <p className={styles.sectionEmpty}>
                  {t("viewsPage.placeEmpty")}
                </p>
              )}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
