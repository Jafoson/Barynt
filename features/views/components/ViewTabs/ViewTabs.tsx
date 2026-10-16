"use client";

import { Icon } from "@iconify/react";
import { useLocale, useTranslations } from "next-intl";
import {
  Fragment,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import {
  type ISelectItem,
  SelectMenu,
} from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { Tab, Tabs } from "@/components/ui/layout/Tabs/Tabs";
import {
  deleteView,
  duplicateView,
  setViewUserState,
} from "@/features/views/actions";
import { viewIconOf } from "@/features/views/icons";
import type { ViewLayout, ViewVisibility } from "@/features/views/schema";
import { viewPath } from "@/features/views/url";
import { useOpenViewModal } from "@/features/views/useOpenViewModal";
import { getPathname, useRouter } from "@/i18n/navigation";
import { useUI } from "@/lib/ui-store";
import styles from "./viewTabs.module.scss";

/** Never fewer view tabs than this, room or not — "More" holds the rest. */
const MIN_VISIBLE = 3;
/** "More"'s width before it has rendered once. */
const MORE_WIDTH = 96;

/** One view as the row shows it — prepared on the server (`Topbar`). */
export interface ViewTab {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  color: string | null;
  layout: ViewLayout;
  visibility: ViewVisibility;
  canEdit: boolean;
  /** The view's own address, state included (`viewParams`). */
  href: string;
  /** Name of who shared it — set only for someone else's shared view. */
  sharedBy: string | null;
  /** A workspace's system view (V8) — personal, though nobody's. */
  system: boolean;
  /** The viewer's own state (V7). */
  pinned: boolean;
  favorite: boolean;
  startView: boolean;
}

interface ViewTabsProps {
  workspaceId: string;
  /** `null` for a cross-project view (V8). */
  projectId: string | null;
  projectSlug: string | null;
  canShare: boolean;
  views: ViewTab[];
  /** The open view, `null` on the plain board/list. */
  activeId: string | null;
  /** The open view's address differs from its stored state. */
  dirty: boolean;
}

/**
 * The project's saved views as tabs in the title row, between the title and
 * the actions (BARY-177): Material-style, the open one marked by a bar at
 * the header's top edge. Board, list and dashboard aren't in here — they keep their
 * places in the sidebar and the board/list switch. Without any view the row
 * isn't rendered at all; "New view" in the filter row is the way in.
 */
export function ViewTabs({
  workspaceId,
  projectId,
  projectSlug,
  canShare,
  views,
  activeId,
  dirty,
}: ViewTabsProps) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const confirm = useConfirm();
  const openViewModal = useOpenViewModal();
  const { toast } = useUI();
  const [, startTransition] = useTransition();
  const [menuFor, setMenuFor] = useState<string | null>(null);
  // The tabs that fit; `null` until measured (and on the server): all.
  const [visibleIds, setVisibleIds] = useState<string[] | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLButtonElement>(null);

  // Fit as many tabs as the row leaves room for (at least MIN_VISIBLE, the
  // open one always among them); the rest go to "More".
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const row = wrap?.parentElement;
    const measure = measureRef.current;
    if (!wrap || !row || !measure) return;
    const fit = () => {
      const widths = [...measure.children].map(
        (el) => (el as HTMLElement).offsetWidth,
      );
      // What the row's other children take, gaps included.
      const gap = Number.parseFloat(getComputedStyle(row).columnGap) || 0;
      let others = 0;
      for (const child of row.children) {
        if (child === wrap) continue;
        const el = child as HTMLElement;
        if (getComputedStyle(el).display === "none") continue;
        others += el.offsetWidth + gap;
      }
      const room = row.clientWidth - others;
      const total = widths.reduce((sum, w) => sum + w, 0);
      if (total <= room) {
        setVisibleIds(null);
        return;
      }
      const moreWidth = (moreRef.current?.offsetWidth ?? 0) || MORE_WIDTH;
      let used = moreWidth;
      let count = 0;
      for (const w of widths) {
        if (used + w > room) break;
        used += w;
        count++;
      }
      count = Math.max(count, Math.min(MIN_VISIBLE, views.length));
      const ids = views.slice(0, count).map((v) => v.id);
      const activeIndex = views.findIndex((v) => v.id === activeId);
      if (activeIndex >= count && count > 0)
        ids[count - 1] = views[activeIndex].id;
      setVisibleIds((cur) =>
        cur && cur.length === ids.length && cur.every((id, i) => id === ids[i])
          ? cur
          : ids,
      );
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(row);
    return () => observer.disconnect();
  }, [views, activeId]);

  if (views.length === 0) return null;

  const errorText = (error: string) =>
    error === "forbidden"
      ? t("views.errorForbidden")
      : error === "notFound"
        ? t("views.errorNotFound")
        : t("views.errorGeneric");

  const itemsFor = (view: ViewTab): ISelectItem[] => [
    // The viewer's own switches (V7), each saying what a click does now.
    {
      value: "pin",
      label: view.pinned ? t("views.unpin") : t("views.pin"),
      icon: (
        <Icon icon={view.pinned ? "lucide:pin-off" : "lucide:pin"} width={15} />
      ),
    },
    {
      value: "favorite",
      label: view.favorite ? t("views.unfavorite") : t("views.favorite"),
      icon: (
        <Icon
          icon={view.favorite ? "lucide:star-off" : "lucide:star"}
          width={15}
        />
      ),
    },
    {
      value: "startView",
      label: view.startView ? t("views.unsetStartView") : t("views.startView"),
      icon: <Icon icon="lucide:house" width={15} />,
    },
    ...(view.canEdit
      ? [
          {
            value: "edit",
            label: t("views.edit"),
            icon: <Icon icon="lucide:pencil" width={15} />,
          },
        ]
      : []),
    {
      value: "duplicate",
      label: t("views.duplicate"),
      icon: <Icon icon="lucide:copy" width={15} />,
    },
    {
      value: "copyLink",
      label: t("views.copyLink"),
      icon: <Icon icon="lucide:link" width={15} />,
    },
    ...(view.canEdit
      ? [
          {
            value: "delete",
            label: t("views.delete"),
            icon: <Icon icon="lucide:trash-2" width={15} />,
          },
        ]
      : []),
  ];

  const setState = (
    view: ViewTab,
    patch: { pinned?: boolean; favorite?: boolean; startView?: boolean },
    done: string,
  ) =>
    startTransition(async () => {
      const result = await setViewUserState(view.id, patch);
      if (!result.ok) return toast(errorText(result.error));
      toast(done);
      router.refresh();
    });

  const run = (view: ViewTab, action: string | number | null) => {
    if (action === "pin") {
      setState(
        view,
        { pinned: !view.pinned },
        view.pinned ? t("views.unpinned") : t("views.pinned"),
      );
    } else if (action === "favorite") {
      setState(
        view,
        { favorite: !view.favorite },
        view.favorite ? t("views.unfavorited") : t("views.favorited"),
      );
    } else if (action === "startView") {
      setState(
        view,
        { startView: !view.startView },
        view.startView ? t("views.startViewOff") : t("views.startViewOn"),
      );
    } else if (action === "edit") {
      openViewModal({
        workspaceId,
        projectId,
        projectSlug,
        canShare,
        view: {
          id: view.id,
          name: view.name,
          icon: view.icon,
          color: view.color,
          visibility: view.visibility,
          layout: view.layout,
        },
      });
    } else if (action === "duplicate") {
      startTransition(async () => {
        const result = await duplicateView(
          view.id,
          t("views.copyName", { name: view.name }),
        );
        if (!result.ok) return toast(errorText(result.error));
        toast(t("views.created"));
        router.push(viewPath(workspaceId, projectSlug, result.data.slug));
      });
    } else if (action === "copyLink") {
      const path = getPathname({ href: view.href, locale });
      navigator.clipboard
        .writeText(`${window.location.origin}${path}`)
        .then(() => toast(t("views.linkCopied")))
        .catch(() => toast(t("views.errorGeneric")));
    } else if (action === "delete") {
      // Ask first, outside the transition: React holds back every update of
      // a running async transition until it finishes — the confirm dialog
      // opening is one of them, so asking inside it would wait forever.
      void (async () => {
        const ok = await confirm({
          title: t("views.deleteTitle", { name: view.name }),
          description:
            view.visibility === "PRIVATE"
              ? t("views.deletePrivateBody")
              : t("views.deleteSharedBody"),
          confirmLabel: t("views.delete"),
          cancelLabel: t("actions.cancel"),
          danger: true,
        });
        if (!ok) return;
        startTransition(async () => {
          const result = await deleteView(view.id);
          if (!result.ok) return toast(errorText(result.error));
          toast(t("views.deleted"));
          if (view.id === activeId)
            router.push(
              projectSlug
                ? `/${workspaceId}/project/${projectSlug}`
                : `/${workspaceId}/issues`,
            );
          else router.refresh();
        });
      })();
    }
  };

  const tabOf = (view: ViewTab, measuring = false) => {
    const active = view.id === activeId;
    return (
      <Tab
        key={view.id}
        href={view.href}
        active={active}
        className={styles.tab}
        data-id={view.id}
        data-dirty={(active && dirty) || undefined}
        data-menu-open={menuFor === view.id || undefined}
        onLinkContextMenu={(e) => {
          e.preventDefault();
          setMenuFor(view.id);
        }}
        icon={
          <Icon
            icon={viewIconOf(view)}
            width={15}
            style={view.color ? { color: view.color } : undefined}
          />
        }
        trailing={
          measuring ? undefined : (
            <InlinePicker
              width={240}
              align="start"
              open={menuFor === view.id}
              onOpenChange={(open) => setMenuFor(open ? view.id : null)}
              trigger={
                <button
                  type="button"
                  className={styles.more}
                  aria-label={t("views.menu")}
                  title={t("views.menu")}
                >
                  <Icon icon="lucide:more-horizontal" width={14} />
                </button>
              }
            >
              {(close) => (
                <>
                  {view.sharedBy && (
                    <div className={styles.menuHead}>
                      {t("views.sharedBy", { name: view.sharedBy })}
                    </div>
                  )}
                  <SelectMenu
                    items={itemsFor(view)}
                    value={null}
                    onPick={(value) => {
                      close();
                      run(view, value);
                    }}
                    onClose={close}
                  />
                </>
              )}
            </InlinePicker>
          )
        }
      >
        {view.name}
        {view.visibility !== "PRIVATE" && !view.system && (
          <Icon
            icon="lucide:users"
            width={12}
            className={styles.shared}
            aria-label={t("views.shared")}
          />
        )}
        {active && dirty && <span className={styles.dirty} />}
      </Tab>
    );
  };

  const shown = visibleIds
    ? views.filter((v) => visibleIds.includes(v.id))
    : views;
  const overflow = visibleIds
    ? views
        .filter((v) => !visibleIds.includes(v.id))
        // Favorites first, the rest in tab order.
        .sort((a, b) => Number(b.favorite) - Number(a.favorite))
    : [];

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <Tabs indicator="top" label={t("views.tabsLabel")} className={styles.row}>
        {shown.map((view, i) => (
          <Fragment key={view.id}>
            {/* System views, then the workspace's own (V8). */}
            {i > 0 && shown[i - 1].system && !view.system && (
              <span className={styles.groupDivider} />
            )}
            {tabOf(view)}
          </Fragment>
        ))}
      </Tabs>
      {overflow.length > 0 && (
        <InlinePicker
          width={260}
          align="start"
          title={t("views.moreViews")}
          trigger={
            <button type="button" className={styles.overflow} ref={moreRef}>
              {t("views.moreViews")}
              <span className={styles.overflowCount}>{overflow.length}</span>
              <Icon icon="lucide:chevron-down" width={13} aria-hidden="true" />
            </button>
          }
        >
          {(close) => (
            <SelectMenu
              items={overflow.map((v) => ({
                value: v.id,
                label: v.name,
                icon: (
                  <Icon
                    icon={v.favorite ? "lucide:star" : viewIconOf(v)}
                    width={15}
                    style={v.color ? { color: v.color } : undefined}
                  />
                ),
              }))}
              value={null}
              searchable={overflow.length > 5}
              placeholder={t("placeholders.search")}
              onPick={(id) => {
                close();
                const view = overflow.find((v) => v.id === id);
                if (view) router.push(view.href);
              }}
              onClose={close}
            />
          )}
        </InlinePicker>
      )}
      {/* Every tab once more, out of sight, to know their widths. */}
      <div className={styles.measure} ref={measureRef} aria-hidden="true" inert>
        {views.map((view) => tabOf(view, true))}
      </div>
    </div>
  );
}
