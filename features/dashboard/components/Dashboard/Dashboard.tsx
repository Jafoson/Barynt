"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { SplitButton } from "@/components/ui/atoms/SplitButton/SplitButton";
import { RangePicker } from "@/components/ui/charts/RangePicker/RangePicker";
import { ScopePicker } from "@/components/ui/charts/ScopePicker/ScopePicker";
import {
  loadWidgetData,
  resetDashboardWidgets,
  saveDashboardNote,
  saveDashboardWidgets,
  setDashboardPrefs,
} from "@/features/dashboard/actions";
import type { DashboardScope } from "@/features/dashboard/scope";
import type { DashboardView, WidgetDataMap } from "@/features/dashboard/types";
import {
  moveWidgetTo,
  type NotePage,
  WIDGETS,
  type Widget as WidgetModel,
} from "@/features/dashboard/widgets";
import type { FilterLabelLookups } from "@/features/issues/components/Topbar/filterLabels";
import { useOpenViewModal } from "@/features/views/useOpenViewModal";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { RangeKey } from "@/lib/buckets";
import { useModal } from "@/lib/context";
import { setFabAction } from "@/lib/fab-action";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { NoteContext } from "../NoteContext/NoteContext";
import { useWidgetTitle, Widget } from "../Widget/Widget";
import { WidgetGallery } from "../WidgetGallery/WidgetGallery";
import { WidgetSettings } from "../WidgetSettings/WidgetSettings";
import styles from "./dashboard.module.scss";

interface Props {
  view: DashboardView;
  issueBase: string;
  workspaceSlug: string;
  /** For the widget filter editor. */
  lookups: FilterLabelLookups;
  /** "my": across projects, so project is a filter field too. */
  area: "project" | "my";
  /** What "Save as new view" needs: where the view would live, whether it
   *  may be shared, and (for a dashboard view) the filter it takes along. */
  newView: {
    workspaceId: string;
    projectId: string | null;
    projectSlug: string | null;
    canShare: boolean;
    currentParams: Record<string, string>;
  };
}

/** Changes that need fresh numbers from the server — the rest is drawing. */
const DATA_KEYS = [
  "metric",
  "groupBy",
  "groupBy2",
  "openOnly",
  "sort",
  "filter",
] as const;

const needsData = (a: WidgetModel, b: WidgetModel) =>
  a.type !== b.type ||
  DATA_KEYS.some(
    (key) => JSON.stringify(a.config[key]) !== JSON.stringify(b.config[key]),
  );

/**
 * A dashboard of widgets in fixed sizes on a square grid (BARY-169) —
 * 8 columns on a wide screen, 6, 4 on a tablet, 2 on a phone; the same
 * order everywhere, gaps fill themselves.
 *
 * "Edit" works like the home screen on iOS: the widgets wiggle, "✕"
 * removes one, the switch at the bottom changes its size, dragging moves
 * it, a click opens its settings.
 *
 * Edit mode carries its own way out, like a view's save bar (BARY-164):
 * Cancel, Save as new view and Save — for oneself, and with
 * `dashboard.manage` also as the default for everyone. A dashboard view
 * saves into the view if the person may change it; otherwise only a new
 * view remains.
 */
export function Dashboard({
  view,
  issueBase,
  workspaceSlug,
  lookups,
  area,
  newView,
}: Props) {
  const t = useTranslations("widgets");
  const td = useTranslations("dashboard");
  const router = useRouter();
  const pathname = usePathname();
  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const titleOf = useWidgetTitle();
  const { target, layout } = view;

  const [editing, setEditing] = useState(false);
  // What's stored — the server's layout, plus notes typed in place since.
  const [saved, setSaved] = useState<WidgetModel[]>(layout.widgets);
  const [draft, setDraft] = useState<WidgetModel[]>(layout.widgets);
  const [data, setData] = useState<WidgetDataMap>(view.data);
  const [pending, startTransition] = useTransition();
  /** A widget just added: scrolled to and focused once it's on screen. */
  const [focusId, setFocusId] = useState<string | null>(null);
  /** Marks the new widget for a short highlight. */
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const dragId = useRef<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const openViewModal = useOpenViewModal();
  // The draft is what shows while editing; leaving edit mode either saves
  // it or throws it away.
  const widgets = editing ? draft : saved;
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const canSave = target.kind !== "view" || layout.canEdit;

  const fetchData = (list: WidgetModel[]) => {
    if (list.length === 0) return;
    void loadWidgetData(target, list, view.range, view.scope).then((next) => {
      if (next) setData((current) => ({ ...current, ...next }));
    });
  };

  /** Debounced per widget — typing a filter value shouldn't fire a request
   *  per keystroke. */
  const refetch = (widget: WidgetModel) => {
    const timer = timers.current.get(widget.id);
    if (timer) clearTimeout(timer);
    timers.current.set(
      widget.id,
      setTimeout(() => fetchData([widget]), 350),
    );
  };

  const update = (next: WidgetModel) => {
    setDraft((list) => {
      const before = list.find((w) => w.id === next.id);
      if (before && needsData(before, next)) refetch(next);
      return list.map((w) => (w.id === next.id ? next : w));
    });
  };

  const remove = (id: string) =>
    setDraft((list) => list.filter((w) => w.id !== id));

  const shift = (id: string, by: -1 | 1) =>
    setDraft((list) => {
      const from = list.findIndex((w) => w.id === id);
      const to = from + by;
      if (from < 0 || to < 0 || to >= list.length) return list;
      return moveWidgetTo(list, id, list[to].id);
    });

  const discard = () => {
    setEditing(false);
    setDraft(saved);
  };

  const save = (level: "personal" | "shared") =>
    startTransition(async () => {
      await saveDashboardWidgets(target, draft, level);
      setEditing(false);
      router.refresh();
    });

  const reset = (level: "personal" | "shared") =>
    startTransition(async () => {
      await resetDashboardWidgets(target, level);
      setEditing(false);
      router.refresh();
    });

  const resetLevel: "personal" | "shared" | null =
    target.kind === "view"
      ? null
      : layout.personal
        ? "personal"
        : layout.canEditShared && layout.hasShared && view.scope === "all"
          ? "shared"
          : null;

  const saveAsView = () =>
    openViewModal({ ...newView, initialLayout: "dashboard", widgets: draft });

  const openSettings = (widget: WidgetModel) =>
    openModal(
      ({ close }) => (
        <WidgetSettings
          widget={widget}
          data={data[widget.id]}
          title={titleOf(widget)}
          lookups={lookups}
          area={area}
          sheet={isPhone}
          onChange={update}
          onRemove={() => {
            remove(widget.id);
            close();
          }}
          onMove={(by) => shift(widget.id, by)}
          close={close}
        />
      ),
      isPhone ? { placement: "bottom" } : { placement: "right" },
    );

  const openGallery = () =>
    openModal(
      ({ close }) => (
        <WidgetGallery
          unit={view.unit}
          issueBase={issueBase}
          workspaceSlug={workspaceSlug}
          kind={target.kind}
          sheet={isPhone}
          onAdd={(widget) => {
            setDraft((list) => [...list, widget]);
            fetchData([widget]);
            close();
            setFocusId(widget.id);
            setJustAdded(widget.id);
          }}
          close={close}
        />
      ),
      isPhone ? { placement: "bottom" } : { width: 960, centered: true },
    );

  // Edit mode on a phone or tablet: the floating plus adds widgets.
  const openGalleryRef = useRef(openGallery);
  openGalleryRef.current = openGallery;
  useEffect(() => {
    if (!editing) return;
    setFabAction({
      label: t("add"),
      text: t("addShort"),
      icon: "lucide:plus",
      variant: "elevated",
      run: () => openGalleryRef.current(),
    });
    return () => setFabAction(null);
  }, [editing, t]);

  // After the gallery closes (and hands focus back to its trigger), move
  // focus to the new widget and bring it into view. A frame later, so the
  // dialog's own focus restore has run first.
  useEffect(() => {
    if (!focusId) return;
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const cell = document.querySelector<HTMLElement>(
          `[data-widget-id="${focusId}"]`,
        );
        cell?.scrollIntoView({ block: "center", behavior: "smooth" });
        cell
          ?.querySelector<HTMLElement>("button")
          ?.focus({ preventScroll: true });
        setFocusId(null);
      }),
    );
    return () => cancelAnimationFrame(frame);
  }, [focusId]);

  // The highlight ends; the widget wiggles along with the rest again.
  useEffect(() => {
    if (!justAdded) return;
    const timer = setTimeout(() => setJustAdded(null), 1500);
    return () => clearTimeout(timer);
  }, [justAdded]);

  // Notes are written in place, outside edit mode — saved a moment after
  // the last keystroke, per widget.
  const noteTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const savedRef = useRef(saved);
  savedRef.current = saved;
  const noteContext = {
    canWrite: target.kind !== "view" || layout.canEdit,
    save: (widgetId: string, pages: NotePage[]) => {
      const next = savedRef.current.map((w) =>
        w.id === widgetId
          ? { ...w, config: { ...w.config, pages, text: undefined } }
          : w,
      );
      savedRef.current = next;
      setSaved(next);
      const timer = noteTimers.current.get(widgetId);
      if (timer) clearTimeout(timer);
      noteTimers.current.set(
        widgetId,
        setTimeout(() => {
          void saveDashboardNote(target, savedRef.current, widgetId, pages);
        }, 700),
      );
    },
  };

  const navigate = (patch: { range?: RangeKey; scope?: DashboardScope }) => {
    const params = new URLSearchParams(window.location.search);
    if (patch.range) params.set("range", patch.range);
    if (patch.scope) params.set("scope", patch.scope);
    startTransition(async () => {
      router.replace(`${pathname}?${params}`);
      await setDashboardPrefs(target, patch);
    });
  };

  // The phone's edit bar, pinned to the bottom (BARY-169): cancel on the
  // left, save on the right — the other ways to save behind its arrow.
  const phoneBar = editing && (
    <div className={styles.phoneBar}>
      {!dirty && resetLevel ? (
        <Button
          variant="text"
          className={styles.reset}
          icon={<Icon icon="lucide:rotate-ccw" width={14} />}
          onClick={() => reset(resetLevel)}
          disabled={pending}
        >
          {t("reset")}
        </Button>
      ) : (
        dirty && <span className={styles.unsavedPhone}>{t("unsaved")}</span>
      )}
      <span className={styles.spacer} />
      <Button variant="elevated" onClick={discard} disabled={pending}>
        {t("cancel")}
      </Button>
      <SplitButton
        label={canSave ? t("save") : t("saveAsView")}
        onClick={() =>
          canSave
            ? dirty
              ? save("personal")
              : setEditing(false)
            : saveAsView()
        }
        disabled={pending}
        menuLabel={t("saveOptions")}
        items={[
          ...(canSave && target.kind !== "view"
            ? [
                {
                  value: "personal",
                  label: t("savePersonal"),
                  icon: <Icon icon="lucide:user" width={15} />,
                },
              ]
            : []),
          ...(layout.canEditShared &&
          target.kind !== "view" &&
          view.scope === "all"
            ? [
                {
                  value: "shared",
                  label: t("saveShared"),
                  icon: <Icon icon="lucide:users" width={15} />,
                },
              ]
            : []),
          {
            value: "view",
            label: t("saveAsView"),
            icon: <Icon icon="lucide:layers" width={15} />,
          },
        ]}
        onPick={(value) => {
          if (value === "view") saveAsView();
          else if (value === "shared")
            dirty ? save("shared") : setEditing(false);
          else if (value === "personal")
            dirty ? save("personal") : setEditing(false);
        }}
      />
    </div>
  );

  // Edit mode's own actions, always there while editing: cancel, a new
  // view from this arrangement, and save — for oneself, and with
  // `dashboard.manage` as the default for everyone.
  const editActions = (
    <span className={styles.saveBar}>
      {dirty && <span className={styles.unsaved}>{t("unsaved")}</span>}
      <Button variant="ghost" size="sm" onClick={discard} disabled={pending}>
        {t("cancel")}
      </Button>
      <Button
        variant={canSave ? "elevated" : "primary"}
        size="sm"
        icon={<Icon icon="lucide:plus" width={14} />}
        onClick={saveAsView}
        disabled={pending}
      >
        {t("saveAsView")}
      </Button>
      {layout.canEditShared &&
        target.kind !== "view" &&
        view.scope === "all" && (
          <Button
            variant="elevated"
            size="sm"
            icon={<Icon icon="lucide:users" width={14} />}
            onClick={() => (dirty ? save("shared") : setEditing(false))}
            disabled={pending}
            title={t("hintShared")}
          >
            {t("saveShared")}
          </Button>
        )}
      {canSave && (
        <Button
          variant="primary"
          size="sm"
          // Nothing changed: just leave — writing the unchanged layout as
          // one's own would freeze the default for this person.
          onClick={() => (dirty ? save("personal") : setEditing(false))}
          disabled={pending}
          title={target.kind === "view" ? t("hintView") : t("hintPersonal")}
        >
          {target.kind === "view" ? t("save") : t("savePersonal")}
        </Button>
      )}
    </span>
  );

  return (
    <div className={styles.page} data-editing={editing || undefined}>
      <div className={styles.toolbar}>
        {editing ? (
          <>
            <Button
              variant="primary"
              size="sm"
              icon={<Icon icon="lucide:plus" width={15} />}
              onClick={openGallery}
            >
              {t("add")}
            </Button>
            <span className={styles.hint}>{t("hintEdit")}</span>
            <span className={styles.spacer} />
            {/* One way back: one's own layout to the default, or — with
                nothing of one's own — the default to the built-in one. */}
            {!dirty && resetLevel && (
              <Button
                variant="text"
                size="sm"
                className={styles.reset}
                icon={<Icon icon="lucide:rotate-ccw" width={14} />}
                onClick={() => reset(resetLevel)}
                disabled={pending}
                title={t(
                  resetLevel === "shared" ? "resetShared" : "resetPersonal",
                )}
              >
                {t("reset")}
              </Button>
            )}
            {editActions}
          </>
        ) : (
          <>
            <span className={styles.range}>
              <RangePicker
                value={view.range}
                onChange={(range) => navigate({ range })}
                label={td("range")}
                labelFor={(range) => td(`range_${range}`)}
              />
            </span>
            {view.canViewAll ? (
              <span className={styles.scope}>
                <ScopePicker
                  value={view.scope}
                  onChange={(scope) => navigate({ scope })}
                  label={td("scope")}
                  labelFor={(scope) => td(`scope_${scope}`)}
                />
              </span>
            ) : (
              <span className={styles.hint}>{td("scopeMineHint")}</span>
            )}
            <span className={styles.spacer} />
            {layout.personal && (
              <span className={styles.personal} title={t("personalBadge")}>
                <Icon icon="lucide:user-pen" width={13} />
                <span className={styles.personalText}>
                  {t("personalBadge")}
                </span>
              </span>
            )}
            {/* On a phone just the icon — the row has no room for words. */}
            <span className={styles.notPhone}>
              <Button
                variant="elevated"
                size="sm"
                icon={<Icon icon="lucide:layout-dashboard" width={15} />}
                onClick={() => {
                  setDraft(saved);
                  setEditing(true);
                }}
              >
                {t("edit")}
              </Button>
            </span>
            <span className={styles.onlyPhone}>
              <Button
                variant="elevated"
                size="sm"
                icon={<Icon icon="lucide:pencil" width={16} />}
                aria-label={t("edit")}
                title={t("edit")}
                onClick={() => {
                  setDraft(saved);
                  setEditing(true);
                }}
              />
            </span>
          </>
        )}
      </div>

      <NoteContext.Provider value={noteContext}>
        <div className={styles.frame}>
          <ul className={styles.grid}>
            {widgets.map((widget, index) => (
              <li
                key={widget.id}
                className={styles.cell}
                data-size={widget.size}
                data-widget-id={widget.id}
                data-new={widget.id === justAdded || undefined}
                draggable={editing}
                onDragStart={(event) => {
                  dragId.current = widget.id;
                  event.dataTransfer.effectAllowed = "move";
                }}
                onDragOver={(event) => {
                  if (!editing || !dragId.current) return;
                  event.preventDefault();
                  if (dragId.current !== widget.id) {
                    const from = dragId.current;
                    setDraft((list) => moveWidgetTo(list, from, widget.id));
                  }
                }}
                onDragEnd={() => {
                  dragId.current = null;
                }}
              >
                <Widget
                  widget={widget}
                  data={data[widget.id]}
                  unit={view.unit}
                  issueBase={issueBase}
                  workspaceSlug={workspaceSlug}
                />
                {editing && (
                  <>
                    {/* The whole widget opens its settings; the two controls
                      sit above that layer. */}
                    <button
                      type="button"
                      className={styles.cover}
                      aria-label={t("settingsFor", { name: titleOf(widget) })}
                      onClick={() => openSettings(widget)}
                    />
                    <Button
                      variant="elevated"
                      size="sm"
                      className={styles.remove}
                      icon={<Icon icon="lucide:x" width={14} />}
                      aria-label={t("removeNamed", { name: titleOf(widget) })}
                      title={t("remove")}
                      onClick={() => remove(widget.id)}
                    />
                    {/* Touch: no dragging — move with the arrows instead. */}
                    <fieldset className={styles.moves} aria-label={t("move")}>
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Icon icon="lucide:arrow-up" width={14} />}
                        aria-label={t("moveEarlier")}
                        title={t("moveEarlier")}
                        disabled={index === 0}
                        onClick={() => shift(widget.id, -1)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Icon icon="lucide:arrow-down" width={14} />}
                        aria-label={t("moveLater")}
                        title={t("moveLater")}
                        disabled={index === widgets.length - 1}
                        onClick={() => shift(widget.id, 1)}
                      />
                    </fieldset>
                    {WIDGETS[widget.type].sizes.length > 1 && (
                      <fieldset className={styles.sizes} aria-label={t("size")}>
                        <SegmentedControl
                          variant="surface"
                          value={widget.size}
                          onChange={(size) =>
                            update({
                              ...widget,
                              size: size as typeof widget.size,
                            })
                          }
                          items={WIDGETS[widget.type].sizes.map((size) => ({
                            value: size,
                            label: t(`sizeShort_${size}`),
                          }))}
                        />
                      </fieldset>
                    )}
                  </>
                )}
              </li>
            ))}
            {editing && (
              <li className={styles.addCell}>
                <button
                  type="button"
                  className={styles.addTile}
                  onClick={openGallery}
                >
                  <Icon icon="lucide:plus" width={22} />
                  {t("add")}
                </button>
              </li>
            )}
          </ul>
          {widgets.length === 0 && !editing && (
            <div className={styles.emptyPage}>
              <p>{t("emptyDashboard")}</p>
              <Button
                variant="primary"
                onClick={() => {
                  setDraft(saved);
                  setEditing(true);
                }}
              >
                {t("edit")}
              </Button>
            </div>
          )}
        </div>
      </NoteContext.Provider>
      {phoneBar}
    </div>
  );
}
