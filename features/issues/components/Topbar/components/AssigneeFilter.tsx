"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { fullName } from "@/lib/utils/string";
import type { User } from "@/types";
import { ChipIcons, ChipValues, chipTitle } from "./ChipValues";

interface AssigneeFilterProps {
  value: string[];
  members: User[];
  onToggle: (id: string) => void;
  onClear: () => void;
}

export function AssigneeFilter({
  value,
  members,
  onToggle,
  onClear,
}: AssigneeFilterProps) {
  const t = useTranslations();

  const name = t("fields.assignee");
  const names = value.map(
    (id) => members.find((u) => u.id === id)?.firstName ?? name,
  );
  const label =
    value.length === 0 ? name : <ChipValues name={name} values={names} />;

  return (
    <FilterChip
      name={name}
      label={label}
      title={value.length > 0 ? chipTitle(name, names) : undefined}
      active={value.length > 0}
      accent="var(--purple)"
      onClear={onClear}
      width={210}
      icon={
        value.length === 0 ? (
          <Icon icon="lucide:user" width={14} />
        ) : (
          <ChipIcons>
            {value.flatMap((id) => {
              const member = members.find((u) => u.id === id);
              return member
                ? [<Avatar key={id} avatar={member} size={15} />]
                : [];
            })}
          </ChipIcons>
        )
      }
    >
      <SelectMenu
        items={members.map((u) => ({
          value: u.id,
          label: fullName(u),
          icon: <Avatar avatar={u} size={22} />,
        }))}
        value={value}
        onPick={(v) => onToggle(v as string)}
        multi
        searchable
      />
    </FilterChip>
  );
}
