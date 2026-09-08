"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Label as LabelChip } from "@/components/ui/atoms/Label/Label";
import { LabelPickerMenu } from "@/features/issues/components/LabelPickerMenu/LabelPickerMenu";
import type { IssueComposerData, IssuePatch } from "@/features/issues/types";
import { useHasOpenModal } from "@/lib/context";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import type { IssueDetail, Label } from "@/types";
import styles from "../issueDetail.module.scss";
import type { IssueDetailLayout } from "../types";

interface IssueLabelsProps {
  issue: IssueDetail;
  data: IssueComposerData;
  layout: IssueDetailLayout;
  onPatch: (patch: IssuePatch) => void;
}

/**
 * The issue's labels.
 *
 * In the main column, a section of its own below the description; in the
 * attributes sidebar, a block between two dividers. In both places the
 * chips sit below their label instead of next to it: several of them need
 * the full width, otherwise even the second one would wrap.
 *
 * Only the way to add one differs. In the main column, a dashed chip closes
 * out the row — there's room there, and an empty state in words becomes
 * unnecessary. In the narrow attributes sidebar, the plus sits in the
 * header, where it costs no chip width.
 */
export function IssueLabels({
  issue,
  data,
  layout,
  onPatch,
}: IssueLabelsProps) {
  const { labels, projects } = data;
  const t = useTranslations();
  const { canEdit } = issue.access;
  const hasOpenModal = useHasOpenModal();

  // Labels newly created in the label picker aren't known to the server
  // prop yet — until the next refresh, they come from here.
  const [createdLabels, setCreatedLabels] = useState<Label[]>([]);
  // "l" opens the same picker a click would — see `IssueProperties` for the
  // equivalent for status/priority/assignee.
  const [shortcutOpen, setShortcutOpen] = useState(false);
  useShortcut("l", () => setShortcutOpen(true), {
    enabled: canEdit && !hasOpenModal,
  });
  const knownLabels = [
    ...labels,
    ...createdLabels.filter((l) => !labels.some((known) => known.id === l.id)),
  ];

  const isAside = layout === "aside";
  const project = projects.find((p) => p.id === issue.project);
  const issueLabels = issue.labels
    .map((id) => knownLabels.find((l) => l.id === id))
    .filter((l): l is Label => Boolean(l));

  const toggleLabel = (id: string) =>
    onPatch({
      labels: issue.labels.includes(id)
        ? issue.labels.filter((x) => x !== id)
        : [...issue.labels, id],
    });

  const picker = (trigger: React.ReactElement) => (
    <InlinePicker
      width={240}
      align={isAside ? "end" : "start"}
      stop
      open={shortcutOpen}
      onOpenChange={setShortcutOpen}
      trigger={trigger}
    >
      {(close) => (
        <LabelPickerMenu
          allLabels={knownLabels}
          selected={issue.labels}
          projectId={issue.project}
          projectName={project?.name ?? ""}
          workspaceId={data.workspaceId}
          onPick={toggleLabel}
          onCreated={(label) => setCreatedLabels((cur) => [...cur, label])}
          onClose={close}
          keepOpen
        />
      )}
    </InlinePicker>
  );

  const chips = issueLabels.map((label) => (
    <LabelChip
      key={label.id}
      color={label.color}
      size="sm"
      // Same path as via the menu — `toggleLabel` removes it since it's
      // already set. Without issue.update.*/.own, no cross: `onRemove` is
      // left out entirely instead of waiting for a click the server would
      // reject anyway.
      onRemove={canEdit ? () => toggleLabel(label.id) : undefined}
      removeLabel={t("actions.removeLabel", { name: label.name })}
    >
      {label.name}
    </LabelChip>
  ));

  if (isAside) {
    return (
      <div className={styles.labels}>
        <div className={styles.labelsHead}>
          <span className={styles.rowLabel}>{t("fields.labels")}</span>
          {canEdit &&
            picker(
              <button
                type="button"
                className={styles.iconBtn}
                aria-label={t("actions.addLabel")}
                title={t("actions.addLabel")}
              >
                <Icon icon="lucide:plus" width={14} />
              </button>,
            )}
        </div>
        {issueLabels.length > 0 ? (
          <div className={`${styles.labelsList} ${styles.labelsListAside}`}>
            {chips}
          </div>
        ) : (
          <span className={styles.labelsEmpty}>{t("fields.none")}</span>
        )}
      </div>
    );
  }

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <Icon icon="lucide:tag" width={15} aria-hidden="true" />
        <h3 className={styles.sectionTitle}>{t("fields.labels")}</h3>
      </header>

      <div className={styles.labelsList}>
        {chips}
        {canEdit &&
          picker(
            <button
              type="button"
              className={styles.addLabel}
              aria-label={t("actions.addLabel")}
              title={t("actions.addLabel")}
            >
              <Icon icon="lucide:plus" width={13} aria-hidden="true" />
              {issueLabels.length === 0 && <span>{t("fields.label")}</span>}
            </button>,
          )}
      </div>
    </section>
  );
}
