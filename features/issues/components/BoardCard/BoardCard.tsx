"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { type CSSProperties, useRef, useState } from "react";
import { Label } from "@/components/ui/atoms/Label/Label";
import {
  type CardFieldKey,
  visibleCardFields,
} from "@/features/issues/card-fields";
import { AssigneePicker } from "@/features/issues/components/AssigneePicker/AssigneePicker";
import {
  DueDateBadge,
  PriorityIcon,
  StoryPointsBadge,
  TypeIcon,
} from "@/features/issues/components/IssueIcons/IssueIcons";
import { IssueTitleField } from "@/features/issues/components/IssueTitleField/IssueTitleField";
import type { GroupDef } from "@/features/issues/group";
import { isBrowserClick } from "@/features/issues/issue-links";
import type { IssueLookups } from "@/features/issues/types";
import { useIssuePatch } from "@/features/issues/useIssuePatch";
import { visibleDetailFields } from "@/features/projects/detail-fields";
import { onActivate } from "@/lib/a11y";
import { useModal } from "@/lib/context";
import { useLongPress } from "@/lib/utils/useLongPress";
import {
  COMPACT_QUERY,
  PHONE_QUERY,
  useMediaQuery,
} from "@/lib/utils/useMediaQuery";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import type { IssueDetail, Label as LabelType } from "@/types";
import styles from "./boardCard.module.scss";
import { CardQuickActions } from "./CardQuickActions";
import { useRowFit } from "./useRowFit";
import { useTextEnd } from "./useTextEnd";

interface BoardCardProps {
  issue: IssueDetail;
  /**
   * The column's project — only a fallback for the key in the footer. The
   * project on the issue itself always takes priority; in a cross-project
   * view there is none here at all.
   */
  projectId?: string;
  /**
   * Names the project in the header row. On a single project's board every
   * card would show the same thing — there, the key in the footer says
   * enough.
   */
  showProject?: boolean;
  lookups: IssueLookups;
  /** This person's hidden card fields for this board (BARY-33). */
  hiddenCardFields: string[];
  isDragging?: boolean;
  /**
   * Whether this issue is currently shown in the side panel. The card stays
   * marked in that case — otherwise, after the click, there'd be no way to
   * tell what the panel is actually showing.
   */
  isActive?: boolean;
  /** The keyboard cursor (j/k/arrows on the board) — independent of `isActive`. */
  isFocused?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  /** The ordinary click: panel over the board. */
  onOpen?: () => void;
  /**
   * Ctrl/Cmd click and middle click: the full page in a new tab.
   *
   * The card isn't a link — it's draggable, and an anchor over it would
   * hijack the link during a drag instead of dragging the card. So it reads
   * the key itself instead of leaving it to the browser.
   */
  onOpenInNewTab?: () => void;
  /**
   * "Move to…" in the long-press sheet (phone and tablet): the board's
   * columns, the one this card is in, and what to do on a pick. Without them
   * (or without `canEdit`) the sheet has no such section.
   */
  moveTargets?: GroupDef[];
  currentGroupId?: string;
  onMoveTo?: (groupId: string) => void;
}

export function BoardCard({
  issue,
  projectId,
  showProject,
  lookups: { members, projects, labels, issueTypes },
  hiddenCardFields,
  isDragging,
  isActive,
  isFocused,
  onDragStart,
  onDragEnd,
  onDragOver,
  onOpen,
  onOpenInNewTab,
  moveTargets,
  currentGroupId,
  onMoveTo,
}: BoardCardProps) {
  const t = useTranslations();
  const timeAgo = useTimeAgo();
  const { patch } = useIssuePatch(issue.id);
  const [isEditing, setIsEditing] = useState(false);
  const { openModal } = useModal();
  // Phone and tablet (≤ 1024px): nothing on the card is edited in place — a
  // long press opens the quick-action sheet instead. On a desktop it's the
  // other way round: the pencil, the assignee dropdown, dragging, and no
  // sheet.
  const compact = useMediaQuery(COMPACT_QUERY);
  // No dragging on a phone: it would fight with scrolling, and "Move to…" in
  // the long-press sheet replaces it. A tablet drags again.
  const isPhone = useMediaQuery(PHONE_QUERY);

  // The server only catches up after the write. Until then the card shows
  // what was just typed — otherwise the old title would briefly flash back
  // up. As soon as a new title arrives from outside, that one takes over again.
  const [written, setWritten] = useState<string | null>(null);
  const [known, setKnown] = useState(issue.title);
  if (issue.title !== known) {
    setKnown(issue.title);
    setWritten(null);
  }
  const title = written ?? issue.title;

  // Where the title ends — the pencil icon is anchored to that.
  const { ref: titleRef, end: textEnd } = useTextEnd(title);

  // A click elsewhere ends editing — but it shouldn't also open the card.
  // Until `mousedown` completes, focus hasn't yet left the field; this
  // tracks whether editing was in progress. Every `mousedown` resets the
  // flag so no stale state swallows a later click.
  const wasEditing = useRef(false);

  const project = projects.find((p) => p.id === issue.project) ??
    projects.find((p) => p.id === projectId) ?? {
      prefix: "?",
      name: "?",
      color: "#686d76",
      hiddenDetailFields: [],
    };
  const projectVisibleFields = visibleDetailFields(
    project.hiddenDetailFields ?? [],
  );
  const userVisibleFields = visibleCardFields(hiddenCardFields);
  const showField = (key: CardFieldKey) =>
    projectVisibleFields.has(key) && userVisibleFields.has(key);
  const identifier = `${project.prefix}-${issue.key}`;
  const typeLabel = issue.type
    ? issue.type.charAt(0).toUpperCase() + issue.type.slice(1)
    : null;
  const typeColor = issue.type
    ? (issueTypes.find((x) => x.id === issue.type)?.color ?? "#686d76")
    : null;
  const issueLabels = issue.labels
    .map((lid) => labels.find((x) => x.id === lid) ?? null)
    .filter((l): l is LabelType => l !== null);

  // The labels stay on one line — whatever no longer fits shows as a number
  // at the end. A fixed cap wouldn't do: whether three labels fit depends
  // on their names and on the column's width, which is resizable.
  const { ref: labelRow, fit } = useRowFit(
    issueLabels.length,
    issueLabels.map((l) => l.name).join("|"),
  );
  const shownLabels = fit === null ? issueLabels : issueLabels.slice(0, fit);
  const restLabels = issueLabels.length - shownLabels.length;

  const openQuickActions = () =>
    openModal(
      ({ close }) => (
        <CardQuickActions
          issue={issue}
          identifier={identifier}
          title={title}
          members={members}
          moveTargets={moveTargets}
          currentGroupId={currentGroupId}
          onMoveTo={onMoveTo}
          onOpen={() => onOpen?.()}
          onOpenInNewTab={() => onOpenInNewTab?.()}
          onEditTitle={() => setIsEditing(true)}
          close={close}
        />
      ),
      { placement: "bottom", label: t("issues.quickActions") },
    );
  const longPress = useLongPress(openQuickActions);
  const longPressProps = compact ? longPress : {};

  return (
    // biome-ignore lint/a11y/useSemanticElements: card contains block-level content; a <button> would be invalid HTML
    <div
      className={`${styles.card}${isDragging ? ` ${styles.dragging}` : ""}`}
      role="button"
      tabIndex={0}
      // Same convention as the list's rows (`Table`): state lives in the
      // attribute, appearance in the stylesheet.
      data-active={isActive || undefined}
      data-focused={isFocused || undefined}
      aria-current={isActive || undefined}
      // Queried by `Board`'s keyboard navigation to scroll the focused card
      // into view — a plain attribute instead of a ref map, since the board
      // already has one container ref to search from.
      data-issue-id={issue.id}
      // Not while editing: a draggable ancestor would otherwise steal mouse
      // text selection from the field. Not without issue.update.any/.own
      // either — dragging changes the status (`moveIssue`/`reorderIssue`),
      // which the server rejects without those permissions.
      draggable={!isEditing && issue.access.canEdit && !isPhone}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onMouseDown={() => {
        wasEditing.current = isEditing;
      }}
      onClick={(e) => {
        if (wasEditing.current) {
          wasEditing.current = false;
          return;
        }
        if (isBrowserClick(e)) onOpenInNewTab?.();
        else onOpen?.();
      }}
      // The middle mouse button doesn't fire `onClick`. Without
      // `preventDefault` it would also trigger auto-scroll.
      onAuxClick={(e) => {
        if (e.button !== 1) return;
        e.preventDefault();
        onOpenInNewTab?.();
      }}
      onKeyDown={onActivate(() => onOpen?.())}
      {...longPressProps}
    >
      {/* Where the task comes from is shown above everything else — its own
        line, before type and title say what it is. */}
      {showProject && (
        <span className={styles.project} title={project.name}>
          <span
            className={styles.projectDot}
            style={{ background: project.color }}
          />
          {project.name}
        </span>
      )}

      {/* Header row: type badge + assignee. The avatar is also the trigger
        for reassignment — changing it is the most frequent action on a
        card, and it shouldn't require opening the card first. */}
      <div className={styles.header}>
        {typeLabel && typeColor && (
          <Label color={typeColor} filled hasIcon size="xs">
            <TypeIcon type={issue.type} size={10} color={typeColor} />
            {typeLabel}
          </Label>
        )}
        <span className={styles.headerActions}>
          <AssigneePicker
            issue={issue}
            members={members}
            size={30}
            readOnly={compact}
          />
        </span>
      </div>

      {isEditing && issue.access.canEdit ? (
        <IssueTitleField
          className={styles.titleEdit}
          value={title}
          onSave={(value) => {
            setWritten(value);
            patch({ title: value });
          }}
          onDone={() => setIsEditing(false)}
        />
      ) : (
        // The pencil icon overlays the title and is positioned at its
        // measured end: right after the last word, or at the line end where
        // there's no room left. It can't sit inline in the text flow — the
        // three-line clamp would cut it off along with long titles.
        //
        // Without issue.update.any/.own the pencil is left out entirely:
        // the server would reject the patch anyway (`updateIssue`).
        <div className={styles.titleRow}>
          <p className={styles.title} ref={titleRef}>
            {title}
          </p>
          {issue.access.canEdit && !compact && (
            <button
              type="button"
              className={styles.editTitle}
              style={
                textEnd
                  ? ({
                      "--title-end-x": `${textEnd.x}px`,
                      "--title-end-y": `${textEnd.y}px`,
                    } as CSSProperties)
                  : undefined
              }
              title={t("actions.editTitle")}
              aria-label={t("actions.editTitle")}
              onClick={(e) => {
                e.stopPropagation();
                setIsEditing(true);
              }}
            >
              <Icon icon="lucide:pencil" width={13} />
            </button>
          )}
        </div>
      )}

      {showField("labels") && issueLabels.length > 0 && (
        <div className={styles.labels} ref={labelRow}>
          {shownLabels.map((l) => (
            <Label key={l.id} color={l.color} size="xs">
              {l.name}
            </Label>
          ))}
          {/* During the measuring pass (`fit === null`) the counter shows the
              largest possible number, so its width is factored into the
              calculation — it isn't actually seen during that pass. */}
          {(fit === null || restLabels > 0) && (
            <Label
              size="xs"
              className={fit === null ? styles.probe : undefined}
              title={
                fit === null
                  ? undefined
                  : issueLabels
                      .slice(fit)
                      .map((l) => l.name)
                      .join(", ")
              }
            >
              +{fit === null ? issueLabels.length : restLabels}
            </Label>
          )}
        </div>
      )}

      {/* Meta: priority + identifier | time + comments */}
      <div className={styles.footer}>
        {showField("priority") && (
          <PriorityIcon priority={issue.priority} size={14} />
        )}
        <span className={styles.id}>{identifier}</span>
        {showField("storyPoints") && issue.storyPoints !== null && (
          <StoryPointsBadge points={issue.storyPoints} />
        )}
        {showField("dueDate") && issue.dueDate !== null && (
          <DueDateBadge dueDate={issue.dueDate} />
        )}
        <span className={styles.time} suppressHydrationWarning>
          {timeAgo(issue.updated)}
        </span>
        {issue.comments.length > 0 && (
          <span className={styles.comments}>
            <Icon icon="lucide:message-square" width={12} aria-hidden="true" />
            {issue.comments.length}
          </span>
        )}
      </div>
    </div>
  );
}
