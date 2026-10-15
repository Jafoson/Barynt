"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { NONE_VALUE } from "@/features/issues/filter";
import { STORY_POINTS_OPTIONS } from "@/features/issues/story-points";
import { FILTER_ACCENT } from "../filterAccent";
import styles from "../topbar.module.scss";
import { ChipValues, chipTitle } from "./ChipValues";
import { NegateToggle } from "./NegateToggle";

interface StoryPointsFilterProps {
  value: (number | string)[];
  onToggle: (points: number | string) => void;
  onClear: () => void;
  /** "is not" (BARY-166). */
  negated?: boolean;
  onNegate?: (negated: boolean) => void;
}

export function StoryPointsFilter({
  value,
  onToggle,
  onClear,
  negated = false,
  onNegate,
}: StoryPointsFilterProps) {
  const t = useTranslations();

  const name = t("fields.storyPoints");
  const names = value.map((v) =>
    v === NONE_VALUE ? t("filters.notSet") : String(v),
  );
  const label =
    value.length === 0 ? (
      name
    ) : (
      <ChipValues name={name} values={names} negated={negated} />
    );

  return (
    <FilterChip
      name={name}
      label={label}
      title={
        value.length > 0
          ? chipTitle(name, names, negated, t("filters.isNot"))
          : undefined
      }
      active={value.length > 0}
      accent={FILTER_ACCENT.storyPoints}
      onClear={onClear}
      width={140}
      icon={
        <Icon
          icon="lucide:hash"
          width={14}
          className={styles.glyphMuted}
          aria-hidden="true"
        />
      }
    >
      <>
        {onNegate && <NegateToggle negated={negated} onChange={onNegate} />}
        <SelectMenu
          items={[
            ...STORY_POINTS_OPTIONS.map((points) => ({
              value: points,
              label: String(points),
            })),
            { value: NONE_VALUE, label: t("filters.notSet") },
          ]}
          value={value}
          onPick={(v) => onToggle(v as number | string)}
          multi
        />
      </>
    </FilterChip>
  );
}
