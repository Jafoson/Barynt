"use client";

import { Icon } from "@iconify/react";
import { useEffect, useState } from "react";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { useRowFit } from "@/lib/utils/useRowFit";
import styles from "./chipOverflow.module.scss";

/** One field of the row: what its chip reads, and what opens when it is picked. */
export interface OverflowChip {
  id: string;
  /** The field's name: the chip's title, and the row's name in the menu. */
  name: string;
  /** What the chip reads right now — the name, or the value. */
  label: string;
  icon: React.ReactNode;
  /** Highlights the chip and, with `onClear`, gives it a clear button. */
  active: boolean;
  onClear?: () => void;
  width?: number;
  maxWidth?: number;
  /** The picker: what opens under the chip, or inside the menu when the chip did not fit. */
  children: (close: () => void) => React.ReactNode;
}

interface ChipOverflowProps {
  items: OverflowChip[];
  /** The button that opens what did not fit. */
  moreLabel: string;
  /** Back from a field to the list of them, inside the menu. */
  backLabel: string;
}

/**
 * A row of field chips that stays **one line**: as many as fit, then a "more" button whose dropdown
 * lists the rest. A field in the dropdown opens as its own page in the same dropdown (with a way back),
 * so it is picked exactly as the chip would have been. What fits is measured (`useRowFit`): the widths
 * come from a pass that draws them all, and after that from the cache, so a narrower window moves chips
 * into the menu and a wider one brings them back.
 */
export function ChipOverflow({
  items,
  moreLabel,
  backLabel,
}: ChipOverflowProps) {
  // The icons of a chip (`@iconify/react`) draw an empty placeholder in the first render and the real
  // icon in the next one, so a chip measured in the first render is narrower than it ends up. Once the
  // row has mounted the key changes, and the widths are measured again, with the icons in.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // After a paint, not in the effect itself: the icons swap their placeholder in an effect of their own.
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  // What a chip's width depends on: its text and whether it has a clear button.
  const key = `${mounted ? "mounted" : "first"}#${items
    .map((item) => `${item.id}:${item.label}:${item.active}`)
    .join("|")}`;
  const { ref, fit } = useRowFit(items.length, key);

  const shown = fit === null ? items : items.slice(0, fit);
  const hidden = fit === null ? [] : items.slice(fit);
  const measuring = fit === null;

  return (
    <div className={styles.row} ref={ref}>
      {shown.map((item) => (
        <FilterChip
          key={item.id}
          name={item.name}
          label={item.label}
          icon={item.icon}
          active={item.active}
          onClear={item.onClear}
          width={item.width}
          maxWidth={item.maxWidth}
          data-field-nav
        >
          {item.children}
        </FilterChip>
      ))}

      {(measuring || hidden.length > 0) && (
        <span className={measuring ? styles.probe : undefined}>
          <InlinePicker
            width={320}
            title={moreLabel}
            stop
            trigger={
              <Chip
                type="filter"
                variant="text"
                icon={<Icon icon="lucide:ellipsis" width={14} />}
                selected={hidden.some((item) => item.active)}
                trailing={<Icon icon="lucide:chevron-down" width={13} />}
                data-field-nav
              >
                {moreLabel}
              </Chip>
            }
          >
            {(close) => (
              <OverflowMenu
                items={hidden}
                backLabel={backLabel}
                close={close}
              />
            )}
          </InlinePicker>
        </span>
      )}
    </div>
  );
}

/** The dropdown: the fields that did not fit as rows; a picked one replaces the list until "back". */
function OverflowMenu({
  items,
  backLabel,
  close,
}: {
  items: OverflowChip[];
  backLabel: string;
  close: () => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = items.find((item) => item.id === openId);

  if (open) {
    return (
      <div className={styles.menu}>
        <button
          type="button"
          className={styles.back}
          aria-label={backLabel}
          onClick={() => setOpenId(null)}
        >
          <Icon icon="lucide:chevron-left" width={16} />
          {open.name}
        </button>
        {open.children(close)}
      </div>
    );
  }

  return (
    <div className={styles.menu} role="menu">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          role="menuitem"
          className={styles.item}
          data-active={item.active || undefined}
          onClick={() => setOpenId(item.id)}
        >
          <span className={styles.itemIcon}>{item.icon}</span>
          <span className={styles.itemName}>{item.name}</span>
          {item.active && (
            <span className={styles.itemValue}>{item.label}</span>
          )}
          <Icon icon="lucide:chevron-right" width={14} />
        </button>
      ))}
    </div>
  );
}
