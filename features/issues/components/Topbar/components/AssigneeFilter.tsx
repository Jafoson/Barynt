"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { ME, NONE_VALUE } from "@/features/issues/filter";
import { fullName } from "@/lib/utils/string";
import type { User } from "@/types";
import { ChipIcons, ChipValues, chipTitle } from "./ChipValues";
import { NegateToggle } from "./NegateToggle";

interface AssigneeFilterProps {
  value: string[];
  members: User[];
  onToggle: (id: string) => void;
  onClear: () => void;
  /** "is not" (BARY-166). */
  negated?: boolean;
  onNegate?: (negated: boolean) => void;
}

export function AssigneeFilter({
  value,
  members,
  onToggle,
  onClear,
  negated = false,
  onNegate,
}: AssigneeFilterProps) {
  const t = useTranslations();

  const name = t("fields.assignee");
  const names = value.map((id) =>
    id === ME
      ? t("filters.me")
      : id === NONE_VALUE
        ? t("fields.unassigned")
        : (members.find((u) => u.id === id)?.firstName ?? name),
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
      <>
        {onNegate && <NegateToggle negated={negated} onChange={onNegate} />}
        <SelectMenu
          items={[
            // Whoever looks — stays relative in a shared view — and nobody
            // (BARY-166).
            {
              value: ME,
              label: t("filters.me"),
              hint: t("filters.meHint"),
              icon: <Icon icon="lucide:user-round" width={18} />,
            },
            {
              value: NONE_VALUE,
              label: t("fields.unassigned"),
              icon: <Icon icon="lucide:user-x" width={18} />,
            },
            ...members.map((u) => ({
              value: u.id,
              label: fullName(u),
              icon: <Avatar avatar={u} size={22} />,
            })),
          ]}
          value={value}
          onPick={(v) => onToggle(v as string)}
          multi
          searchable
        />
      </>
    </FilterChip>
  );
}
