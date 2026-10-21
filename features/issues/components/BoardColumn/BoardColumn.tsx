"use client";
import { Icon } from "@iconify/react";
import React from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { BoardCard } from "@/features/issues/components/BoardCard/BoardCard";
import { CreateIssueModal } from "@/features/issues/components/CreateIssueModal/CreateIssueModal";
import { GroupIcon } from "@/features/issues/components/GroupIcon/GroupIcon";
import type { GroupDef } from "@/features/issues/group";
import type { IssueComposerData, IssueLookups } from "@/features/issues/types";
import { useModal } from "@/lib/context";
import type { IssueDetail } from "@/types";
import styles from "./boardColumn.module.scss";

interface BoardColumnProps {
  group: GroupDef;
  issues: IssueDetail[];
  /** Without a project there is no "New task" — see `Board`. */
  projectId?: string;
  /** The column just passes this through: the card names its project instead. */
  showProject?: boolean;
  lookups: IssueLookups;
  composer: IssueComposerData;
  /** This person's hidden card fields for this board (BARY-33). */
  hiddenCardFields: string[];
  newIssueLabel: string;
  isOver: boolean;
  dragging: string | null;
  dragOverCard: string | null;
  insertAbove: boolean;
  onColumnDragOver: (e: React.DragEvent) => void;
  onColumnDragLeave: (e: React.DragEvent) => void;
  onColumnDrop: (e: React.DragEvent) => void;
  onCardDragStart: (issue: IssueDetail) => (e: React.DragEvent) => void;
  onCardDragEnd: () => void;
  onCardDragOver: (cardId: string) => (e: React.DragEvent) => void;
  /** Whether this issue is currently shown in the side panel. */
  isCardActive: (issue: IssueDetail) => boolean;
  /** The keyboard cursor (j/k/arrows) — independent of `isCardActive`. */
  isCardFocused: (issue: IssueDetail) => boolean;
  onCardOpen: (issue: IssueDetail) => void;
  /** Ctrl/Cmd click and middle click on a card: full page in a new tab. */
  onCardOpenInNewTab: (issue: IssueDetail) => void;
  /** All columns of the board, for each card's "Move to…". */
  moveTargets?: GroupDef[];
  onCardMoveTo?: (issue: IssueDetail, groupId: string) => void;
  /**
   * With swimlanes (BARY-173) a column splits: its `head` sits once above
   * every lane, and each lane draws a `cell` — only the cards of that
   * column in that lane. `column` is the plain board's whole column.
   */
  variant?: "column" | "head" | "cell";
  /** Moving the whole column by a handle in its header (BARY-165). */
  columnDrag?: {
    label: string;
    /** This column is the one being dragged — drawn as a placeholder. */
    dragging: boolean;
    onStart: (e: React.DragEvent) => void;
    onEnd: () => void;
  };
}

export function BoardColumn({
  group,
  issues,
  projectId,
  showProject,
  lookups,
  composer,
  hiddenCardFields,
  newIssueLabel,
  isOver,
  dragging,
  dragOverCard,
  insertAbove,
  onColumnDragOver,
  onColumnDragLeave,
  onColumnDrop,
  onCardDragStart,
  onCardDragEnd,
  onCardDragOver,
  isCardActive,
  isCardFocused,
  onCardOpen,
  onCardOpenInNewTab,
  moveTargets,
  onCardMoveTo,
  variant = "column",
  columnDrag,
}: BoardColumnProps) {
  const { openModal } = useModal();

  // Without `issue.create` in this project there is neither the plus in the
  // column header nor the row at the end of the column. The server has already
  // decided this (`creatableProjectIds`), it's just not rendered here. Without
  // a project the question doesn't even arise.
  // A cell has no "New task" row: the new issue would start without the
  // lane's value and drop into another lane at once — the column's head
  // keeps its plus.
  const canCreate =
    variant !== "cell" &&
    projectId !== undefined &&
    composer.creatableProjectIds.includes(projectId);
  // In another grouping the column isn't a status — a new issue then starts
  // in the workspace's first workflow status, same as the composer's default.
  const initialStatus =
    group.key === "status"
      ? group.id
      : (composer.statuses.find((s) => s.isColumn)?.id ??
        composer.statuses[0]?.id ??
        "");

  function showCreateIssueModal() {
    if (projectId === undefined) return;
    openModal(({ close }) => (
      <CreateIssueModal
        projectId={projectId}
        initialStatus={initialStatus}
        data={composer}
        close={close}
      />
    ));
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop drop zone — no native HTML element represents this
    <div
      className={`${styles.col}${isOver ? ` ${styles.dragOver}` : ""}`}
      data-variant={variant === "column" ? undefined : variant}
      data-column-dragging={columnDrag?.dragging || undefined}
      // Read by `Board` to tell which column the phone's switcher is on and
      // to scroll to one.
      data-group-id={group.id}
      onDragOver={onColumnDragOver}
      onDragLeave={onColumnDragLeave}
      onDrop={onColumnDrop}
    >
      {variant !== "cell" && (
        <div className={styles.colHeader}>
          <GroupIcon group={group} size={16} />
          <span className={styles.colTitle}>{group.label}</span>
          <Badge mono>{issues.length}</Badge>
          {canCreate && (
            <Button
              type="button"
              variant="ghost"
              className={`${styles.headerAdd}`}
              title={newIssueLabel}
              onClick={showCreateIssueModal}
              icon={<Icon icon="lucide:plus" width={15} />}
            />
          )}
          {columnDrag && (
            // The handle grabs the column; while dragging, the whole column
            // follows the pointer (`Board`, `setDragImage`).
            <span
              className={styles.columnHandle}
              draggable
              title={columnDrag.label}
              aria-hidden="true"
              onDragStart={columnDrag.onStart}
              onDragEnd={columnDrag.onEnd}
            >
              <Icon icon="lucide:grip-vertical" width={14} />
            </span>
          )}
        </div>
      )}

      {variant !== "head" && (
        <div className={styles.cards}>
          {issues.map((issue) => {
            const isCardOver =
              dragOverCard === issue.id && dragging !== issue.id;
            return (
              <React.Fragment key={issue.id}>
                {isCardOver && insertAbove && (
                  <div className={styles.dropIndicator} />
                )}
                <BoardCard
                  issue={issue}
                  projectId={projectId}
                  showProject={showProject}
                  lookups={lookups}
                  hiddenCardFields={hiddenCardFields}
                  isDragging={dragging === issue.id}
                  isActive={isCardActive(issue)}
                  isFocused={isCardFocused(issue)}
                  onDragStart={onCardDragStart(issue)}
                  onDragEnd={onCardDragEnd}
                  onDragOver={onCardDragOver(issue.id)}
                  onOpen={() => onCardOpen(issue)}
                  onOpenInNewTab={() => onCardOpenInNewTab(issue)}
                  moveTargets={moveTargets}
                  currentGroupId={group.id}
                  onMoveTo={
                    onCardMoveTo && ((groupId) => onCardMoveTo(issue, groupId))
                  }
                />
                {isCardOver && !insertAbove && (
                  <div className={styles.dropIndicator} />
                )}
              </React.Fragment>
            );
          })}
          {/* Right after the last card, so it follows the column's content
            instead of floating over the cards. */}
          {canCreate && (
            <div className={styles.addSlot}>
              <button
                type="button"
                className={styles.addCard}
                title={newIssueLabel}
                onClick={showCreateIssueModal}
              >
                <Icon icon="lucide:plus" width={15} />
                <span>{newIssueLabel}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
