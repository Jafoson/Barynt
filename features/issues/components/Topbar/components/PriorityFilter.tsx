"use client";

import { useTranslations } from "next-intl";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { PriorityIcon } from "@/features/issues/components/IssueIcons/IssueIcons";
import type { Priority } from "@/types";
import { ChipIcons, ChipValues, chipTitle } from "./ChipValues";

interface PriorityFilterProps {
  value: number[];
  priorities: Priority[];
  onToggle: (id: number) => void;
  onClear: () => void;
}

export function PriorityFilter({
  value,
  priorities,
  onToggle,
  onClear,
}: PriorityFilterProps) {
  const t = useTranslations();

  const name = t("fields.priority");
  const names = value.map(
    (id) => priorities.find((p) => p.id === id)?.name ?? String(id),
  );
  const label =
    value.length === 0 ? name : <ChipValues name={name} values={names} />;

  return (
    <FilterChip
      name={name}
      label={label}
      title={value.length > 0 ? chipTitle(name, names) : undefined}
      active={value.length > 0}
      accent="var(--amber)"
      onClear={onClear}
      width={190}
      icon={
        value.length <= 1 ? (
          <PriorityIcon priority={value[0] ?? 0} size={14} />
        ) : (
          <ChipIcons>
            {value.map((id) => (
              <PriorityIcon key={id} priority={id} size={14} />
            ))}
          </ChipIcons>
        )
      }
    >
      <SelectMenu
        items={priorities.map((p) => ({
          value: p.id,
          label: p.name,
          icon: <PriorityIcon priority={p.id} size={15} />,
        }))}
        value={value}
        onPick={(v) => onToggle(v as number)}
        multi
        searchable
      />
    </FilterChip>
  );
}
