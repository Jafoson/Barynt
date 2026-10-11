"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import type { FieldDefinition } from "@/lib/custom-fields";
import type { User } from "@/types";
import { fieldFilterOptions } from "./filterOptions";

interface Props {
  field: FieldDefinition;
  members: User[];
  value: string[];
  onToggle: (answer: string) => void;
  onClear: () => void;
}

const TYPE_ICONS: Partial<Record<FieldDefinition["type"], string>> = {
  SELECT: "lucide:list",
  MULTI_SELECT: "lucide:list-checks",
  CHECKBOX: "lucide:square-check",
  USER: "lucide:user-round",
  DATE: "lucide:calendar",
};

/**
 * The topbar chip of one custom field: pick the answers an issue may have.
 * Like the label chip, it names the field until something is picked, then
 * the one answer or how many.
 */
export function FieldFilter({
  field,
  members,
  value,
  onToggle,
  onClear,
}: Props) {
  const t = useTranslations();
  const options = fieldFilterOptions(field, members, t);
  const picked = value.flatMap((v) => {
    const option = options.find((o) => o.value === v);
    return option ? [option] : [];
  });

  const label =
    picked.length === 0
      ? field.name
      : picked.length === 1
        ? picked[0].label
        : `${field.name} · ${picked.length}`;

  return (
    <FilterChip
      name={field.name}
      label={label}
      active={value.length > 0}
      onClear={onClear}
      width={220}
      icon={
        <Icon
          icon={field.icon ?? TYPE_ICONS[field.type] ?? "lucide:list"}
          width={14}
          aria-hidden="true"
        />
      }
    >
      <SelectMenu
        items={options.map((o) => ({
          value: o.value,
          label: o.label,
          icon: o.icon,
        }))}
        value={value}
        onPick={(v) => onToggle(String(v))}
        multi
        searchable={options.length >= 7}
      />
    </FilterChip>
  );
}
