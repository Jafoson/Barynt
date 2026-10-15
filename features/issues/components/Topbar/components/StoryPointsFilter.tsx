"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { STORY_POINTS_OPTIONS } from "@/features/issues/story-points";
import styles from "../topbar.module.scss";
import { ChipValues, chipTitle } from "./ChipValues";

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
  const names = value.map(String);
  const label =
    value.length === 0 ? name : <ChipValues name={name} values={names} />;

  return (
    <FilterChip
      name={name}
      label={label}
      title={value.length > 0 ? chipTitle(name, names) : undefined}
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
