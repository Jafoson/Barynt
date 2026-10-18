"use client";

import { Icon } from "@iconify/react";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import {
  ACCENTS,
  ELEMENT_MIN_SIZES,
  ELEMENT_SORTS,
  ELEMENTS,
  type ElementKind,
  type ElementMinSize,
  type ElementOption,
  type ElementSort,
  type ElementStyle,
  elementDef,
  elementOptions,
  elementsOf,
  fitsSize,
  isPlaced,
  type Widget,
  type WidgetElement,
} from "@/features/dashboard/widgets";
import type { IssueFilter } from "@/features/issues/filter";
import { randomId } from "@/lib/utils/id";
import widgetStyles from "../Widget/widget.module.scss";
import settingsStyles from "../WidgetSettings/widgetSettings.module.scss";
import styles from "./elementsEditor.module.scss";

/** Pace windows for the forecast, in weeks; 0 = the dashboard's range. */
const WEEKS = [0, 2, 4, 8] as const;

interface Props {
  widget: Widget;
  onChange: (elements: WidgetElement[]) => void;
  /** Opens the filter editor for an element's own filter (second number). */
  editFilter: (
    filter: IssueFilter | undefined,
    save: (filter: IssueFilter | undefined) => void,
  ) => void;
  /** The element whose settings are open — the preview marks it. */
  open: string | null;
  onOpen: (id: string | null) => void;
}

/**
 * The widget's elements (BARY-170): what sits around its main part — add
 * from what the kind offers, drag (touch: arrows) to reorder, ✕ to remove.
 * A click on a row opens that element's own settings, one at a time; the
 * line under its name says what's set.
 */
export function ElementsEditor({
  widget,
  onChange,
  editFilter,
  open,
  onOpen,
}: Props) {
  const t = useTranslations("widgets");
  const format = useFormatter();
  const offered = ELEMENTS[widget.type] ?? [];
  const stored = elementsOf(widget);
  // Blocks with a place of their own first, in their order; then the ones
  // that change the main part and stay where they are.
  const placed = stored.filter((e) => isPlaced(widget.type, e.kind));
  const fixed = stored.filter((e) => !isPlaced(widget.type, e.kind));
  const elements = [...placed, ...fixed];
  const movable = placed.length > 1;
  const [dragging, setDragging] = useState<string | null>(null);
  if (offered.length === 0) return null;

  const missing = offered.filter(
    (def) => !elements.some((e) => e.kind === def.kind),
  );
  const update = (id: string, patch: Partial<WidgetElement>) =>
    onChange(
      elements.map((e) => {
        if (e.id !== id) return e;
        const next: WidgetElement = { ...e, ...patch };
        // Unset fields leave the stored element instead of sitting there
        // as `undefined`.
        for (const key of Object.keys(patch) as (keyof WidgetElement)[]) {
          if (next[key] === undefined) delete next[key];
        }
        return next;
      }),
    );
  const remove = (id: string) => {
    if (open === id) onOpen(null);
    onChange(elements.filter((e) => e.id !== id));
  };
  const move = (from: number, to: number) => {
    if (to < 0 || to >= placed.length || from === to) return;
    const next = [...elements];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  const add = (kind: ElementKind) => {
    const def = elementDef(widget.type, kind);
    const id = randomId().slice(0, 8);
    onChange([
      ...elements,
      {
        id,
        kind,
        ...(def?.initial !== undefined && { value: def.initial }),
      },
    ]);
    // Something to set? Open it straight away.
    if (elementOptions(widget.type, kind).length) onOpen(id);
  };

  /** What's set, in a few words — the line under the name. */
  const summary = (e: WidgetElement): string => {
    const parts = elementOptions(widget.type, e.kind).flatMap(
      (option): string[] => {
        switch (option.key) {
          case "value":
            return e.value !== undefined ? [format.number(e.value)] : [];
          case "label":
            return e.label?.trim() ? [`„${e.label.trim()}“`] : [];
          case "date":
            return e.date
              ? [
                  format.dateTime(new Date(`${e.date}T12:00:00Z`), {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "UTC",
                  }),
                ]
              : [];
          case "filter":
            return e.filter?.rules.length
              ? [t("filterCount", { count: e.filter.rules.length })]
              : [];
          case "style":
            return e.style ? [t(`elStyle_${e.style}`)] : [];
          case "sort":
            return e.sort ? [t(`elSort_${e.sort}`)] : [];
          case "flag":
            return e.flag ? [t(`elFlag_${e.kind as "trend"}`)] : [];
          case "weeks":
            return e.value ? [t("elWeeks", { weeks: e.value })] : [];
          default:
            return [];
        }
      },
    );
    if (e.minSize) parts.push(`≥ ${t(`size_${e.minSize}`)}`);
    return parts.length ? parts.join(" · ") : t(`elHint_${e.kind}`);
  };

  /** One setting of the open element. */
  const field = (e: WidgetElement, option: ElementOption, name: string) => {
    const id = `el-${e.id}-${option.key}`;
    switch (option.key) {
      case "value":
        return (
          <Input
            key={option.key}
            id={id}
            variant="number"
            label={optionLabel(option.key, e.kind)}
            min={option.min}
            max={option.max}
            value={e.value ?? ""}
            onChange={(ev) =>
              update(e.id, {
                value:
                  ev.target.value === ""
                    ? undefined
                    : Math.min(
                        option.max,
                        Math.max(option.min, Number(ev.target.value)),
                      ),
              })
            }
          />
        );
      case "date":
        return (
          <Input
            key={option.key}
            id={id}
            variant="date"
            label={t("elOpt_date")}
            value={e.date ?? ""}
            onChange={(ev) =>
              update(e.id, { date: ev.target.value || undefined })
            }
          />
        );
      case "label":
        return (
          <Input
            key={option.key}
            id={id}
            label={optionLabel("label", e.kind)}
            placeholder={t("elLabelPlaceholder")}
            maxLength={40}
            value={e.label ?? ""}
            onChange={(ev) =>
              update(e.id, { label: ev.target.value || undefined })
            }
          />
        );
      case "filter": {
        const rules = e.filter?.rules.length ?? 0;
        return (
          <div key={option.key} className={styles.field}>
            <span className={styles.fieldLabel}>{t("elOpt_filter")}</span>
            <button
              type="button"
              className={styles.chip}
              onClick={() =>
                editFilter(e.filter, (filter) => update(e.id, { filter }))
              }
            >
              <Icon icon="lucide:filter" width={12} />
              {rules ? t("filterCount", { count: rules }) : t("filterAdd")}
            </button>
          </div>
        );
      }
      case "style":
        return (
          <div key={option.key} className={styles.field}>
            <span className={styles.fieldLabel}>{t("elOpt_style")}</span>
            <span className={settingsStyles.full}>
              <SegmentedControl
                variant="surface"
                value={e.style ?? option.choices[0]}
                onChange={(v) => update(e.id, { style: v as ElementStyle })}
                items={option.choices.map((c) => ({
                  value: c,
                  label: t(`elStyle_${c}`),
                }))}
              />
            </span>
          </div>
        );
      case "sort":
        return (
          <div key={option.key} className={styles.field}>
            <span className={styles.fieldLabel}>{t("elOpt_sort")}</span>
            <span className={settingsStyles.full}>
              <SegmentedControl
                variant="surface"
                value={e.sort ?? "priority"}
                onChange={(v) =>
                  update(e.id, {
                    sort: v === "priority" ? undefined : (v as ElementSort),
                  })
                }
                items={ELEMENT_SORTS.map((s) => ({
                  value: s,
                  label: t(`elSort_${s}`),
                }))}
              />
            </span>
          </div>
        );
      case "weeks":
        return (
          <div key={option.key} className={styles.field}>
            <span className={styles.fieldLabel}>{t("elOpt_weeks")}</span>
            <span className={settingsStyles.full}>
              <SegmentedControl
                variant="surface"
                value={String(e.value ?? 0)}
                onChange={(v) =>
                  update(e.id, { value: Number(v) || undefined })
                }
                items={WEEKS.map((w) => ({
                  value: String(w),
                  label: w ? t("elWeeksShort", { weeks: w }) : t("elRange"),
                }))}
              />
            </span>
          </div>
        );
      case "flag":
        return (
          <div key={option.key} className={styles.switchRow}>
            <span>{t(`elFlag_${e.kind as "trend"}`)}</span>
            <Switch
              checked={!!e.flag}
              onChange={(on) => update(e.id, { flag: on || undefined })}
              label={t(`elFlag_${e.kind as "trend"}`)}
              labelHidden
            />
          </div>
        );
      case "color":
        return (
          <div key={option.key} className={styles.field}>
            <span className={styles.fieldLabel}>{t("elOpt_color")}</span>
            <div className={settingsStyles.swatches}>
              {ACCENTS.map((accent) => (
                <button
                  key={accent}
                  type="button"
                  className={`${settingsStyles.swatch} ${widgetStyles.accent}`}
                  data-accent={accent}
                  aria-pressed={(e.color ?? "red") === accent}
                  aria-label={`${name}: ${t(`accent_${accent}`)}`}
                  title={t(`accent_${accent}`)}
                  onClick={() =>
                    update(e.id, {
                      color: accent === "red" ? undefined : accent,
                    })
                  }
                />
              ))}
            </div>
          </div>
        );
    }
  };

  /** "Anzahl" for a mini list, "Zielwert" for a goal — else the plain word. */
  const optionLabel = (key: "value" | "label", kind: ElementKind) => {
    const specific = `elOpt_${key}_${kind}`;
    return t.has(specific as "elOpt_value")
      ? t(specific as "elOpt_value")
      : t(`elOpt_${key}`);
  };

  return (
    <div className={styles.list}>
      {elements.map((element, i) => {
        const def = elementDef(widget.type, element.kind);
        const name = t(`el_${element.kind}`);
        const moves = movable && i < placed.length;
        const isOpen = open === element.id;
        const hidden = !fitsSize(element, widget.size);
        const options = elementOptions(widget.type, element.kind);
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: dragging is the pointer shortcut — the arrow buttons in the row do the same for keyboard and touch
          <div
            key={element.id}
            className={styles.element}
            draggable={moves && !isOpen}
            data-fixed={!moves || undefined}
            data-open={isOpen || undefined}
            data-dragging={dragging === element.id || undefined}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setDragging(element.id);
            }}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => {
              if (!moves || !dragging || dragging === element.id) return;
              e.preventDefault();
              move(
                elements.findIndex((x) => x.id === dragging),
                i,
              );
            }}
          >
            <div className={styles.head}>
              <Icon
                icon="lucide:grip-vertical"
                width={14}
                className={styles.grip}
                aria-hidden="true"
              />
              <button
                type="button"
                className={styles.toggle}
                aria-expanded={isOpen}
                aria-label={t("elSettings", { name })}
                onClick={() => onOpen(isOpen ? null : element.id)}
              >
                <span className={styles.icon}>
                  <Icon icon={def?.icon ?? "lucide:square"} width={14} />
                </span>
                <span className={styles.text}>
                  {name}
                  <small>{hidden ? t("elHiddenHere") : summary(element)}</small>
                </span>
                <Icon
                  icon="lucide:chevron-down"
                  width={15}
                  className={styles.chevron}
                />
              </button>
              {moves && (
                <span className={styles.arrows}>
                  <button
                    type="button"
                    aria-label={t("moveUp")}
                    disabled={i === 0}
                    onClick={() => move(i, i - 1)}
                  >
                    <Icon icon="lucide:chevron-up" width={14} />
                  </button>
                  <button
                    type="button"
                    aria-label={t("moveDown")}
                    disabled={i === placed.length - 1}
                    onClick={() => move(i, i + 1)}
                  >
                    <Icon icon="lucide:chevron-down" width={14} />
                  </button>
                </span>
              )}
              <button
                type="button"
                className={styles.remove}
                aria-label={t("elRemove", { name })}
                title={t("elRemove", { name })}
                onClick={() => remove(element.id)}
              >
                <Icon icon="lucide:x" width={14} />
              </button>
            </div>
            {isOpen && (
              <div className={styles.form}>
                {options.map((option) => field(element, option, name))}
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>
                    {t("elOpt_minSize")}
                  </span>
                  <span className={settingsStyles.full}>
                    <SegmentedControl
                      variant="surface"
                      value={element.minSize ?? "S"}
                      onChange={(v) =>
                        update(element.id, {
                          minSize:
                            v === "S" ? undefined : (v as ElementMinSize),
                        })
                      }
                      items={ELEMENT_MIN_SIZES.map((s) => ({
                        value: s,
                        label: s === "S" ? t("elOpt_minSize_any") : s,
                      }))}
                    />
                  </span>
                </div>
              </div>
            )}
          </div>
        );
      })}
      {elements.length === 0 && (
        <span className={styles.none}>{t("elNone")}</span>
      )}
      {missing.length > 0 && (
        <InlinePicker
          width={280}
          title={t("elAdd")}
          trigger={
            <button type="button" className={styles.add}>
              <Icon icon="lucide:plus" width={14} />
              {t("elAdd")}
            </button>
          }
        >
          {(close) => (
            <SelectMenu
              items={missing.map((def) => ({
                value: def.kind,
                label: t(`el_${def.kind}`),
                hint: t(`elHint_${def.kind}`),
                icon: <Icon icon={def.icon} width={14} />,
              }))}
              value={null}
              onPick={(kind) => {
                add(kind as ElementKind);
                close();
              }}
              onClose={close}
            />
          )}
        </InlinePicker>
      )}
    </div>
  );
}
