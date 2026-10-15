"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { LabelIcon } from "@/features/issues/components/IssueIcons/IssueIcons";
import type { Project } from "@/types";
import { ChipIcons, ChipValues, chipTitle } from "./ChipValues";

interface ProjectFilterProps {
  value: string[];
  projects: Project[];
  onToggle: (id: string) => void;
  onClear: () => void;
}

/**
 * Narrows a cross-project view down to individual projects — it doesn't
 * exist in a single project's board or list, since the question there is
 * already answered by the URL.
 *
 * The marker is the project dot, the same color as in the sidebar and tab
 * bar; with several selected, up to three of them appear side by side.
 */
export function ProjectFilter({
  value,
  projects,
  onToggle,
  onClear,
}: ProjectFilterProps) {
  const t = useTranslations();

  const selected = value
    .map((id) => projects.find((p) => p.id === id))
    .filter((p): p is Project => Boolean(p));

  const name = t("fields.project");
  const names = selected.map((p) => p.name);
  const label =
    value.length === 0 ? name : <ChipValues name={name} values={names} />;

  return (
    <FilterChip
      name={name}
      label={label}
      title={value.length > 0 ? chipTitle(name, names) : undefined}
      active={value.length > 0}
      accent="var(--green)"
      onClear={onClear}
      width={220}
      icon={
        selected.length === 0 ? (
          <Icon icon="lucide:folders" width={13} />
        ) : (
          <ChipIcons>
            {selected.map((p) => (
              <LabelIcon key={p.id} color={p.color} size={13} />
            ))}
          </ChipIcons>
        )
      }
    >
      <SelectMenu
        items={projects.map((p) => ({
          value: p.id,
          label: p.name,
          icon: <LabelIcon color={p.color} size={13} />,
        }))}
        value={value}
        onPick={(v) => onToggle(v as string)}
        multi
        searchable
      />
    </FilterChip>
  );
}
