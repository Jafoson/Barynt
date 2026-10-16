"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { RangePicker } from "@/components/ui/charts/RangePicker/RangePicker";
import { ScopePicker } from "@/components/ui/charts/ScopePicker/ScopePicker";
import {
  loadWidgetData,
  resetDashboardWidgets,
  saveDashboardWidgets,
  setDashboardPrefs,
} from "@/features/dashboard/actions";
import type { DashboardScope } from "@/features/dashboard/scope";
import type { DashboardView, WidgetDataMap } from "@/features/dashboard/types";
import {
  moveWidgetTo,
  WIDGETS,
  type Widget as WidgetModel,
} from "@/features/dashboard/widgets";
import type { FilterLabelLookups } from "@/features/issues/components/Topbar/filterLabels";
import { useOpenViewModal } from "@/features/views/useOpenViewModal";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { RangeKey } from "@/lib/buckets";
import { useModal } from "@/lib/context";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
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
  const [draft, setDraft] = useState<WidgetModel[]>(layout.widgets);
  const [data, setData] = useState<WidgetDataMap>(view.data);
  const [pending, startTransition] = useTransition();
  const dragId = useRef<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const openViewModal = useOpenViewModal();
  // The draft is what shows while editing; leaving edit mode either saves
  // it or throws it away.
  const widgets = editing ? draft : layout.widgets;
  const dirty = JSON.stringify(draft) !== JSON.stringify(layout.widgets);
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
    setDraft(layout.widgets);
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
        : layout.canEditShared && layout.hasShared
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
          }}
          close={close}
        />
      ),
      isPhone ? { placement: "bottom" } : { width: 960, centered: true },
    );

  const navigate = (patch: { range?: RangeKey; scope?: DashboardScope }) => {
    const params = new URLSearchParams(window.location.search);
    if (patch.range) params.set("range", patch.range);
    if (patch.scope) params.set("scope", patch.scope);
    startTransition(async () => {
      router.replace(`${pathname}?${params}`);
      await setDashboardPrefs(target, patch);
    });
  };

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
      {layout.canEditShared && target.kind !== "view" && (
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
            <Button
              variant="elevated"
              size="sm"
              icon={<Icon icon="lucide:layout-dashboard" width={15} />}
              onClick={() => {
                setDraft(layout.widgets);
                setEditing(true);
              }}
            >
              {t("edit")}
            </Button>
          </>
        )}
      </div>

      <div className={styles.frame}>
        <ul className={styles.grid}>
          {widgets.map((widget) => (
            <li
              key={widget.id}
              className={styles.cell}
              data-size={widget.size}
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
                setDraft(layout.widgets);
                setEditing(true);
              }}
            >
              {t("edit")}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
