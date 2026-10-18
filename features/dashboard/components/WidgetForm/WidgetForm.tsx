"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import type { WidgetData } from "@/features/dashboard/types";
import {
  ACCENTS,
  accentOf,
  BACKGROUNDS,
  ELEMENTS,
  WIDGETS,
  type Widget,
  type WidgetConfig,
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

  const apply = onChange;
  const set = (patch: Partial<WidgetConfig>) =>
    apply({ ...widget, config: { ...widget.config, ...patch } });

  const filterCount = config.filter?.rules.length ?? 0;

  /** The filter editor in its own window — for the widget's filter and
   *  for an element's (the second number). */
  const openFilter = (
    current: IssueFilter | undefined,
    save: (filter: IssueFilter | undefined) => void,
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
            />
          </ModalBody>
        </Modal>
      ),
      sheet ? { placement: "bottom" } : undefined,
    );
  const editFilter = () =>
    openFilter(config.filter, (filter) => set({ filter }));

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
