"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { TypeIcon } from "@/features/issues/components/IssueIcons/IssueIcons";
import type { IssueType } from "@/types";
import { FILTER_ACCENT } from "../filterAccent";
import { ChipIcons, ChipValues, chipTitle } from "./ChipValues";
import { NegateToggle } from "./NegateToggle";

interface TypeFilterProps {
  value: string[];
  issueTypes: IssueType[];
  onToggle: (id: string) => void;
  onClear: () => void;
  /** "is not" (BARY-166). */
  negated?: boolean;
  onNegate?: (negated: boolean) => void;
}

/** Filter by issue type — Feature, Bug, … (BARY-166). */
export function TypeFilter({
  value,
  issueTypes,
  onToggle,
  onClear,
  negated = false,
  onNegate,
}: TypeFilterProps) {
  const t = useTranslations();

  const name = t("fields.type");
  const names = value.map(
    (id) => issueTypes.find((x) => x.id === id)?.name ?? id,
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
      accent={FILTER_ACCENT.type}
      onClear={onClear}
      width={200}
      icon={
        value.length === 0 ? (
          <Icon icon="lucide:shapes" width={14} />
        ) : (
          <ChipIcons>
            {value.map((id) => (
              <TypeIcon
                key={id}
                type={id}
                size={14}
                color={issueTypes.find((x) => x.id === id)?.color}
              />
            ))}
          </ChipIcons>
        )
      }
    >
      <>
        {onNegate && <NegateToggle negated={negated} onChange={onNegate} />}
        <SelectMenu
          items={issueTypes.map((x) => ({
            value: x.id,
            label: x.name,
            icon: <TypeIcon type={x.id} size={15} color={x.color} />,
          }))}
          value={value}
          onPick={(v) => onToggle(v as string)}
          multi
          searchable
        />
      </>
    </FilterChip>
  );
}
