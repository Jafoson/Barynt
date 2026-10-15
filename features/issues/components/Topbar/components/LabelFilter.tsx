"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { LabelIcon } from "@/features/issues/components/IssueIcons/IssueIcons";
import { LabelPickerMenu } from "@/features/issues/components/LabelPickerMenu/LabelPickerMenu";
import type { Label } from "@/types";
import { ChipIcons, ChipValues, chipTitle } from "./ChipValues";

interface LabelFilterProps {
  value: string[];
  labels: Label[];
  /**
   * The project this filter operates within. Empty in a cross-project
   * view: then all visible labels are offered, and none can be created
   * from here — a new label needs a home, and there wouldn't be one here.
   */
  projectId: string;
  projectName: string;
  workspaceId: string;
  onToggle: (id: string) => void;
  onClear: () => void;
}

export function LabelFilter({
  value,
  labels,
  projectId,
  projectName,
  workspaceId,
  onToggle,
  onClear,
}: LabelFilterProps) {
  const t = useTranslations();
  const router = useRouter();
  // Labels created from inside the picker show up immediately, before the
  // refreshed workspace data comes back.
  const [created, setCreated] = useState<Label[]>([]);

  const allLabels = [
    ...labels,
    ...created.filter((l) => !labels.some((a) => a.id === l.id)),
  ];
  const selected = value
    .map((id) => allLabels.find((l) => l.id === id))
    .filter((l): l is Label => Boolean(l));

  const name = t("fields.label");
  const names = selected.map((l) => l.name);
  const label =
    value.length === 0 ? name : <ChipValues name={name} values={names} />;

  return (
    <FilterChip
      name={name}
      label={label}
      title={value.length > 0 ? chipTitle(name, names) : undefined}
      active={value.length > 0}
      onClear={onClear}
      width={220}
      icon={
        selected.length === 0 ? (
          <Icon icon="lucide:tag" width={13} />
        ) : (
          <ChipIcons>
            {selected.map((l) => (
              <LabelIcon key={l.id} color={l.color} size={13} />
            ))}
          </ChipIcons>
        )
      }
    >
      {(close) =>
        !projectId ? (
          <SelectMenu
            items={allLabels.map((l) => ({
              value: l.id,
              label: l.name,
              icon: <LabelIcon color={l.color} size={13} />,
            }))}
            value={value}
            onPick={(v) => onToggle(v as string)}
            multi
            searchable
          />
        ) : (
          <LabelPickerMenu
            allLabels={allLabels}
            selected={value}
            projectId={projectId}
            projectName={projectName}
            workspaceId={workspaceId}
            onPick={onToggle}
            onCreated={(l) => {
              setCreated((cur) => [...cur, l]);
              router.refresh();
            }}
            onClose={close}
            keepOpen
          />
        )
      }
    </FilterChip>
  );
}
