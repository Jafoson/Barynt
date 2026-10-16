"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { NativeSelect } from "@/components/ui/atoms/NativeSelect/NativeSelect";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import {
  ACCENTS,
  accentOf,
  BACKGROUNDS,
  type ChartLabels,
  DISTRIBUTION_CHARTS,
  GROUP_FIELDS,
  type GroupField,
  ISSUE_SORTS,
  KPI_METRICS,
  labelsOf,
  MATRIX_FIELDS,
  WIDGETS,
  type Widget,
  type WidgetConfig,
} from "@/features/dashboard/widgets";
import { FilterEditor } from "@/features/issues/components/Topbar/components/FilterEditor";
import type { FilterLabelLookups } from "@/features/issues/components/Topbar/filterLabels";
import { EMPTY_FILTER } from "@/features/issues/filter";
import { useModal } from "@/lib/context";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import widgetStyles from "../Widget/widget.module.scss";
import styles from "./widgetSettings.module.scss";

interface Props {
  widget: Widget;
  /** What the widget is called right now — the title field's placeholder. */
  title: string;
  lookups: FilterLabelLookups;
  area: "project" | "my";
  sheet: boolean;
  /** Every change applies at once — the dashboard behind redraws live. */
  onChange: (widget: Widget) => void;
  onRemove: () => void;
  onMove: (by: -1 | 1) => void;
  close: () => void;
}

/**
 * A widget's settings — the side panel (a sheet on a phone) that opens on a
 * click in edit mode. What it offers depends on the kind: what a number
 * counts, what a chart groups by, how a list sorts; then for every kind
 * that reads issues its own filter, for charts the labels, and for all the
 * background and accent.
 */
export function WidgetSettings({
  widget: initial,
  title,
  lookups,
  area,
  sheet,
  onChange,
  onRemove,
  onMove,
  close,
}: Props) {
  const t = useTranslations("widgets");
  const { openModal } = useModal();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);
  const [widget, setWidget] = useState(initial);
  const def = WIDGETS[widget.type];
  const { config } = widget;

  const apply = (next: Widget) => {
    setWidget(next);
    onChange(next);
  };
  const set = (patch: Partial<WidgetConfig>) =>
    apply({ ...widget, config: { ...widget.config, ...patch } });
  const setLabel = (key: keyof ChartLabels, on: boolean) =>
    set({ labels: { ...labelsOf(widget), [key]: on } });

  const filterCount = config.filter?.rules.length ?? 0;

  const editFilter = () =>
    openModal(
      ({ close: done }) => (
        <Modal width={640} variant={sheet ? "sheet" : "dialog"}>
          <ModalHeader
            title={t("filterFor", { name: title })}
            leading={<Icon icon="lucide:filter" width={16} />}
            onClose={done}
            closeLabel={t("done")}
          />
          <ModalBody>
            <FilterEditor
              filter={widget.config.filter ?? EMPTY_FILTER}
              onChange={(filter) =>
                set({ filter: filter.rules.length ? filter : undefined })
              }
              lookups={lookups}
              area={area}
              onDone={done}
            />
          </ModalBody>
        </Modal>
      ),
      sheet ? { placement: "bottom" } : undefined,
    );

  const fieldItems = (fields: readonly GroupField[]) =>
    fields.map((f) => ({ value: f, label: t(`group_${f}`) }));

  return (
    <Modal
      variant={sheet ? "sheet" : "panel"}
      width={380}
      style={sheet ? swipe.style : undefined}
      {...(sheet ? swipe.handlers : {})}
    >
      {sheet ? (
        <SheetHeader title={title} onClose={close} closeLabel={t("done")} />
      ) : (
        <ModalHeader
          title={title}
          leading={<Icon icon={def.icon} width={16} />}
          onClose={close}
          closeLabel={t("done")}
        />
      )}

      <ModalBody ref={bodyRef} className={styles.body}>
        <label className={styles.field}>
          <span className={styles.label}>{t("title")}</span>
          <input
            className={styles.input}
            value={config.title ?? ""}
            placeholder={title}
            maxLength={80}
            onChange={(e) => set({ title: e.target.value || undefined })}
          />
        </label>

        {def.sizes.length > 1 && (
          <div className={styles.field}>
            <span className={styles.label}>{t("size")}</span>
            <span className={styles.full}>
              <SegmentedControl
                variant="surface"
                value={widget.size}
                onChange={(size) =>
                  apply({ ...widget, size: size as Widget["size"] })
                }
                items={def.sizes.map((s) => ({
                  value: s,
                  label: t(`size_${s}`),
                }))}
              />
            </span>
          </div>
        )}

        {/* ── What it shows ── */}
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

        {widget.type === "note" && (
          <label className={styles.field}>
            <span className={styles.label}>{t("text")}</span>
            <textarea
              className={styles.textarea}
              value={config.text ?? ""}
              rows={6}
              maxLength={2000}
              onChange={(e) => set({ text: e.target.value || undefined })}
            />
          </label>
        )}

        {def.issues && (
          <div className={styles.field}>
            <span className={styles.label}>{t("filter")}</span>
            <div className={styles.filterRow}>
              <Button
                variant="elevated"
                size="sm"
                icon={<Icon icon="lucide:filter" width={14} />}
                onClick={editFilter}
              >
                {filterCount
                  ? t("filterCount", { count: filterCount })
                  : t("filterAdd")}
              </Button>
              {filterCount > 0 && (
                <Button
                  variant="text"
                  size="sm"
                  onClick={() => set({ filter: undefined })}
                >
                  {t("filterClear")}
                </Button>
              )}
            </div>
            <span className={styles.help}>{t("filterHelp")}</span>
          </div>
        )}

        {/* ── How it looks ── */}
        {def.chart && (
          <div className={styles.field}>
            <span className={styles.label}>{t("labels")}</span>
            {(["legend", "axes", "values"] as const).map((key) => (
              <div key={key} className={styles.row}>
                <span>{t(`label_${key}`)}</span>
                <Switch
                  checked={labelsOf(widget)[key]}
                  onChange={(on) => setLabel(key, on)}
                  label={t(`label_${key}`)}
                  labelHidden
                />
              </div>
            ))}
          </div>
        )}

        <fieldset className={styles.field}>
          <legend className={styles.label}>{t("background")}</legend>
          <div className={styles.backgrounds}>
            {BACKGROUNDS.map((bg) => {
              const disabled = bg === "fill" && !def.fill;
              return (
                <button
                  key={bg}
                  type="button"
                  className={`${styles.bgChoice} ${widgetStyles.accent}`}
                  data-bg={bg}
                  data-accent={accentOf(widget)}
                  aria-pressed={(config.background ?? "plain") === bg}
                  disabled={disabled}
                  title={disabled ? t("fillNotHere") : undefined}
                  onClick={() => set({ background: bg })}
                >
                  {t(`bg_${bg}`)}
                </button>
              );
            })}
          </div>
          {!def.fill && <span className={styles.help}>{t("fillNotHere")}</span>}
        </fieldset>

        <fieldset className={styles.field}>
          <legend className={styles.label}>{t("accent")}</legend>
          <div className={styles.swatches}>
            {ACCENTS.map((accent) => (
              <button
                key={accent}
                type="button"
                className={`${styles.swatch} ${widgetStyles.accent}`}
                data-accent={accent}
                aria-pressed={accentOf(widget) === accent}
                aria-label={t(`accent_${accent}`)}
                title={t(`accent_${accent}`)}
                onClick={() => set({ accent })}
              />
            ))}
          </div>
        </fieldset>
      </ModalBody>

      <ModalFooter>
        <span className={styles.moves}>
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon icon="lucide:arrow-left" width={15} />}
            aria-label={t("moveEarlier")}
            title={t("moveEarlier")}
            onClick={() => onMove(-1)}
          />
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon icon="lucide:arrow-right" width={15} />}
            aria-label={t("moveLater")}
            title={t("moveLater")}
            onClick={() => onMove(1)}
          />
        </span>
        <Button
          variant="text"
          size="sm"
          className={styles.danger}
          icon={<Icon icon="lucide:trash-2" width={14} />}
          onClick={onRemove}
        >
          {t("remove")}
        </Button>
        <Button variant="primary" size="sm" onClick={close}>
          {t("done")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
