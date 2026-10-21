"use client";
import { Icon } from "@iconify/react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import type { ViewGroupsPatch } from "@/features/issues/actions";
import { BoardColumn } from "@/features/issues/components/BoardColumn/BoardColumn";
import { BoardColumnSwitcher } from "@/features/issues/components/BoardColumnSwitcher/BoardColumnSwitcher";
import { GroupIcon } from "@/features/issues/components/GroupIcon/GroupIcon";
import {
  type GroupDef,
  type GroupKey,
  groupDefs,
  laneEntry,
  visibleGroups,
} from "@/features/issues/group";
import { groupOrderEntries, orderGroups } from "@/features/issues/group-order";
import { isGroupHidden } from "@/features/issues/hidden-groups";
import { useIssueOpen } from "@/features/issues/issue-links";
import type { SortKey } from "@/features/issues/sort";
import type { IssueComposerData, IssueLookups } from "@/features/issues/types";
import { usePathname, useRouter } from "@/i18n/navigation";
import { useHasOpenModal } from "@/lib/context";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import { useUI } from "@/lib/ui-store";
import { useShiftScroll } from "@/lib/utils/useShiftScroll";
import type { IssueDetail, Status } from "@/types";
import styles from "./board.module.scss";
import { useBoardDnd } from "./useBoardDnd";

/** Left edge of a column inside the scroll container, minus its padding —
 *  measured on screen, so it holds whatever the column sits in (with
 *  swimlanes, a sticky row of column heads). */
function columnStart(column: HTMLElement, container: HTMLElement) {
  return (
    column.getBoundingClientRect().left -
    container.getBoundingClientRect().left +
    container.scrollLeft -
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
  /** How each column orders its cards — "manual" is drag-and-drop (BARY-34). */
  sortKey: SortKey;
  /** What the columns are: statuses by default, or another field (BARY-35). */
  groupKey: GroupKey;
  /** Columns this person hid, as `hidden-groups.ts` entries (BARY-47). */
  hiddenGroups: string[];
  /** Groups without an issue hide themselves (BARY-47). */
  hideEmptyGroups: boolean;
  /** Own order of the columns, `group-order.ts` entries (BARY-165). */
  groupOrder?: string[];
  /**
   * Where a column moved by its header handle is stored: the person's own
   * preference for this board (a bound Server Action), or — on a saved
   * view's page — the address, as an unsaved change of the view. Neither:
   * the columns can't be moved.
   */
  onGroupsChange?: (
    patch: ViewGroupsPatch,
  ) => Promise<{ ok: true } | { error: string }>;
  displayInUrl?: boolean;
  /** Swimlanes (BARY-173): a second grouping as horizontal lanes. */
  laneKey?: GroupKey | null;
  /** Lanes without an issue hide themselves. */
  hideEmptyLanes?: boolean;
  /** Lanes this person folded, "<laneKey>:<laneId>". */
  collapsedLanes?: string[];
  /** Stores the folded lanes — personal, wherever the board lives. */
  onCollapsedLanesChange?: (entries: string[]) => void;
}

export function Board({
  issues,
  projectId,
  statuses,
  composer,
  hiddenCardFields,
  sortKey,
  groupKey,
  hiddenGroups,
  hideEmptyGroups,
  groupOrder = [],
  onGroupsChange,
  displayInUrl = false,
  laneKey = null,
  hideEmptyLanes = false,
  collapsedLanes = [],
  onCollapsedLanesChange,
}: BoardProps) {
  const lookups: IssueLookups = {
    projects: composer.projects,
    members: composer.members,
    labels: composer.labels,
    issueTypes: composer.issueTypes,
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
    laneKey,
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
      projects: composer.projects,
    },
    {
      unassigned: t("fields.unassigned"),
      noStoryPoints: t("fields.noStoryPoints"),
    },
    issues,
  );
  // The column order shows right away when a column is dropped; the stored
  // one (preference or address) catches up and replaces it.
  const [order, setOrder] = useState(groupOrder);
  const storedOrder = groupOrder.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: resync on a new stored order only
  useEffect(() => setOrder(groupOrder), [storedOrder]);
  // While a column is dragged (BARY-165) the board shows where it would land:
  // the other columns move aside live, the dragged one stays as a
  // placeholder in its new slot. `preview` is that order, by group id.
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[] | null>(null);
  const storedDefs = orderGroups(defs, order);
  const orderedDefs = preview
    ? preview.flatMap((id) => storedDefs.filter((g) => g.id === id))
    : storedDefs;
  // Every grouping adds a column per value in use; statuses list all of them,
  // but a status that isn't a workflow column (Canceled) is hidden here until
  // someone turns it on in the display settings (`isGroupHidden`).
  const allGroups =
    groupKey === "status" ? orderedDefs : visibleGroups(orderedDefs, issues);
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

  // ── Swimlanes (BARY-173) ──
  // A lane per value of the second grouping: the ones with cards in the
  // drawn columns, plus those that always show (a workflow status, "no
  // assignee") — unless empty lanes hide themselves.
  const laneCount = (laneId: string) =>
    groups.reduce(
      (sum, g) => sum + board.getColumnIssues(g.id, laneId).length,
      0,
    );
  const lanes = laneKey
    ? groupDefs(
        laneKey,
        {
          statuses,
          priorities: composer.priorities,
          issueTypes: composer.issueTypes,
          members: composer.members,
          projects: composer.projects,
        },
        {
          unassigned: t("fields.unassigned"),
          noStoryPoints: t("fields.noStoryPoints"),
        },
        issues,
      ).filter((lane) => {
        const count = laneCount(lane.id);
        return hideEmptyLanes ? count > 0 : count > 0 || lane.alwaysShow;
      })
    : [];
  // Folding is personal and shows at once; the stored list catches up.
  const [folded, setFolded] = useState(() => new Set(collapsedLanes));
  const foldedKey = collapsedLanes.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: resync on a new stored list only
  useEffect(() => setFolded(new Set(collapsedLanes)), [foldedKey]);
  // An empty lane starts folded — there's nothing to see in it. Opened
  // (to drop a card into it), it stays open for this visit only; once it
  // holds cards, the stored list decides as for any other lane.
  const [openedEmpty, setOpenedEmpty] = useState<Set<string>>(() => new Set());
  const isFolded = (lane: GroupDef) =>
    laneKey !== null &&
    (laneCount(lane.id) === 0
      ? !openedEmpty.has(lane.id)
      : folded.has(laneEntry(laneKey, lane.id)));
  const toggleLane = (lane: GroupDef) => {
    if (!laneKey) return;
    if (laneCount(lane.id) === 0) {
      const next = new Set(openedEmpty);
      if (next.has(lane.id)) next.delete(lane.id);
      else next.add(lane.id);
      setOpenedEmpty(next);
      return;
    }
    const entry = laneEntry(laneKey, lane.id);
    const next = new Set(folded);
    if (next.has(entry)) next.delete(entry);
    else next.add(entry);
    setFolded(next);
    // A view stores it with the person's own view state; the plain board
    // with its other personal settings.
    if (onCollapsedLanesChange) onCollapsedLanesChange([...next]);
    else void onGroupsChange?.({ collapsedLanes: [...next] });
  };

  // What the keyboard walks through: per open lane (or the whole board
  // without lanes), the cards of each column.
  const navLanes: (GroupDef | null)[] = laneKey
    ? lanes.filter((lane) => !isFolded(lane))
    : [null];
  const grid = navLanes.map((lane) =>
    groups.map((g) => board.getColumnIssues(g.id, lane?.id)),
  );

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

  // ── Moving whole columns by their header handle (BARY-165) ──
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startOrderTransition] = useTransition();
  const canMoveColumns = displayInUrl || !!onGroupsChange;

  const saveOrder = (next: GroupDef[]) => {
    const entries = groupOrderEntries(next);
    setOrder(entries);
    if (displayInUrl) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("order", entries.join(","));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    } else if (onGroupsChange) {
      startOrderTransition(async () => {
        await onGroupsChange({ groupOrder: entries });
        router.refresh();
      });
    }
  };

  // A drop commits the preview; a drag that ends anywhere else puts the
  // columns back.
  const dropped = useRef(false);

  const startColumnDrag = (group: GroupDef) => (e: React.DragEvent) => {
    dropped.current = false;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/x-barynt-column", group.id);
    // The whole column follows the pointer, not just the header.
    const column = (e.currentTarget as HTMLElement).closest<HTMLElement>(
      "[data-group-id]",
    );
    if (column) {
      const rect = column.getBoundingClientRect();
      e.dataTransfer.setDragImage(
        column,
        e.clientX - rect.left,
        e.clientY - rect.top,
      );
    }
    // Next frame: the drag image is taken from the column as it is now,
    // before it turns into the placeholder.
    const ids = storedDefs.map((g) => g.id);
    requestAnimationFrame(() => {
      setDraggedColumn(group.id);
      setPreview(ids);
    });
  };

  const endColumnDrag = () => {
    setDraggedColumn(null);
    setPreview(null);
  };

  /** While a column is being dragged, the columns take it instead of cards:
   *  hovering one moves the dragged column to its side — after it when it's
   *  to the right, before it when it's to the left — so the columns swap
   *  places as the pointer crosses them. */
  const columnDropHandlers = (group: GroupDef) => ({
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      if (!draggedColumn || !preview || group.id === draggedColumn) return;
      const from = preview.indexOf(draggedColumn);
      const over = preview.indexOf(group.id);
      if (from === -1 || over === -1) return;
      const next = preview.filter((id) => id !== draggedColumn);
      next.splice(
        next.indexOf(group.id) + (over > from ? 1 : 0),
        0,
        draggedColumn,
      );
      if (next.join(",") !== preview.join(",")) setPreview(next);
    },
    onDragLeave: () => {},
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      dropped.current = true;
      const next = orderedDefs;
      const changed =
        next.map((g) => g.id).join(",") !==
        storedDefs.map((g) => g.id).join(",");
      endColumnDrag();
      if (changed) saveOrder(next);
    },
  });

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
        ? (grid.flat(2).find((i) => identifier(i) === issueOpen.openIssue)
            ?.id ?? null)
        : null);
    if (!targetId) return null;
    for (let lane = 0; lane < grid.length; lane++) {
      for (let col = 0; col < grid[lane].length; col++) {
        const row = grid[lane][col].findIndex((i) => i.id === targetId);
        if (row !== -1) return { lane, col, row };
      }
    }
    return null;
  };

  /** Nearest column with at least one card in `lane`, walking from
   *  `fromCol` in `direction` (±1) — skips empty ones instead of landing
   *  on nothing. */
  const nextNonEmptyColumn = (
    lane: number,
    fromCol: number,
    direction: 1 | -1,
  ) => {
    const cells = grid[lane];
    let col = fromCol + direction;
    while (col >= 0 && col < cells.length && cells[col].length === 0) {
      col += direction;
    }
    return col >= 0 && col < cells.length ? col : null;
  };

  /** The nearest lane with cards in column `col`, walking from `fromLane`
   *  in `direction` — down from a lane's last card goes on into the next. */
  const nextNonEmptyLane = (
    fromLane: number,
    col: number,
    direction: 1 | -1,
  ) => {
    let lane = fromLane + direction;
    while (lane >= 0 && lane < grid.length && grid[lane][col].length === 0) {
      lane += direction;
    }
    return lane >= 0 && lane < grid.length ? lane : null;
  };

  /** `dCol`/`dRow` are mutually exclusive — one call moves along one axis. */
  const move = (dCol: number, dRow: number) => {
    const pos = findPosition();
    if (!pos) {
      for (const cells of grid) {
        const first = cells.find((c) => c.length > 0);
        if (first) {
          focus(first[0]);
          return;
        }
      }
      return;
    }

    if (dRow !== 0) {
      const cell = grid[pos.lane][pos.col];
      const nextRow = pos.row + dRow;
      if (nextRow >= 0 && nextRow < cell.length) {
        focus(cell[nextRow]);
        return;
      }
      const down = dRow > 0;
      // Off the cell's edge: on into the same column of the next lane…
      const lane = nextNonEmptyLane(pos.lane, pos.col, down ? 1 : -1);
      if (lane !== null) {
        const target = grid[lane][pos.col];
        focus(down ? target[0] : target[target.length - 1]);
        return;
      }
      // …or, past the last lane (and on a board without lanes), into the
      // adjacent column — down from the last card lands on the next
      // column's first, up from the first on the previous column's last.
      const col = nextNonEmptyColumn(pos.lane, pos.col, down ? 1 : -1);
      if (col === null) return;
      const target = grid[pos.lane][col];
      focus(down ? target[0] : target[target.length - 1]);
      return;
    }

    // Across columns, within the lane: skip empty ones in the same
    // direction rather than landing on a column with nothing to focus.
    const col = nextNonEmptyColumn(pos.lane, pos.col, dCol > 0 ? 1 : -1);
    if (col === null) return;
    const target = grid[pos.lane][col];
    focus(target[Math.min(pos.row, target.length - 1)]);
  };

  const openFocused = () => {
    const pos = findPosition();
    if (!pos) return;
    issueOpen.open(identifier(grid[pos.lane][pos.col][pos.row]));
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

  /** One column — whole, as a lane's cell, or as the head above the lanes. */
  const renderColumn = (
    group: GroupDef,
    columnIssues: IssueDetail[],
    variant: "column" | "head" | "cell" = "column",
    lane?: GroupDef,
  ) => {
    const laneId = lane?.id;
    const cardHandlers = board.columnHandlers(group.id, laneId);
    const { onDragOver, onDragLeave, onDrop } = draggedColumn
      ? columnDropHandlers(group)
      : variant === "head"
        ? // The head takes no cards — they land in a lane's cell.
          { onDragOver: () => {}, onDragLeave: () => {}, onDrop: () => {} }
        : cardHandlers;
    const isOver = !draggedColumn && variant !== "head" && cardHandlers.isOver;
    return (
      <BoardColumn
        key={laneId === undefined ? group.id : `${laneId}:${group.id}`}
        variant={variant}
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
        isCardActive={(issue) => identifier(issue) === issueOpen.openIssue}
        isCardFocused={(issue) => issue.id === focusedId}
        onCardOpen={(issue) => issueOpen.open(identifier(issue))}
        onCardOpenInNewTab={(issue) =>
          issueOpen.openPageInNewTab(identifier(issue))
        }
        moveTargets={groups}
        onCardMoveTo={moveCard}
        columnDrag={
          canMoveColumns && variant !== "cell"
            ? {
                label: t("issues.moveColumn", { group: group.label }),
                dragging: draggedColumn === group.id,
                onStart: startColumnDrag(group),
                onEnd: () => {
                  if (!dropped.current) endColumnDrag();
                },
              }
            : undefined
        }
      />
    );
  };

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
        className={`${styles.board}${laneKey ? ` ${styles.laned}` : ""}`}
        onScroll={() => {
          // Once per frame is plenty for a highlight.
          cancelAnimationFrame(scrollFrame.current);
          scrollFrame.current = requestAnimationFrame(syncActive);
        }}
      >
        {laneKey ? (
          // Swimlanes (BARY-173): the column heads once, sticky on top; then
          // a lane per value — its head sticky on the left, its cells below.
          <div className={styles.lanes}>
            <div className={styles.laneHeads}>
              {columns.map(({ group, issues: columnIssues }) =>
                renderColumn(group, columnIssues, "head"),
              )}
            </div>
            {lanes.map((lane) => {
              const folded = isFolded(lane);
              const count = laneCount(lane.id);
              return (
                <section
                  key={lane.id}
                  className={styles.lane}
                  data-folded={folded || undefined}
                  data-empty={count === 0 || undefined}
                  aria-label={lane.label}
                >
                  <button
                    type="button"
                    className={styles.laneHead}
                    aria-expanded={!folded}
                    title={t(
                      folded ? "actions.expandGroup" : "actions.collapseGroup",
                    )}
                    onClick={() => toggleLane(lane)}
                  >
                    <Icon
                      icon="lucide:chevron-down"
                      width={15}
                      className={styles.laneChevron}
                    />
                    <GroupIcon group={lane} size={18} />
                    <span className={styles.laneTitle}>{lane.label}</span>
                    <Badge mono>{count}</Badge>
                    {/* Folded, the lane still says what it holds. */}
                    {folded && (
                      <span className={styles.laneCounts}>
                        {groups.map((g) => {
                          const n = board.getColumnIssues(g.id, lane.id).length;
                          return n > 0 ? (
                            <span key={g.id}>
                              {g.label} {n}
                            </span>
                          ) : null;
                        })}
                      </span>
                    )}
                  </button>
                  {!folded && (
                    <div className={styles.laneCells}>
                      {groups.map((g) =>
                        renderColumn(
                          g,
                          board.getColumnIssues(g.id, lane.id),
                          "cell",
                          lane,
                        ),
                      )}
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        ) : (
          columns.map(({ group, issues: columnIssues }) =>
            renderColumn(group, columnIssues),
          )
        )}
      </div>
    </div>
  );
}
