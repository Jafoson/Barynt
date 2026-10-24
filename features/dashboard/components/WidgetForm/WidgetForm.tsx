"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Input } from "@/components/ui/atoms/Input/Input";
import { NativeSelect } from "@/components/ui/atoms/NativeSelect/NativeSelect";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import type { WidgetData } from "@/features/dashboard/types";
import {
  ACCENTS,
  AGE_SORTS,
  ATTENTION_SORTS,
  accentOf,
  BACKGROUNDS,
  ELEMENT_SORTS,
  ELEMENTS,
  elementOf,
  elementsOf,
  ISSUE_SORTS,
  WIDGETS,
  type Widget,
  type WidgetConfig,
  type WidgetElement,
  type WidgetSort,
} from "@/features/dashboard/widgets";
import { FilterEditor } from "@/features/issues/components/Topbar/components/FilterEditor";
import type { FilterLabelLookups } from "@/features/issues/components/Topbar/filterLabels";
import { EMPTY_FILTER, type IssueFilter } from "@/features/issues/filter";
import { useModal } from "@/lib/context";
import widgetStyles from "../Widget/widget.module.scss";
import styles from "../WidgetSettings/widgetSettings.module.scss";
import { BlocksEditor } from "./BlocksEditor";
import { ElementsEditor } from "./ElementsEditor";
import { KindFields } from "./KindFields";
import { ShortcutPicker } from "./ShortcutPicker";

interface Props {
  widget: Widget;
  onChange: (widget: Widget) => void;
  /** What the widget is called right now — the title field's placeholder. */
  title: string;
  lookups: FilterLabelLookups;
  area: "project" | "my";
  sheet: boolean;
  /** What the widget shows right now — the shortcuts it can choose from. */
  data?: WidgetData;
  /** The builder names a custom widget itself — no separate title field. */
  hideTitle?: boolean;
  /** The element whose settings are open — for a preview to mark it. */
  onActiveElement?: (id: string | null) => void;
}

/**
 * A widget's settings as fields — what it counts, how it splits and draws,
 * its own filter, labels, background and accent. The settings panel and the
 * custom-widget builder (BARY-170) both show it.
 */
export function WidgetForm({
  widget,
  onChange,
  title,
  lookups,
  area,
  sheet,
  data,
  hideTitle = false,
  onActiveElement,
}: Props) {
  const t = useTranslations("widgets");
  const { openModal } = useModal();
  const def = WIDGETS[widget.type];
  const [openElement, setOpenElement] = useState<string | null>(null);
  const openOne = (id: string | null) => {
    setOpenElement(id);
    onActiveElement?.(id);
  };
  const { config } = widget;

  // The filter window keeps the `set` it was opened with: reading the
  // latest widget from a ref keeps a change of order there from undoing a
  // filter change made a moment before, and vice versa.
  const latest = useRef(widget);
  latest.current = widget;
  const apply = (next: Widget) => {
    latest.current = next;
    onChange(next);
  };
  const set = (patch: Partial<WidgetConfig>) =>
    apply({
      ...latest.current,
      config: { ...latest.current.config, ...patch },
    });

  const filterCount = config.filter?.rules.length ?? 0;

  /** The filter editor in its own window — for the widget's filter and
   *  for an element's (the second number). */
  const openFilter = (
    current: IssueFilter | undefined,
    save: (filter: IssueFilter | undefined) => void,
    sort?: { extra: React.ReactNode; onCancel: () => void },
  ) =>
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
              filter={current ?? EMPTY_FILTER}
              onChange={(filter) =>
                save(filter.rules.length ? filter : undefined)
              }
              lookups={lookups}
              area={area}
              onDone={done}
              extra={sort?.extra}
              onCancel={sort?.onCancel}
            />
          </ModalBody>
        </Modal>
      ),
      sheet ? { placement: "bottom" } : undefined,
    );
  // Every widget that lists issues sets their order right beside its
  // filter (BARY-182): the widget's own order, or — for a number with a
  // mini list — that element's (the same setting as in its panel).
  const miniList =
    widget.type === "kpi" ? elementOf(widget, "miniList") : undefined;
  const setMiniSort = (sort: string | undefined) =>
    set({
      elements: elementsOf(latest.current).map((e) => {
        if (e.kind !== "miniList") return e;
        const { sort: _old, ...rest } = e;
        return sort && sort !== "priority"
          ? { ...rest, sort: sort as WidgetElement["sort"] }
          : rest;
      }),
      labels: undefined,
    });
  const listSort: {
    options: readonly string[];
    value: string | undefined;
    save: (sort: string | undefined) => void;
  } | null =
    widget.type === "attention" ||
    widget.type === "issues" ||
    widget.type === "age"
      ? {
          options:
            widget.type === "attention"
              ? ATTENTION_SORTS
              : widget.type === "age"
                ? AGE_SORTS
                : ISSUE_SORTS,
          value: config.sort ?? def.config.sort,
          save: (sort) => set({ sort: sort as WidgetConfig["sort"] }),
        }
      : miniList
        ? { options: ELEMENT_SORTS, value: miniList.sort, save: setMiniSort }
        : null;
  const editFilter = () =>
    openFilter(
      config.filter,
      (filter) => set({ filter }),
      listSort
        ? {
            extra: (
              <SortSelect
                label={t("sort")}
                initial={listSort.value ?? listSort.options[0]}
                options={listSort.options.map((s) => ({
                  value: s,
                  label: t(`sort_${s as WidgetSort}`),
                }))}
                onChange={listSort.save}
              />
            ),
            onCancel: () => listSort.save(listSort.value),
          }
        : undefined,
    );

  return (
    <>
      {!hideTitle && (
        <Input
          label={t("title")}
          value={config.title ?? ""}
          placeholder={title}
          maxLength={80}
          onChange={(e) => set({ title: e.target.value || undefined })}
        />
      )}

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
      <KindFields widget={widget} set={set} />

      {widget.type === "shortcuts" && data?.type === "shortcuts" && (
        <ShortcutPicker
          offered={data.items.map((item) => ({
            key: item.key,
            icon: item.icon,
            default: item.default,
          }))}
          chosen={config.shortcuts}
          onChange={(shortcuts) => set({ shortcuts })}
        />
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

      {/* ── A custom widget: its blocks, each with its extras ── */}
      {widget.type === "blocks" && (
        <div className={styles.field}>
          <span className={styles.label}>{t("blocks")}</span>
          <BlocksEditor
            widget={widget}
            onChange={(blocks) => set({ blocks })}
            editFilter={openFilter}
            open={openElement}
            onOpen={openOne}
          />
        </div>
      )}

      {/* ── What sits around it (BARY-170) ── */}
      {ELEMENTS[widget.type] && (
        <div className={styles.field}>
          <span className={styles.label}>{t("elements")}</span>
          <ElementsEditor
            widget={widget}
            onChange={(elements) => set({ elements, labels: undefined })}
            editFilter={openFilter}
            open={openElement}
            onOpen={openOne}
          />
        </div>
      )}

      {/* ── How it looks ── */}
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
    </>
  );
}

/** The order inside the filter window — its own state, since the window
 *  doesn't re-render with the widget. */
function SortSelect({
  label,
  initial,
  options,
  onChange,
}: {
  label: string;
  initial: string;
  options: { value: string; label: string }[];
  onChange: (sort: string) => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <div className={styles.row}>
      <span>{label}</span>
      <NativeSelect
        label={label}
        value={value}
        onChange={(v) => {
          setValue(v);
          onChange(v);
        }}
        items={options}
      />
    </div>
  );
}
