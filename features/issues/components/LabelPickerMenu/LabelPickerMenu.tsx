"use client";

import { Icon } from "@iconify/react";
import { useState, useTransition } from "react";
import { ColorPicker } from "@/components/ui/atoms/ColorPicker/ColorPicker";
import {
  SelectAction,
  SelectEmpty,
} from "@/components/ui/atoms/SelectMenu/atoms/SelectAction";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { createLabel } from "@/features/issues/actions";
import { LabelIcon } from "@/features/issues/components/IssueIcons/IssueIcons";
import type { Label } from "@/types";
import styles from "./labelPickerMenu.module.scss";

interface Props {
  allLabels: Label[];
  selected: string[];
  projectId: string;
  projectName: string;
  workspaceId: string;
  onPick: (id: string) => void;
  onCreated: (label: Label) => void;
  onClose: () => void;
  keepOpen?: boolean;
}

export function LabelPickerMenu({
  allLabels,
  selected,
  projectId,
  projectName,
  workspaceId,
  onPick,
  onCreated,
  onClose,
  keepOpen,
}: Props) {
  const [pending, setPending] = useState<{
    name: string;
    scope: "project" | "workspace";
  } | null>(null);
  const [, startCreate] = useTransition();

  // A label belongs either to this project or to the whole workspace — and
  // in the second case, the project may have hidden it for itself
  // (`hiddenIn`). It still stays on tasks that already carry it; this is
  // only about what can still be assigned.
  const visible = allLabels.filter(
    (l) =>
      (!l.projectId || l.projectId === projectId) &&
      !l.hiddenIn?.includes(projectId),
  );

  const handleColorPick = (color: string) => {
    if (!pending) return;
    startCreate(async () => {
      const label = await createLabel({
        name: pending.name,
        color,
        workspaceId,
        projectId: pending.scope === "project" ? projectId : null,
      });
      onCreated({ ...label, projectId: label.projectId ?? null });
      onPick(label.id);
      setPending(null);
    });
  };

  if (pending) {
    return (
      <>
        <div className={styles.colorHeader}>
          <button
            type="button"
            className={styles.backButton}
            onClick={() => setPending(null)}
          >
            <Icon icon="lucide:arrow-left" width={14} />
          </button>
          <span>
            Choose a color for <strong>"{pending.name}"</strong>
          </span>
        </div>
        <div className={styles.colorGrid}>
          <ColorPicker size="sm" onChange={handleColorPick} />
        </div>
      </>
    );
  }

  return (
    <SelectMenu
      multi
      searchable
      placeholder="Search labels…"
      value={selected}
      onPick={(v) => {
        onPick(v as string);
        if (!keepOpen) onClose();
      }}
      onClose={onClose}
      items={visible.map((l) => ({
        value: l.id,
        label: l.name,
        icon: <LabelIcon color={l.color} />,
      }))}
      emptyState={(q) =>
        q.trim() ? (
          <>
            <SelectAction
              icon={<Icon icon="lucide:plus" width={14} />}
              onClick={() => setPending({ name: q.trim(), scope: "project" })}
            >
              Create "{q.trim()}" in <strong>{projectName}</strong>
            </SelectAction>
            <SelectAction
              icon={<Icon icon="lucide:plus" width={14} />}
              onClick={() => setPending({ name: q.trim(), scope: "workspace" })}
            >
              Create "{q.trim()}" in the workspace
            </SelectAction>
          </>
        ) : (
          <SelectEmpty>No labels yet</SelectEmpty>
        )
      }
    />
  );
}
