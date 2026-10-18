"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import {
  ELEMENTS,
  type ElementKind,
  elementDef,
  elementsOf,
  type Widget,
  type WidgetElement,
} from "@/features/dashboard/widgets";
import type { IssueFilter } from "@/features/issues/filter";
import { randomId } from "@/lib/utils/id";
import styles from "./elementsEditor.module.scss";

interface Props {
  widget: Widget;
  onChange: (elements: WidgetElement[]) => void;
  /** Opens the filter editor for an element's own filter (second number). */
  editFilter: (
    filter: IssueFilter | undefined,
    save: (filter: IssueFilter | undefined) => void,
  ) => void;
}

/**
 * The widget's elements (BARY-170): what sits around its main part — add
 * from what the kind offers, drag (touch: arrows) to reorder, ✕ to remove,
 * and a value right in the row where an element has one.
 */
export function ElementsEditor({ widget, onChange, editFilter }: Props) {
  const t = useTranslations("widgets");
  const offered = ELEMENTS[widget.type] ?? [];
  const elements = elementsOf(widget);
  const [dragging, setDragging] = useState<string | null>(null);
  if (offered.length === 0) return null;

  const missing = offered.filter(
    (def) => !elements.some((e) => e.kind === def.kind),
  );
  const update = (id: string, patch: Partial<WidgetElement>) =>
    onChange(elements.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const remove = (id: string) => onChange(elements.filter((e) => e.id !== id));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= elements.length || from === to) return;
    const next = [...elements];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  const add = (kind: ElementKind) => {
    const def = elementDef(widget.type, kind);
    onChange([
      ...elements,
      {
        id: randomId().slice(0, 8),
        kind,
        ...(def?.initial !== undefined && { value: def.initial }),
      },
    ]);
  };

  return (
    <div className={styles.list}>
      {elements.map((element, i) => {
        const def = elementDef(widget.type, element.kind);
        const name = t(`el_${element.kind}`);
        const rules = element.filter?.rules.length ?? 0;
        return (
          // biome-ignore lint/a11y/noStaticElementInteractions: dragging is the pointer shortcut — the arrow buttons in the row do the same for keyboard and touch
          <div
            key={element.id}
            className={styles.element}
            draggable
            data-dragging={dragging === element.id || undefined}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = "move";
              setDragging(element.id);
            }}
            onDragEnd={() => setDragging(null)}
            onDragOver={(e) => {
              if (!dragging || dragging === element.id) return;
              e.preventDefault();
              move(
                elements.findIndex((x) => x.id === dragging),
                i,
              );
            }}
          >
            <Icon
              icon="lucide:grip-vertical"
              width={14}
              className={styles.grip}
            />
            <span className={styles.icon}>
              <Icon icon={def?.icon ?? "lucide:square"} width={14} />
            </span>
            <span className={styles.text}>
              {name}
              <small>{t(`elHint_${element.kind}`)}</small>
            </span>
            {def?.input === "number" && (
              <input
                type="number"
                className={styles.value}
                min={1}
                max={element.kind === "rows" ? 30 : 1_000_000}
                value={element.value ?? ""}
                aria-label={name}
                onChange={(e) =>
                  update(element.id, {
                    value:
                      e.target.value === ""
                        ? undefined
                        : Math.max(0, Number(e.target.value)),
                  })
                }
              />
            )}
            {def?.input === "date" && (
              <input
                type="date"
                className={styles.value}
                value={element.date ?? ""}
                aria-label={name}
                onChange={(e) =>
                  update(element.id, { date: e.target.value || undefined })
                }
              />
            )}
            {def?.input === "filter" && (
              <button
                type="button"
                className={styles.value}
                onClick={() =>
                  editFilter(element.filter, (filter) =>
                    update(element.id, { filter }),
                  )
                }
              >
                <Icon icon="lucide:filter" width={12} />
                {rules ? t("filterCount", { count: rules }) : t("filterAdd")}
              </button>
            )}
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
                disabled={i === elements.length - 1}
                onClick={() => move(i, i + 1)}
              >
                <Icon icon="lucide:chevron-down" width={14} />
              </button>
            </span>
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
