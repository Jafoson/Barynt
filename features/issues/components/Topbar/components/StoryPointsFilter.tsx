"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { STORY_POINTS_OPTIONS } from "@/features/issues/story-points";
import styles from "../topbar.module.scss";

interface StoryPointsFilterProps {
  value: number[];
  onToggle: (points: number) => void;
  onClear: () => void;
}

export function StoryPointsFilter({
  value,
  onToggle,
  onClear,
}: StoryPointsFilterProps) {
  const t = useTranslations();

  const name = t("fields.storyPoints");
  const label =
    value.length === 0
      ? name
      : value.length === 1
        ? String(value[0])
        : t("filters.storyPoints", { count: value.length });

  return (
    <FilterChip
      name={name}
      label={label}
      active={value.length > 0}
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
      <SelectMenu
        items={STORY_POINTS_OPTIONS.map((points) => ({
          value: points,
          label: String(points),
        }))}
        value={value}
        onPick={(v) => onToggle(v as number)}
        multi
      />
    </FilterChip>
  );
}
