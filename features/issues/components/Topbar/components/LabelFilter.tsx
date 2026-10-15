"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { LabelIcon } from "@/features/issues/components/IssueIcons/IssueIcons";
import { LabelPickerMenu } from "@/features/issues/components/LabelPickerMenu/LabelPickerMenu";
import { NONE_VALUE } from "@/features/issues/filter";
import type { Label } from "@/types";
import { FILTER_ACCENT } from "../filterAccent";
import { ChipIcons, ChipValues, chipTitle } from "./ChipValues";
import { NegateToggle } from "./NegateToggle";

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
  /** "is not" (BARY-166). */
  negated?: boolean;
  onNegate?: (negated: boolean) => void;
}

export function LabelFilter({
  value,
  labels,
  projectId,
  projectName,
  workspaceId,
  onToggle,
  onClear,
  negated = false,
  onNegate,
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
  const names = [
    ...(value.includes(NONE_VALUE) ? [t("filters.notSet")] : []),
    ...selected.map((l) => l.name),
  ];
  const label =
    value.length === 0 ? (
      name
    ) : (
      <ChipValues name={name} values={names} negated={negated} />
    );

  // No label at all (BARY-166) — the first row under the search.
  const notSet = {
    value: NONE_VALUE,
    label: t("filters.notSet"),
    icon: <Icon icon="lucide:tag" width={13} />,
  };

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
      accent={FILTER_ACCENT.label}
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
      {(close) => (
        <>
          {onNegate && <NegateToggle negated={negated} onChange={onNegate} />}
          {!projectId ? (
            <SelectMenu
              items={[
                notSet,
                ...allLabels.map((l) => ({
                  value: l.id,
                  label: l.name,
                  icon: <LabelIcon color={l.color} size={13} />,
                })),
              ]}
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
              leadingItems={[notSet]}
            />
          )}
        </>
      )}
    </FilterChip>
  );
}
