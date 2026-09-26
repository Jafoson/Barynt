"use client";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CardCustomFields } from "@/features/custom-fields/cardFields";
import { BoardColumn } from "@/features/issues/components/BoardColumn/BoardColumn";
import { BoardColumnSwitcher } from "@/features/issues/components/BoardColumnSwitcher/BoardColumnSwitcher";
import {
  type GroupKey,
  groupDefs,
  visibleGroups,
} from "@/features/issues/group";
import { isGroupHidden } from "@/features/issues/hidden-groups";
import { useIssueOpen } from "@/features/issues/issue-links";
import type { SortKey } from "@/features/issues/sort";
import type { IssueComposerData, IssueLookups } from "@/features/issues/types";
import { useHasOpenModal } from "@/lib/context";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import { useUI } from "@/lib/ui-store";
import { useShiftScroll } from "@/lib/utils/useShiftScroll";
import type { IssueDetail, Status } from "@/types";
import styles from "./board.module.scss";
import { useBoardDnd } from "./useBoardDnd";

/** Left edge of a column inside the scroll container, minus its padding. */
function columnStart(column: HTMLElement, container: HTMLElement) {
  return (
    column.offsetLeft -
    (Number.parseFloat(getComputedStyle(container).paddingLeft) || 0)
  );
}

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
  /** This person's hidden card fields for this board (BARY-33). */
  hiddenCardFields: string[];
  /** The custom fields this person shows on the cards, with the answers of these issues (BARY-81). */
  customFields: CardCustomFields;
  /** How each column orders its cards — "manual" is drag-and-drop (BARY-34). */
  sortKey: SortKey;
  /** What the columns are: statuses by default, or another field (BARY-35). */
  groupKey: GroupKey;
  /** Columns this person hid, as `hidden-groups.ts` entries (BARY-47). */
  hiddenGroups: string[];
  /** Groups without an issue hide themselves (BARY-47). */
  hideEmptyGroups: boolean;
}

export function Board({
  issues,
  projectId,
  statuses,
  composer,
  hiddenCardFields,
  customFields,
  sortKey,
  groupKey,
  hiddenGroups,
  hideEmptyGroups,
}: BoardProps) {
  const lookups: IssueLookups = {
    projects: composer.projects,
    members: composer.members,
    labels: composer.labels,
    issueTypes: composer.issueTypes,
    customFields,
  };
  const t = useTranslations();
  const { toast } = useUI();
  const issueOpen = useIssueOpen(composer.workspaceId);
  const hasOpenModal = useHasOpenModal();

  const board = useBoardDnd(
    issues,
    sortKey,
    {
      statuses,
      issueTypes: composer.issueTypes,
      members: composer.members,
    },
    groupKey,
  );
  // Shift + wheel scrolls the columns horizontally, no matter where the pointer is.
  const scrollSetter = useShiftScroll();
  const containerRef = useRef<HTMLDivElement>(null);
  // A stable identity for the container ref (BARY-25): an inline arrow
  // function here would be a *new* ref on every render, so React would
  // detach it (call with `null`) and reattach it (call with the element)
  // every single time — each of those two calls runs `scrollSetter`, a
  // `useState` setter, which schedules a re-render of `Board` that then
  // creates yet another new inline ref, forever. `useCallback` keeps this
  // one function across renders, so React only calls it on actual
  // mount/unmount of the element.
  const setContainer = useCallback(
    (el: HTMLDivElement | null) => {
      containerRef.current = el;
      scrollSetter(el);
    },
    [scrollSetter],
  );

  const identifier = (issue: IssueDetail) =>
    `${lookups.projects.find((p) => p.id === issue.project)?.prefix ?? "?"}-${issue.key}`;

  // The keyboard cursor — which card j/k/arrows would move next, independent
  // of `isCardActive` (the one actually open in the panel). Columns are
  // recomputed from `board.getColumnIssues` on every render rather than
  // memoized: the board is small enough (a handful of columns, a few dozen
  // cards) that this isn't worth guarding against re-renders for.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const defs = groupDefs(
    groupKey,
    {
      statuses,
      priorities: composer.priorities,
      issueTypes: composer.issueTypes,
      members: composer.members,
    },
    {
      unassigned: t("fields.unassigned"),
      noStoryPoints: t("fields.noStoryPoints"),
    },
    issues,
  );
  // Every grouping adds a column per value in use; statuses list all of them,
  // but a status that isn't a workflow column (Canceled) is hidden here until
  // someone turns it on in the display settings (`isGroupHidden`).
  const allGroups = groupKey === "status" ? defs : visibleGroups(defs, issues);
  // Columns hidden in the display settings — one by one, or every empty one
  // (BARY-47) — are gone for everything below: drop targets, "Move to…", the
  // keyboard cursor. So nothing can land in one; the issues in them stay
  // exactly as they are.
  const groups = allGroups.filter(
    (g) =>
      !isGroupHidden(hiddenGroups, g, "board") &&
      !(hideEmptyGroups && board.getColumnIssues(g.id).length === 0),
  );
  const columns = groups.map((group) => ({
    group,
    issues: board.getColumnIssues(group.id),
  }));

  // ── Column switcher (narrow screens) ──
  // Shown only when the columns don't all fit next to each other; CSS hides
  // it on a desktop regardless. `activeId` is the column at the left edge —
  // it follows the board's own scrolling (swiping, the switcher, keys).
  const [overflowing, setOverflowing] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const scrollFrame = useRef(0);

  const syncActive = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    setOverflowing(container.scrollWidth > container.clientWidth + 1);
    let best: string | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const column of container.querySelectorAll<HTMLElement>(
      "[data-group-id]",
    )) {
      const distance = Math.abs(
        columnStart(column, container) - container.scrollLeft,
      );
      if (distance < bestDistance) {
        bestDistance = distance;
        best = column.dataset.groupId ?? null;
      }
    }
    setActiveId(best);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: measure again when columns come or go
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    syncActive();
    const observer = new ResizeObserver(syncActive);
    observer.observe(container);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(scrollFrame.current);
    };
  }, [syncActive, columns.length]);

  const selectColumn = (groupId: string) => {
    const container = containerRef.current;
    const column = container?.querySelector<HTMLElement>(
      `[data-group-id="${CSS.escape(groupId)}"]`,
    );
    if (!container || !column) return;
    setActiveId(groupId);
    container.scrollTo({
      left: columnStart(column, container),
      behavior: "smooth",
    });
  };

  const moveCard = (issue: IssueDetail, groupId: string) => {
    board.moveIssue(issue, groupId);
    const target = groups.find((g) => g.id === groupId);
    if (target) toast(t("issues.movedTo", { group: target.label }));
  };

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
    <div className={styles.wrap}>
      {overflowing && columns.length > 1 && (
        <BoardColumnSwitcher
          columns={columns.map(({ group, issues: columnIssues }) => ({
            group,
            count: columnIssues.length,
          }))}
          activeId={activeId ?? columns[0]?.group.id ?? null}
          onSelect={selectColumn}
          label={t("issues.boardColumns")}
        />
      )}
      <div
        ref={setContainer}
        className={styles.board}
        onScroll={() => {
          // Once per frame is plenty for a highlight.
          cancelAnimationFrame(scrollFrame.current);
          scrollFrame.current = requestAnimationFrame(syncActive);
        }}
      >
        {columns.map(({ group, issues: columnIssues }) => {
          const { isOver, onDragOver, onDragLeave, onDrop } =
            board.columnHandlers(group.id);
          return (
            <BoardColumn
              key={group.id}
              group={group}
              issues={columnIssues}
              projectId={projectId}
              // Without a fixed project the cards come from various ones — so
              // each one states which.
              showProject={projectId === undefined}
              lookups={lookups}
              composer={composer}
              hiddenCardFields={hiddenCardFields}
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
              isCardActive={(issue) =>
                identifier(issue) === issueOpen.openIssue
              }
              isCardFocused={(issue) => issue.id === focusedId}
              onCardOpen={(issue) => issueOpen.openPanel(identifier(issue))}
              onCardOpenInNewTab={(issue) =>
                issueOpen.openPageInNewTab(identifier(issue))
              }
              moveTargets={groups}
              onCardMoveTo={moveCard}
            />
          );
        })}
      </div>
    </div>
  );
}
