"use client";

import { Icon } from "@iconify/react";
import { useFormatter, useTranslations } from "next-intl";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { Label } from "@/components/ui/atoms/Label/Label";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import {
  DueDateBadge,
  LabelIcon,
  PriorityIcon,
  StatusIcon,
  StoryPointsBadge,
  TypeIcon,
} from "@/features/issues/components/IssueIcons/IssueIcons";
import { ValuePopover } from "@/features/issues/components/ValuePopover/ValuePopover";
import { useIssuePatch } from "@/features/issues/useIssuePatch";
import type {
  Issue,
  IssueDetail,
  IssueType,
  Label as LabelType,
  Priority,
  Project,
  Status,
} from "@/types";
import styles from "../listView.module.scss";

/** More labels wouldn't fit in one row without crowding out the title. */
const MAX_LABELS = 2;

// ── Interactive cells: change the issue directly from the list ─────────────
//
// Without `issue.access.canEdit` (mirrors `issue.update.any`/`.own` in
// `updateIssue`), the picker button is left out — the same reason as in the
// detail view (`IssueProperties.tsx`): the server would reject the patch anyway.

export function PriorityCell({
  issue,
  priorities,
}: {
  issue: IssueDetail;
  priorities: Priority[];
}) {
  const t = useTranslations();
  const { patch } = useIssuePatch(issue.id);
  const current = priorities.find((p) => p.id === issue.priority);

  if (!issue.access.canEdit) {
    return (
      <span className={styles.pickerBtn} data-readonly>
        <PriorityIcon priority={issue.priority} size={15} />
      </span>
    );
  }

  return (
    <InlinePicker
      width={190}
      stop
      trigger={
        <button
          type="button"
          className={styles.pickerBtn}
          title={current?.name ?? t("fields.priority")}
          aria-label={t("fields.priority")}
        >
          <PriorityIcon priority={issue.priority} size={15} />
        </button>
      }
    >
      {(close) => (
        <SelectMenu
          items={priorities.map((p) => ({
            value: p.id,
            label: p.name,
            icon: <PriorityIcon priority={p.id} size={15} />,
          }))}
          value={issue.priority}
          onPick={(value) => {
            patch({ priority: value as number });
            close();
          }}
          onClose={close}
        />
      )}
    </InlinePicker>
  );
}

export function StatusCell({
  issue,
  statuses,
}: {
  issue: IssueDetail;
  statuses: Status[];
}) {
  const t = useTranslations();
  const { patch } = useIssuePatch(issue.id);
  const current = statuses.find((s) => s.id === issue.status);

  if (!issue.access.canEdit) {
    return (
      <span className={styles.pickerBtn} data-readonly>
        <StatusIcon status={issue.status} size={15} color={current?.color} />
      </span>
    );
  }

  return (
    <InlinePicker
      width={200}
      stop
      trigger={
        <button
          type="button"
          className={styles.pickerBtn}
          title={current?.name ?? t("fields.status")}
          aria-label={t("fields.status")}
        >
          <StatusIcon status={issue.status} size={15} color={current?.color} />
        </button>
      }
    >
      {(close) => (
        <SelectMenu
          items={statuses.map((s) => ({
            value: s.id,
            label: s.name,
            icon: <StatusIcon status={s.id} size={15} color={s.color} />,
          }))}
          value={issue.status}
          onPick={(value) => {
            patch({ status: value as string });
            close();
          }}
          onClose={close}
        />
      )}
    </InlinePicker>
  );
}

export function StoryPointsCell({ issue }: { issue: IssueDetail }) {
  const t = useTranslations();
  const { patch } = useIssuePatch(issue.id);

  if (!issue.access.canEdit) {
    return issue.storyPoints !== null ? (
      <StoryPointsBadge points={issue.storyPoints} />
    ) : null;
  }

  return (
    <InlinePicker
      width={140}
      stop
      trigger={
        <button
          type="button"
          className={styles.tagBtn}
          title={t("fields.storyPoints")}
          aria-label={t("fields.storyPoints")}
        >
          {issue.storyPoints !== null ? (
            <StoryPointsBadge points={issue.storyPoints} />
          ) : (
            <span className={styles.empty}>—</span>
          )}
        </button>
      }
    >
      {(close) => (
        <ValuePopover<number | null>
          initialValue={issue.storyPoints}
          clearable={issue.storyPoints !== null}
          onConfirm={(value) => patch({ storyPoints: value })}
          onClear={() => patch({ storyPoints: null })}
          close={close}
        >
          {(value, setValue) => (
            <Input
              variant="number"
              size="sm"
              step={1}
              value={value ?? ""}
              onChange={(e) => {
                const raw = e.target.value;
                setValue(raw === "" ? null : Number(raw));
              }}
              autoFocus
            />
          )}
        </ValuePopover>
      )}
    </InlinePicker>
  );
}

export function DueDateCell({ issue }: { issue: IssueDetail }) {
  const t = useTranslations();
  const format = useFormatter();
  const { patch } = useIssuePatch(issue.id);

  if (!issue.access.canEdit) {
    return issue.dueDate !== null ? (
      <DueDateBadge dueDate={issue.dueDate} />
    ) : null;
  }

  return (
    <InlinePicker
      width={200}
      stop
      trigger={
        <button
          type="button"
          className={styles.tagBtn}
          title={
            issue.dueDate !== null
              ? format.dateTime(issue.dueDate, { dateStyle: "long" })
              : t("fields.dueDate")
          }
          aria-label={t("fields.dueDate")}
        >
          {issue.dueDate !== null ? (
            <DueDateBadge dueDate={issue.dueDate} />
          ) : (
            <span className={styles.empty}>—</span>
          )}
        </button>
      }
    >
      {(close) => (
        <ValuePopover<number | null>
          initialValue={issue.dueDate}
          clearable={issue.dueDate !== null}
          onConfirm={(value) => patch({ dueDate: value })}
          onClear={() => patch({ dueDate: null })}
          close={close}
        >
          {(value, setValue) => (
            <Input
              variant="date"
              size="sm"
              value={value ? new Date(value).toISOString().slice(0, 10) : ""}
              onChange={(e) => {
                const raw = e.target.value;
                setValue(raw ? new Date(raw).getTime() : null);
              }}
              autoFocus
            />
          )}
        </ValuePopover>
      )}
    </InlinePicker>
  );
}

/* The assignee lives as a separate component next to this one — the list
   and board show the same avatar and change it the same way:
   features/issues/components/AssigneePicker. */

// ── Display-only cells ──────────────────────────────────────────────────────

export function TypeCell({
  issue,
  issueTypes,
}: {
  issue: Issue;
  issueTypes: IssueType[];
}) {
  const type = issueTypes.find((x) => x.id === issue.type);
  if (!type) return null;

  return (
    <span
      className={styles.type}
      role="img"
      aria-label={type.name}
      title={type.name}
    >
      <TypeIcon type={type.id} size={13} color={type.color} />
    </span>
  );
}

/**
 * Which project the row belongs to — only in cross-project views. On the
 * board and in a single project's list, this column would show the same
 * information in every row.
 */
export function ProjectCell({
  issue,
  projects,
}: {
  issue: Issue;
  projects: Project[];
}) {
  const project = projects.find((p) => p.id === issue.project);
  if (!project) return null;

  return (
    <span className={styles.project} title={project.name}>
      <LabelIcon color={project.color} size={9} />
      {project.name}
    </span>
  );
}

export function LabelsCell({
  issue,
  labels,
}: {
  issue: Issue;
  labels: LabelType[];
}) {
  const resolved = issue.labels
    .map((id) => labels.find((l) => l.id === id))
    .filter((l): l is LabelType => Boolean(l));
  const shown = resolved.slice(0, MAX_LABELS);
  const rest = resolved.length - shown.length;

  return (
    <>
      {shown.map((label) => (
        <Label key={label.id} color={label.color} size="sm">
          {label.name}
        </Label>
      ))}
      {rest > 0 && <Label size="sm">+{rest}</Label>}
    </>
  );
}

/**
 * Short date instead of "3 days ago": read down a column, the point in
 * time matters, not the distance — and every row stays the same width. The
 * full timestamp is in the tooltip.
 */
export function UpdatedCell({ issue }: { issue: Issue }) {
  const format = useFormatter();

  return (
    <span
      className={styles.date}
      title={format.dateTime(issue.updated, {
        dateStyle: "long",
        timeStyle: "short",
      })}
    >
      {format.dateTime(issue.updated, { month: "short", day: "numeric" })}
    </span>
  );
}

/** How many comments were written — nothing at all while there are none. */
export function CommentsCell({ issue }: { issue: Issue }) {
  const t = useTranslations();
  const count = issue.comments.length;
  if (count === 0) return null;

  return (
    <span
      className={styles.comments}
      title={t("comments.count", { count })}
      role="img"
      aria-label={t("comments.count", { count })}
    >
      <Icon icon="lucide:message-square" width={13} aria-hidden="true" />
      {count}
    </span>
  );
}
