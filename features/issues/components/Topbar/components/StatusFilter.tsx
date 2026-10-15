"use client";

import { useTranslations } from "next-intl";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { StatusIcon } from "@/features/issues/components/IssueIcons/IssueIcons";
import type { Status } from "@/types";
import { ChipIcons, ChipValues, chipTitle } from "./ChipValues";

interface StatusFilterProps {
  value: string[];
  statuses: Status[];
  onToggle: (id: string) => void;
  onClear: () => void;
}

export function StatusFilter({
  value,
  statuses,
  onToggle,
  onClear,
}: StatusFilterProps) {
  const t = useTranslations();

  const name = t("fields.status");
  const selected = value[0]
    ? (statuses.find((s) => s.id === value[0]) ?? null)
    : null;
  const names = value.map(
    (id) => statuses.find((s) => s.id === id)?.name ?? id,
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
      width={200}
      icon={
        value.length <= 1 ? (
          <StatusIcon
            status={value[0] ?? "todo"}
            size={14}
            color={selected?.color}
          />
        ) : (
          <ChipIcons>
            {value.map((id) => (
              <StatusIcon
                key={id}
                status={id}
                size={14}
                color={statuses.find((s) => s.id === id)?.color}
              />
            ))}
          </ChipIcons>
        )
      }
    >
      <SelectMenu
        items={statuses.map((s) => ({
          value: s.id,
          label: s.name,
          icon: <StatusIcon status={s.id} size={15} color={s.color} />,
        }))}
        value={value}
        onPick={(v) => onToggle(v as string)}
        multi
        searchable
      />
    </FilterChip>
  );
}
