"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/atoms/Input/Input";
import { NativeSelect } from "@/components/ui/atoms/NativeSelect/NativeSelect";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import {
  BURN_VIEWS,
  CYCLE_BY,
  CYCLE_VIEWS,
  DISTRIBUTION_CHARTS,
  FLOW_BY,
  GROUP_FIELDS,
  type GroupField,
  ISSUE_SORTS,
  KPI_METRICS,
  MATRIX_FIELDS,
  MEASURES,
  type Measure,
  SERIES_CHARTS,
  type SeriesChart,
  TIME_BY,
  type TimeBy,
  WIDGETS,
  type Widget,
  type WidgetConfig,
} from "@/features/dashboard/widgets";
import styles from "../WidgetSettings/widgetSettings.module.scss";

/**
 * What a widget of a kind counts and how it draws — the metric, the
 * measure, the grouping, the chart. A widget's settings and each block of a
 * custom widget (BARY-170) show the same fields.
 */
export function KindFields({
  widget,
  set,
}: {
  widget: Widget;
  set: (patch: Partial<WidgetConfig>) => void;
}) {
  const t = useTranslations("widgets");
  const def = WIDGETS[widget.type];
  const { config } = widget;
  const fieldItems = (fields: readonly GroupField[]) =>
    fields.map((f) => ({ value: f, label: t(`group_${f}`) }));

  return (
    <>
      {/* What is added up — issues, story points or hours (BARY-170). */}
      {(widget.type === "kpi"
        ? config.metric !== "cycleTime"
        : ["progress", "distribution", "matrix", "flow"].includes(
            widget.type,
          )) && (
        <NativeSelect
          label={t("measure")}
          value={config.measure ?? "count"}
          onChange={(v) =>
            set({ measure: v === "count" ? undefined : (v as Measure) })
          }
          items={MEASURES.map((m) => ({
            value: m,
            label: t(`measure_${m}`),
          }))}
        />
      )}

      {widget.type === "flow" && (
        <>
          <NativeSelect
            label={t("timeAxis")}
            value={config.timeBy ?? "createdClosed"}
            onChange={(v) =>
              set({
                timeBy: v === "createdClosed" ? undefined : (v as TimeBy),
                ...(v === "createdClosed" && { splitBy: undefined }),
              })
            }
            items={TIME_BY.map((x) => ({
              value: x,
              label: t(`timeBy_${x}`),
            }))}
          />
          {(config.timeBy ?? "createdClosed") !== "createdClosed" && (
            <NativeSelect
              label={t("splitBy")}
              value={config.splitBy ?? ""}
              onChange={(v) =>
                set({
                  splitBy: v ? (v as WidgetConfig["splitBy"]) : undefined,
                })
              }
              items={[
                { value: "", label: t("splitNone") },
                ...GROUP_FIELDS.map((f) => ({
                  value: f,
                  label: t(`group_${f}`),
                })),
              ]}
            />
          )}
          <div className={styles.field}>
            <span className={styles.label}>{t("chart")}</span>
            <span className={styles.full}>
              <SegmentedControl
                variant="surface"
                value={config.seriesChart ?? "bars"}
                onChange={(v) =>
                  set({
                    seriesChart: v === "bars" ? undefined : (v as SeriesChart),
                  })
                }
                items={SERIES_CHARTS.filter(
                  (c) =>
                    c !== "stacked" ||
                    (config.timeBy ?? "createdClosed") === "createdClosed" ||
                    !!config.splitBy,
                ).map((c) => ({ value: c, label: t(`seriesChart_${c}`) }))}
              />
            </span>
          </div>
        </>
      )}

      {widget.type === "kpi" && (
        <NativeSelect
          label={t("metric")}
          value={config.metric ?? "open"}
          onChange={(v) => set({ metric: v as WidgetConfig["metric"] })}
          items={KPI_METRICS.map((m) => ({
            value: m,
            label: t(`metric_${m}`),
          }))}
        />
      )}

      {widget.type === "distribution" && (
        <>
          <NativeSelect
            label={t("groupBy")}
            value={config.groupBy ?? "status"}
            onChange={(v) => set({ groupBy: v as WidgetConfig["groupBy"] })}
            items={fieldItems(GROUP_FIELDS)}
          />
          <div className={styles.field}>
            <span className={styles.label}>{t("chart")}</span>
            <span className={styles.full}>
              <SegmentedControl
                variant="surface"
                value={config.chart ?? "ring"}
                onChange={(v) => set({ chart: v as WidgetConfig["chart"] })}
                items={DISTRIBUTION_CHARTS.map((c) => ({
                  value: c,
                  label: t(`chart_${c}`),
                }))}
              />
            </span>
          </div>
        </>
      )}

      {widget.type === "matrix" && (
        <>
          <NativeSelect
            label={t("rows")}
            value={config.groupBy ?? "assignee"}
            onChange={(v) => set({ groupBy: v as WidgetConfig["groupBy"] })}
            items={fieldItems(MATRIX_FIELDS)}
          />
          <NativeSelect
            label={t("columns")}
            value={config.groupBy2 ?? "status"}
            onChange={(v) => set({ groupBy2: v as WidgetConfig["groupBy2"] })}
            items={fieldItems(MATRIX_FIELDS)}
          />
        </>
      )}

      {widget.type === "issues" && (
        <NativeSelect
          label={t("sort")}
          value={config.sort ?? "updated"}
          onChange={(v) => set({ sort: v as WidgetConfig["sort"] })}
          items={ISSUE_SORTS.map((s) => ({
            value: s,
            label: t(`sort_${s}`),
          }))}
        />
      )}

      {(widget.type === "distribution" ||
        widget.type === "matrix" ||
        widget.type === "issues") && (
        <div className={styles.row}>
          <span>{t("openOnly")}</span>
          <Switch
            checked={config.openOnly ?? def.config.openOnly ?? false}
            onChange={(on) => set({ openOnly: on })}
            label={t("openOnly")}
            labelHidden
          />
        </div>
      )}

      {/* ── Flow metrics (BARY-171) ── */}
      {widget.type === "burnup" && (
        <>
          <Segments
            label={t("burnView")}
            value={config.burn ?? "up"}
            onChange={(v) => set({ burn: v === "up" ? undefined : v })}
            items={BURN_VIEWS.map((v) => ({ value: v, label: t(`burn_${v}`) }))}
          />
          {config.burn === "down" && (
            <Input
              variant="date"
              label={t("targetDate")}
              hint={t("targetDateHint")}
              value={config.targetDate ?? ""}
              onChange={(e) => set({ targetDate: e.target.value || undefined })}
            />
          )}
        </>
      )}

      {widget.type === "cycle" && (
        <>
          <Segments
            label={t("cycleBy")}
            value={config.cycleBy ?? "lead"}
            onChange={(v) => set({ cycleBy: v === "lead" ? undefined : v })}
            items={CYCLE_BY.map((v) => ({
              value: v,
              label: t(`cycleBy_${v}`),
            }))}
          />
          <Segments
            label={t("chart")}
            value={config.cycleView ?? "points"}
            onChange={(v) => set({ cycleView: v === "points" ? undefined : v })}
            items={CYCLE_VIEWS.map((v) => ({
              value: v,
              label: t(`cycleView_${v}`),
            }))}
          />
        </>
      )}

      {(widget.type === "cfd" || widget.type === "timeInStatus") && (
        <Segments
          label={t("flowBy")}
          value={config.flowBy ?? "category"}
          onChange={(v) => set({ flowBy: v === "category" ? undefined : v })}
          items={FLOW_BY.map((v) => ({ value: v, label: t(`flowBy_${v}`) }))}
        />
      )}

      {widget.type === "cfd" && (
        <div className={styles.row}>
          <span>{t("showDone")}</span>
          <Switch
            checked={!config.hideDone}
            onChange={(on) => set({ hideDone: on ? undefined : true })}
            label={t("showDone")}
            labelHidden
          />
        </div>
      )}
    </>
  );
}

/** A labeled segmented control across the panel's width. */
function Segments<T extends string>({
  label,
  value,
  onChange,
  items,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string }[];
}) {
  return (
    <div className={styles.field}>
      <span className={styles.label}>{label}</span>
      <span className={styles.full}>
        <SegmentedControl
          variant="surface"
          value={value}
          onChange={(v) => onChange(v as T)}
          items={items}
        />
      </span>
    </div>
  );
}
