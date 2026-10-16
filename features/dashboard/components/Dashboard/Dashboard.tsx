"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
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
 * "Edit" works like the home screen on iOS: the widgets wiggle, "−"
 * removes one, the pill at the bottom switches its size, dragging moves
 * it, a click opens its settings. Nothing is stored until "Done" — for
 * oneself, or (admins) as the default for everyone.
 */
export function Dashboard({
  view,
  issueBase,
  workspaceSlug,
  lookups,
  area,
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
  const [level, setLevel] = useState<"personal" | "shared">(
    layout.canEditShared && !layout.personal ? "shared" : "personal",
  );
  const [pending, startTransition] = useTransition();
  const dragId = useRef<string | null>(null);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const widgets = editing ? draft : layout.widgets;

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

  const startEditing = () => {
    setDraft(layout.widgets);
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft(layout.widgets);
  };

  const done = () =>
    startTransition(async () => {
      await saveDashboardWidgets(target, draft, level);
      setEditing(false);
      router.refresh();
    });

  const reset = () =>
    startTransition(async () => {
      await resetDashboardWidgets(target, level);
      setEditing(false);
      router.refresh();
    });

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

  const canReset =
    target.kind !== "view" &&
    (level === "personal" ? layout.personal : layout.hasShared);

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
            {layout.canEditShared && target.kind !== "view" && (
              <span className={styles.level}>
                <SegmentedControl
                  variant="surface"
                  value={level}
                  onChange={(v) => setLevel(v as "personal" | "shared")}
                  items={[
                    { value: "personal", label: t("levelPersonal") },
                    { value: "shared", label: t("levelShared") },
                  ]}
                />
              </span>
            )}
            <span className={styles.hint}>
              {target.kind === "view"
                ? t("hintView")
                : level === "shared"
                  ? t("hintShared")
                  : t("hintPersonal")}
            </span>
            <span className={styles.spacer} />
            {canReset && (
              <Button
                variant="text"
                size="sm"
                onClick={reset}
                disabled={pending}
              >
                {t(level === "shared" ? "resetShared" : "resetPersonal")}
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={cancel}
              disabled={pending}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={done}
              disabled={pending}
            >
              {t("done")}
            </Button>
          </>
        ) : (
          <>
            <RangePicker
              value={view.range}
              onChange={(range) => navigate({ range })}
              label={td("range")}
              labelFor={(range) => td(`range_${range}`)}
            />
            {view.canViewAll ? (
              <ScopePicker
                value={view.scope}
                onChange={(scope) => navigate({ scope })}
                label={td("scope")}
                labelFor={(scope) => td(`scope_${scope}`)}
              />
            ) : (
              <span className={styles.hint}>{td("scopeMineHint")}</span>
            )}
            <span className={styles.spacer} />
            {layout.personal && (
              <Badge size="sm" mono={false}>
                {t("personalBadge")}
              </Badge>
            )}
            {layout.canEdit && (
              <Button
                variant="elevated"
                size="sm"
                icon={<Icon icon="lucide:layout-dashboard" width={15} />}
                onClick={startEditing}
              >
                {t("edit")}
              </Button>
            )}
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
            {layout.canEdit && (
              <Button variant="primary" onClick={startEditing}>
                {t("edit")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
