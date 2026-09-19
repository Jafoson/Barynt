"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";

interface FilterChipProps {
  /** Field name, used for the clear button's accessible label. */
  name: string;
  /** What the chip reads as right now — the field name, or the selection. */
  label: string;
  icon: React.ReactNode;
  /** Highlights the chip and — together with `onClear` — reveals the clear button. */
  active: boolean;
  /**
   * Leave out for mandatory fields: they always carry a value, so there is
   * nothing to clear and the chip keeps its chevron instead.
   */
  onClear?: () => void;
  width?: number;
  maxWidth?: number;
  /** Lets a surrounding field-roving handler (e.g. the create-issue
   *  window) jump Up/Down to this chip like any other field. */
  "data-field-nav"?: boolean;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
}

/**
 * A chip that opens a picker — and, once something is selected, highlights
 * itself and offers a clear button.
 *
 * Used for the topbar filter facets as well as the attribute pickers in the
 * issue composer, so both rows stay visually identical.
 */
export function FilterChip({
  name,
  label,
  icon,
  active,
  onClear,
  width,
  maxWidth,
  "data-field-nav": fieldNav,
  children,
}: FilterChipProps) {
  const t = useTranslations();

  return (
    <InlinePicker
      width={width}
      maxWidth={maxWidth}
      title={name}
      stop
      trigger={
        <Chip
          type="filter"
          variant="text"
          icon={icon}
          selected={active}
          trailing={<Icon icon="lucide:chevron-down" width={13} />}
          onRemove={active ? onClear : undefined}
          removeLabel={t("actions.clearFilter", { field: name })}
          data-field-nav={fieldNav || undefined}
        >
          {label}
        </Chip>
      }
    >
      {children}
    </InlinePicker>
  );
}
