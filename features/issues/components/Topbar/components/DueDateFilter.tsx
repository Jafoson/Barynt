"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import styles from "../topbar.module.scss";
import { ChipValues, chipTitle } from "./ChipValues";

/** Matches `dueDateBucketWhere()` in `features/issues/queries.ts` — the
 *  only four values the server-side filter understands. */
const BUCKETS = ["overdue", "today", "week", "none"] as const;

interface DueDateFilterProps {
  value: string[];
  onToggle: (bucket: string) => void;
  onClear: () => void;
}

export function DueDateFilter({
  value,
  onToggle,
  onClear,
}: DueDateFilterProps) {
  const t = useTranslations();

  const bucketLabel: Record<(typeof BUCKETS)[number], string> = {
    overdue: t("filters.dueDateOverdue"),
    today: t("filters.dueDateToday"),
    week: t("filters.dueDateWeek"),
    none: t("filters.dueDateNone"),
  };

  const name = t("fields.dueDate");
  const names = value.map(
    (b) => bucketLabel[b as (typeof BUCKETS)[number]] ?? b,
  );
  const label =
    value.length === 0 ? name : <ChipValues name={name} values={names} />;

  return (
    <FilterChip
      name={name}
      label={label}
      title={value.length > 0 ? chipTitle(name, names) : undefined}
      active={value.length > 0}
      onClear={onClear}
      width={190}
      icon={
        <Icon
          icon="lucide:calendar"
          width={14}
          className={styles.glyphMuted}
          aria-hidden="true"
        />
      }
    >
      <SelectMenu
        items={BUCKETS.map((bucket) => ({
          value: bucket,
          label: bucketLabel[bucket],
        }))}
        value={value}
        onPick={(v) => onToggle(v as string)}
        multi
      />
    </FilterChip>
  );
}
