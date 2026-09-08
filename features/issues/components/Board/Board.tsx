"use client";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { BoardColumn } from "@/features/issues/components/BoardColumn/BoardColumn";
import { useIssueOpen } from "@/features/issues/issue-links";
import type { IssueComposerData, IssueLookups } from "@/features/issues/types";
import { useHasOpenModal } from "@/lib/context";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import { useShiftScroll } from "@/lib/utils/useShiftScroll";
import type { IssueDetail, Status } from "@/types";
import styles from "./board.module.scss";
import { useBoardDnd } from "./useBoardDnd";

interface BoardProps {
  issues: IssueDetail[];
  /**
   * The project a new task is created in. Without one — for instance for
   * "my issues", which spans all projects — the columns show the same
   * cards, just without "New task": that would first require knowing which
   * project it belonged to.
   */
  projectId?: string;
  statuses: Status[];
  /** Feeds the columns' composer — the card lookups are derived from it. */
  composer: IssueComposerData;
}

export function Board({ issues, projectId, statuses, composer }: BoardProps) {
  const lookups: IssueLookups = {
    projects: composer.projects,
    members: composer.members,
    labels: composer.labels,
    issueTypes: composer.issueTypes,
  };
  const t = useTranslations();
  const columnStatuses = statuses.filter((s) => s.isColumn);
  const issueOpen = useIssueOpen(composer.workspaceId);
  const hasOpenModal = useHasOpenModal();

  const board = useBoardDnd(issues);
  // Shift + wheel scrolls the columns horizontally, no matter where the pointer is.
  const scrollSetter = useShiftScroll();
  const containerRef = useRef<HTMLDivElement>(null);

  const identifier = (issue: IssueDetail) =>
    `${lookups.projects.find((p) => p.id === issue.project)?.prefix ?? "?"}-${issue.key}`;

  // The keyboard cursor — which card j/k/arrows would move next, independent
  // of `isCardActive` (the one actually open in the panel). Columns are
  // recomputed from `board.getColumnIssues` on every render rather than
  // memoized: the board is small enough (a handful of columns, a few dozen
  // cards) that this isn't worth guarding against re-renders for.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const columns = columnStatuses.map((status) => ({
    status,
    issues: board.getColumnIssues(status.id),
  }));

  const focus = (issue: IssueDetail) => {
    setFocusedId(issue.id);
    // A panel already open stays live-synced to the cursor — Linear's
    // "peek": j/k move through issues while the preview updates
    // immediately, no separate Enter needed for each one. Safe against the
    // toggle-closes-on-second-click behavior in `openPanel`: movement
    // always lands on a *different* issue than the one already open.
    // (Arrow keys can't reach here while a panel is open — see the
    // shortcut bindings below — so this only ever fires from j/k once
    // the panel is up.)
    if (issueOpen.openIssue) issueOpen.openPanel(identifier(issue));
    // One frame later: the row this replaces might not have existed at
    // this scroll position yet (e.g. jumping columns).
    requestAnimationFrame(() => {
      containerRef.current
        ?.querySelector(`[data-issue-id="${CSS.escape(issue.id)}"]`)
        ?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  };

  const findPosition = () => {
    // Without a cursor of its own yet, continue from whatever's already
    // open (e.g. opened by a click) rather than jumping back to the first
    // card — "further" should mean further from there.
    const targetId =
      focusedId ??
      (issueOpen.openIssue
        ? (columns
            .flatMap((c) => c.issues)
            .find((i) => identifier(i) === issueOpen.openIssue)?.id ?? null)
        : null);
    if (!targetId) return null;
    for (let col = 0; col < columns.length; col++) {
      const row = columns[col].issues.findIndex((i) => i.id === targetId);
      if (row !== -1) return { col, row };
    }
    return null;
  };

  /** Nearest column with at least one card, walking from `fromCol` in
   *  `direction` (±1) — skips empty ones instead of landing on nothing. */
  const nextNonEmptyColumn = (fromCol: number, direction: 1 | -1) => {
    let col = fromCol + direction;
    while (
      col >= 0 &&
      col < columns.length &&
      columns[col].issues.length === 0
    ) {
      col += direction;
    }
    return col >= 0 && col < columns.length ? col : null;
  };

  /** `dCol`/`dRow` are mutually exclusive — one call moves along one axis. */
  const move = (dCol: number, dRow: number) => {
    const pos = findPosition();
    if (!pos) {
      const col = columns.findIndex((c) => c.issues.length > 0);
      if (col !== -1) focus(columns[col].issues[0]);
      return;
    }

    if (dRow !== 0) {
      const { issues: colIssues } = columns[pos.col];
      const nextRow = pos.row + dRow;
      if (nextRow >= 0 && nextRow < colIssues.length) {
        focus(colIssues[nextRow]);
        return;
      }
      // Off the column's edge: continue into the adjacent one instead of
      // stopping — down from the last card lands on the next column's
      // first, up from the first lands on the previous column's last.
      const col = nextNonEmptyColumn(pos.col, dRow > 0 ? 1 : -1);
      if (col === null) return;
      const target = columns[col];
      focus(
        dRow > 0 ? target.issues[0] : target.issues[target.issues.length - 1],
      );
      return;
    }

    // Across columns: skip empty ones in the same direction rather than
    // landing on a column with nothing to focus.
    const col = nextNonEmptyColumn(pos.col, dCol > 0 ? 1 : -1);
    if (col === null) return;
    const target = columns[col];
    focus(target.issues[Math.min(pos.row, target.issues.length - 1)]);
  };

  const openFocused = () => {
    const pos = findPosition();
    if (!pos) return;
    issueOpen.openPanel(identifier(columns[pos.col].issues[pos.row]));
  };

  // j/k always move the board cursor, even with a panel open — that's the
  // "peek" navigation in `focus()` above. Arrow keys do the same, but only
  // while no panel is open: with one open, arrows belong to it (scrolling,
  // picker focus, etc.) instead of hijacking the board cursor underneath.
  const noPanelOpen = !hasOpenModal && !issueOpen.openIssue;
  useShortcut("down", () => move(0, 1), { enabled: noPanelOpen });
  useShortcut("j", () => move(0, 1), { enabled: !hasOpenModal });
  useShortcut("up", () => move(0, -1), { enabled: noPanelOpen });
  useShortcut("k", () => move(0, -1), { enabled: !hasOpenModal });
  useShortcut("right", () => move(1, 0), { enabled: noPanelOpen });
  useShortcut("left", () => move(-1, 0), { enabled: noPanelOpen });
  // Disabled once a panel is open, same as the arrows above — otherwise
  // Enter on a field inside it (a picker button, the description preview)
  // would also fire this: `openPanel` toggle-closes on the issue that's
  // already open, so the panel would vanish under you mid-edit.
  useShortcut("enter", openFocused, { enabled: noPanelOpen && !!focusedId });
  useShortcut("o", openFocused, { enabled: noPanelOpen && !!focusedId });

  return (
    <div
      ref={(el) => {
        containerRef.current = el;
        scrollSetter(el);
      }}
      className={styles.board}
    >
      {columns.map(({ status, issues: columnIssues }) => {
        const { isOver, onDragOver, onDragLeave, onDrop } =
          board.columnHandlers(status.id);
        return (
          <BoardColumn
            key={status.id}
            status={status}
            issues={columnIssues}
            projectId={projectId}
            // Without a fixed project the cards come from various ones — so
            // each one states which.
            showProject={projectId === undefined}
            lookups={lookups}
            composer={composer}
            newIssueLabel={t("actions.newIssue")}
            isOver={isOver}
            dragging={board.dragging}
            dragOverCard={board.dragOverCard}
            insertAbove={board.insertAbove}
            onColumnDragOver={onDragOver}
            onColumnDragLeave={onDragLeave}
            onColumnDrop={onDrop}
            onCardDragStart={board.onDragStart}
            onCardDragEnd={board.onDragEnd}
            onCardDragOver={board.onCardDragOver}
            isCardActive={(issue) => identifier(issue) === issueOpen.openIssue}
            isCardFocused={(issue) => issue.id === focusedId}
            onCardOpen={(issue) => issueOpen.openPanel(identifier(issue))}
            onCardOpenInNewTab={(issue) =>
              issueOpen.openPageInNewTab(identifier(issue))
            }
          />
        );
      })}
    </div>
  );
}
