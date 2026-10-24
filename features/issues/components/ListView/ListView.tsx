"use client";

import { Icon } from "@iconify/react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import {
  Table,
  type TableColumn,
  type TableGroup,
} from "@/components/ui/layout/Table/Table";
import {
  type TableDndAnnouncement,
  useTableDnd,
} from "@/components/ui/layout/Table/useTableDnd";
import type { TableSort } from "@/components/ui/layout/Table/useTableSort";
import { updateBehavior } from "@/features/account/actions";
import { reorderIssue, updateIssue } from "@/features/issues/actions";
import { AssigneePicker } from "@/features/issues/components/AssigneePicker/AssigneePicker";
import { IssueTitleField } from "@/features/issues/components/IssueTitleField/IssueTitleField";
import {
  ESTIMATE_UNIT_ABBR,
  formatEstimateValue,
} from "@/features/issues/estimate";
import {
  type GroupKey,
  groupDefs,
  groupIdOf,
  groupPatch,
  visibleGroups,
} from "@/features/issues/group";
import { orderGroups } from "@/features/issues/group-order";
import { isGroupHidden } from "@/features/issues/hidden-groups";
import { useIssueOpen } from "@/features/issues/issue-links";
import {
  CARD_ROW_COLUMNS,
  COLUMN_FIELD,
  COLUMN_SORT,
  columnOfSort,
  FIXED_LIST_COLUMNS,
  LIST_COLUMNS,
  type ListColumn,
  listColumns,
  SUMMED_LIST_COLUMNS,
  UNSIZED_LIST_COLUMNS,
} from "@/features/issues/list-columns";
import { setListColumnsControl } from "@/features/issues/list-columns-control";
import { rankBetween } from "@/features/issues/rank";
import { type SortKey, sortByKey } from "@/features/issues/sort";
import type { IssueComposerData } from "@/features/issues/types";
import {
  type DetailFieldKey,
  visibleDetailFields,
} from "@/features/projects/detail-fields";
import { useHasOpenModal } from "@/lib/context";
import { usePreferences } from "@/lib/preferences/PreferencesContext";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import { useUI } from "@/lib/ui-store";
import { COMPACT_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import type { IssueDetail } from "@/types";
import { ColumnPicker } from "./components/ColumnPicker";
import { ColumnTools } from "./components/ColumnTools";
import {
  CommentsCell,
  CreatedCell,
  DueDateCell,
  EstimateCell,
  LabelsCell,
  PriorityCell,
  ProjectCell,
  ReporterCell,
  StatusCell,
  StoryPointsCell,
  TypeCell,
  UpdatedCell,
} from "./components/IssueCells";
import { IssueRowLink } from "./components/IssueRowLink";
import { ListGroupHeader } from "./components/ListGroupHeader";
import styles from "./listView.module.scss";

interface ListViewProps {
  issues: IssueDetail[];
  /**
   * The project a new task is created in. Without one — for instance for
   * "my issues" spanning all projects — the "+" in the group header is
   * left out, and instead a column per row states which project it comes
   * from.
   */
  projectId?: string;
  /**
   * One bundle for everything: the cells use it to resolve project,
   * assignee, labels, types, status, and priorities; the group headers feed
   * their composer from it. The same prop as on the board.
   */
  composer: IssueComposerData;
  /** This person's hidden row fields for this list (BARY-33). */
  hiddenCardFields: string[];
  /** How each group orders its rows — "manual" is drag-and-drop (BARY-34). */
  sortKey: SortKey;
  /** What the groups are: statuses by default, or another field (BARY-35). */
  groupKey: GroupKey;
  /** Groups this person hid, as `hidden-groups.ts` entries (BARY-47). */
  hiddenGroups: string[];
  /** Groups without an issue hide themselves (BARY-47). */
  hideEmptyGroups: boolean;
  /** Own order of the groups, `group-order.ts` entries (BARY-165). */
  groupOrder?: string[];
  /** What's shown instead of the empty table. Default: "No tasks". */
  emptyTitle?: string;
  /** The list's own columns in order (BARY-175); empty: the default. */
  columns?: string[];
  /** Fields hidden on the board — a list without columns of its own leaves
   *  them out too, so both start out showing the same. */
  boardHiddenFields?: string[];
  /** Stores a new column choice or order — the person's own list. */
  onColumnsChange?: (columns: string[]) => void;
  /** A saved view's columns live in its address (`?cols=`), like the rest
   *  of its display — changing them makes it unsaved. */
  columnsInUrl?: boolean;
  /** The order turned round (`?dir=desc`, a header's second click). */
  sortReversed?: boolean;
}

/** Columns as narrow as their content — no `max-content` track. */
const NARROW_LIST_COLUMNS: readonly ListColumn[] = [
  "priority",
  "identifier",
  "status",
  "type",
  "assignee",
];

/** Columns aligned to the end: values to compare down a column. */
const END_LIST_COLUMNS: readonly ListColumn[] = [
  "labels",
  "comments",
  "assignee",
  "storyPoints",
  "estimate",
  "dueDate",
  "created",
  "updated",
  "reporter",
];

/**
 * Issues as a table, grouped by status. A row opens the issue, the pickers
 * in priority, status, and assignee change it directly from the list.
 * Dragging reorders — within a group and across its boundary, which
 * changes the status. Same rank calculation as on the board.
 */
export function ListView({
  issues,
  projectId,
  composer,
  hiddenCardFields,
  sortKey,
  groupKey,
  hiddenGroups,
  hideEmptyGroups,
  groupOrder = [],
  emptyTitle,
  columns: storedColumns = [],
  boardHiddenFields = hiddenCardFields,
  onColumnsChange,
  columnsInUrl = false,
  sortReversed = false,
}: ListViewProps) {
  const { projects, members, labels, statuses, priorities, issueTypes } =
    composer;
  const t = useTranslations();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const issueOpen = useIssueOpen(composer.workspaceId);
  const [, startTransition] = useTransition();
  // Collapsed groups are purely a view concern — nothing the URL or the
  // server would need to know about.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // Which row is currently editing its title. The list holds this, not the
  // cell: the table needs to know that this one row can't be dragged for
  // the duration.
  const [editing, setEditing] = useState<string | null>(null);

  // Whatever just changed shows up immediately; the server catches up
  // afterward. Without this, the row would jump back to its old place for
  // the duration of the action — or show its old title again.
  const [shown, applyPatch] = useOptimistic(
    issues,
    (state, patch: { id: string } & Partial<IssueDetail>) =>
      state.map((issue) =>
        issue.id === patch.id ? { ...issue, ...patch } : issue,
      ),
  );

  const saveTitle = (issue: IssueDetail, title: string) =>
    startTransition(async () => {
      applyPatch({ id: issue.id, title });
      await updateIssue(issue.id, { title });
      router.refresh();
    });

  const toggleGroup = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const identifier = (issue: IssueDetail) =>
    `${projects.find((p) => p.id === issue.project)?.prefix ?? "?"}-${issue.key}`;

  // Per row, not once for the whole table — a cross-project list ("my
  // issues") can mix projects with different field visibility.
  const isFieldVisible = (issue: IssueDetail, key: DetailFieldKey) => {
    const project = projects.find((p) => p.id === issue.project);
    // This person's own choice is the columns (BARY-175) — what's left is
    // whether the project uses the field at all.
    return visibleDetailFields(project?.hiddenDetailFields ?? []).has(key);
  };

  // The open issue is stored as an identifier in the URL — the detail view
  // uses the same source, so the matching row highlights itself without
  // its own state.
  const openIssue = issueOpen.openIssue;

  // Always-shown groups (workflow statuses, priorities, …) exist even when
  // empty, so the "+" in the header stays reachable. All others only if
  // issues are in them.
  const defs = groupDefs(
    groupKey,
    { statuses, priorities, issueTypes, members, projects },
    {
      unassigned: t("fields.unassigned"),
      noStoryPoints: t("fields.noStoryPoints"),
    },
    shown,
  );
  const allGroups = visibleGroups(orderGroups(defs, groupOrder), shown);
  // Groups hidden in the display settings — one by one, or every empty one
  // (BARY-47) — leave the table altogether: no rows, no drop
  // target, no "Move to…" entry — the issues in them stay as they are.
  const shownDefs = allGroups.filter(
    (g) =>
      !isGroupHidden(hiddenGroups, g, "list") &&
      !(
        hideEmptyGroups &&
        !shown.some((issue) => groupIdOf(issue, groupKey) === g.id)
      ),
  );
  const groups: TableGroup<IssueDetail>[] = shownDefs.map((group) => {
    // By rank, not by creation date — otherwise the row would end up
    // somewhere other than where it was dropped after a drag.
    const rows = sortByKey(
      shown.filter((issue) => groupIdOf(issue, groupKey) === group.id),
      sortKey,
      { statuses, issueTypes, members },
      sortReversed,
    );
    return {
      id: group.id,
      label: group.label,
      collapsed: collapsed.has(group.id),
      header: (
        <ListGroupHeader
          group={group}
          count={rows.length}
          projectId={projectId}
          composer={composer}
          collapsed={collapsed.has(group.id)}
          onToggle={() => toggleGroup(group.id)}
        />
      ),
      rows,
    };
  });

  // The keyboard cursor — which row j/k/arrows would move next, independent
  // of `openIssue` (the one actually shown in the panel). Flattened across
  // groups in display order, skipping collapsed ones: up/down moves through
  // the list exactly as it's drawn, not the underlying grouping.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const flatRows = groups.flatMap((g) => (g.collapsed ? [] : g.rows));
  const containerRef = useRef<HTMLDivElement>(null);
  const hasOpenModal = useHasOpenModal();
  // A phone or tablet shows the rows as cards and only reads them: a tap
  // opens the issue, a long press the quick actions; nothing is edited in
  // place or dragged (`listView.module.scss`).
  const isCompact = useMediaQuery(COMPACT_QUERY);
  const { toast } = useUI();

  const focusRow = (issue: IssueDetail) => {
    setFocusedId(issue.id);
    // A panel already open stays live-synced to the cursor — Linear's
    // "peek": j/k move through issues while the preview updates
    // immediately, no separate Enter needed for each one. Safe against the
    // toggle-closes-on-second-click behavior in `openPanel`: movement
    // always lands on a *different* issue than the one already open.
    // (Arrow keys can't reach here while a panel is open — see the
    // shortcut bindings below — so this only ever fires from j/k once
    // the panel is up.)
    if (openIssue) issueOpen.openPanel(identifier(issue));
    requestAnimationFrame(() => {
      containerRef.current
        ?.querySelector(`[data-row-key="${CSS.escape(issue.id)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const moveFocus = (delta: number) => {
    // Without a cursor of its own yet, continue from whatever's already
    // open (e.g. opened by a click) rather than jumping back to the first
    // row — "further" should mean further from there.
    const targetId =
      focusedId ??
      (openIssue
        ? (flatRows.find((r) => identifier(r) === openIssue)?.id ?? null)
        : null);
    const index = flatRows.findIndex((row) => row.id === targetId);
    if (index === -1) {
      if (flatRows.length > 0) focusRow(flatRows[0]);
      return;
    }
    const next = index + delta;
    if (next >= 0 && next < flatRows.length) focusRow(flatRows[next]);
  };

  const openFocused = () => {
    const row = flatRows.find((r) => r.id === focusedId);
    if (row) issueOpen.open(identifier(row));
  };

  // j/k always move the row cursor, even with a panel open — that's the
  // "peek" navigation in `focusRow()` above. Arrow keys do the same, but
  // only while no panel is open: with one open, arrows belong to it
  // instead of hijacking the row cursor underneath.
  const noPanelOpen = !hasOpenModal && !openIssue;
  useShortcut("down", () => moveFocus(1), { enabled: noPanelOpen });
  useShortcut("j", () => moveFocus(1), { enabled: !hasOpenModal });
  useShortcut("up", () => moveFocus(-1), { enabled: noPanelOpen });
  useShortcut("k", () => moveFocus(-1), { enabled: !hasOpenModal });
  // Disabled once a panel is open, same as up/down above — otherwise
  // Enter on a field inside it (a picker button, the description preview)
  // would also fire this: `openPanel` toggle-closes on the issue that's
  // already open, so the panel would vanish under you mid-edit.
  useShortcut("enter", openFocused, { enabled: noPanelOpen && !!focusedId });
  useShortcut("o", openFocused, { enabled: noPanelOpen && !!focusedId });

  /** "Move to…" from the quick-action sheet: the end of the target group. */
  const moveRow = (issue: IssueDetail, groupId: string) => {
    if (groupIdOf(issue, groupKey) === groupId) return;
    const target = groups.find((g) => g.id === groupId);
    if (!target) return;
    const rows = target.rows.filter((r) => r.id !== issue.id);
    const rank = rankBetween(rows[rows.length - 1] ?? null, null);
    const patch = groupPatch(groupKey, groupId);
    toast(t("issues.movedTo", { group: target.label ?? "" }));
    startTransition(async () => {
      applyPatch({ id: issue.id, ...patch, rank } as {
        id: string;
      } & Partial<IssueDetail>);
      await reorderIssue(issue.id, patch.status ?? issue.status, rank);
      if (groupKey !== "status") await updateIssue(issue.id, patch);
      router.refresh();
    });
  };

  // ── Columns (BARY-175): chosen, ordered and sized by the person ──
  const [ownColumns, setOwnColumns] = useState(storedColumns);
  const storedKey = storedColumns.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: resync on a new stored list only
  useEffect(() => setOwnColumns(storedColumns), [storedKey]);
  // A field the project turned off has no column — across projects, only
  // one every project turned off.
  const scopeProjects = projectId
    ? projects.filter((p) => p.id === projectId)
    : projects;
  const offField = (id: ListColumn) => {
    const field = COLUMN_FIELD[id];
    return (
      field !== undefined &&
      scopeProjects.length > 0 &&
      scopeProjects.every(
        (p) => !visibleDetailFields(p.hiddenDetailFields ?? []).has(field),
      )
    );
  };
  const available = (id: ListColumn) =>
    // Within one project every row would name the same one.
    (id !== "project" || projectId === undefined) && !offField(id);
  const chosen = listColumns(ownColumns, boardHiddenFields).filter(available);
  const saveColumns = (next: ListColumn[]) => {
    setOwnColumns(next);
    if (columnsInUrl) {
      const params = new URLSearchParams(searchParams.toString());
      params.set("cols", next.join(","));
      router.push(`${pathname}?${params.toString()}`, { scroll: false });
    } else onColumnsChange?.(next);
  };

  // The display panel offers the same switches as the "+" (BARY-175).
  const offeredColumns = LIST_COLUMNS.filter(
    (c) => !FIXED_LIST_COLUMNS.includes(c) && available(c),
  );
  const saveRef = useRef(saveColumns);
  saveRef.current = saveColumns;
  const chosenKey = chosen.join(",");
  const offeredKey = offeredColumns.join(",");
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-register on a new choice only
  useEffect(() => {
    // A phone's card rows have no columns to choose.
    setListColumnsControl(
      isCompact
        ? null
        : {
            shown: chosen,
            offered: offeredColumns,
            onChange: (next) => saveRef.current(next),
          },
    );
  }, [chosenKey, offeredKey, isCompact]);
  useEffect(() => () => setListColumnsControl(null), []);

  // A phone or tablet keeps its card rows as they were — the fields the
  // person shows on cards, not the table's own columns — plus the comment
  // count.
  const shownColumns: ListColumn[] = isCompact
    ? (() => {
        return CARD_ROW_COLUMNS.filter(
          (id) => available(id) && !hiddenCardFields.includes(id),
        );
      })()
    : // Grouped by status, every row of a group says the same.
      chosen.filter((id) => id !== "status" || groupKey !== "status");

  // Widths are the person's own, the same in every list; a drag shows at
  // once and is stored on release.
  const { listColumnWidths } = usePreferences();
  const [widths, setWidths] = useState(listColumnWidths);
  const commitWidths = (next: Record<string, number>) => {
    setWidths(next);
    void updateBehavior({ listColumnWidths: next });
  };

  // A column dragged by its header to another place.
  const dragColumn = useRef<ListColumn | null>(null);
  const [dropAt, setDropAt] = useState<{
    column: ListColumn;
    side: "before" | "after";
  } | null>(null);
  const moveColumn = (
    column: ListColumn,
    target: ListColumn,
    side: "before" | "after",
  ) => {
    if (column === target) return;
    const next = chosen.filter((c) => c !== column);
    const at = next.indexOf(target) + (side === "after" ? 1 : 0);
    next.splice(at, 0, column);
    saveColumns(next);
  };

  // Sorting from a header writes the address, like the order picker in the
  // display panel: `?sort=` and, turned round, `?dir=desc`.
  const sortedColumn = columnOfSort(sortKey);
  const setSortFrom = (
    column: ListColumn,
    state: "natural" | "reversed" | "off",
  ) => {
    const params = new URLSearchParams(searchParams.toString());
    const key = COLUMN_SORT[column];
    if (state === "off" || !key) {
      params.set("sort", "manual");
      params.delete("dir");
    } else {
      params.set("sort", key);
      if (state === "reversed") params.set("dir", "desc");
      else params.delete("dir");
    }
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const tableSort: TableSort = {
    columnId: sortedColumn,
    direction: sortReversed ? "desc" : "asc",
    toggle: (id) => {
      const column = id as ListColumn;
      if (sortedColumn !== column) setSortFrom(column, "natural");
      else if (!sortReversed) setSortFrom(column, "reversed");
      else setSortFrom(column, "off");
    },
  };

  const cellOf = (id: ListColumn): TableColumn<IssueDetail>["cell"] => {
    switch (id) {
      case "priority":
        return (issue) =>
          isFieldVisible(issue, "priority") ? (
            <PriorityCell issue={issue} priorities={priorities} />
          ) : null;
      case "identifier":
        return (issue) => (
          <span className={styles.identifier}>{identifier(issue)}</span>
        );
      case "project":
        return (issue) => <ProjectCell issue={issue} projects={projects} />;
      case "status":
        return (issue) => <StatusCell issue={issue} statuses={statuses} />;
      case "type":
        return (issue) => <TypeCell issue={issue} issueTypes={issueTypes} />;
      case "title":
        // The title is its own trigger: click and type. It therefore sits
        // above the row link — the issue is opened via the rest of the row.
        //
        // Without issue.update.any/.own it stays plain text: the server
        // would reject the patch anyway (`updateIssue`), and a button that
        // triggers nothing is just a false invitation.
        return (issue) =>
          editing === issue.id && issue.access.canEdit ? (
            <IssueTitleField
              className={styles.titleEdit}
              value={issue.title}
              onSave={(value) => saveTitle(issue, value)}
              onDone={() => setEditing(null)}
            />
          ) : issue.access.canEdit && !isCompact ? (
            <button
              type="button"
              className={styles.title}
              title={t("actions.editTitle")}
              onClick={() => setEditing(issue.id)}
            >
              {issue.title}
            </button>
          ) : (
            <span className={styles.title} data-readonly>
              {issue.title}
            </span>
          );
      case "labels":
        return (issue) =>
          isFieldVisible(issue, "labels") ? (
            <LabelsCell issue={issue} labels={labels} />
          ) : null;
      case "comments":
        return (issue) => <CommentsCell issue={issue} />;
      case "assignee":
        return (issue) => (
          <AssigneePicker
            issue={issue}
            members={members}
            readOnly={isCompact}
          />
        );
      case "storyPoints":
        return (issue) =>
          isFieldVisible(issue, "storyPoints") ? (
            <StoryPointsCell issue={issue} />
          ) : null;
      case "estimate":
        return (issue) =>
          isFieldVisible(issue, "estimateHours") ? (
            <EstimateCell issue={issue} />
          ) : null;
      case "dueDate":
        return (issue) =>
          isFieldVisible(issue, "dueDate") ? (
            <DueDateCell issue={issue} />
          ) : null;
      case "created":
        return (issue) => <CreatedCell issue={issue} />;
      case "updated":
        return (issue) => <UpdatedCell issue={issue} />;
      case "reporter":
        return (issue) => <ReporterCell issue={issue} members={members} />;
    }
  };

  /** Sums under each group and the whole list. */
  const totalOf = (id: ListColumn) => {
    if (id === "storyPoints")
      return (rows: IssueDetail[]) => {
        const points = rows.filter((r) => r.storyPoints !== null);
        return points.length ? (
          <span className={styles.number}>
            {points.reduce((sum, r) => sum + (r.storyPoints ?? 0), 0)}
          </span>
        ) : null;
      };
    if (id === "estimate")
      return (rows: IssueDetail[]) => {
        const hours = rows.filter((r) => r.estimateHours !== null);
        return hours.length ? (
          <span className={styles.number}>
            {formatEstimateValue(
              hours.reduce((sum, r) => sum + (r.estimateHours ?? 0), 0),
            )}{" "}
            {ESTIMATE_UNIT_ABBR.hours}
          </span>
        ) : null;
      };
    return undefined;
  };

  const columns = shownColumns.map((id): TableColumn<IssueDetail> => {
    const label = t(`issues.table.col_${id}`);
    const width = widths[id];
    const sortable = COLUMN_SORT[id] !== undefined;
    const fixed = FIXED_LIST_COLUMNS.includes(id);
    // The title takes what's left; its edge sizes the column after it.
    const after = shownColumns[shownColumns.indexOf(id) + 1];
    const sizes: ListColumn | undefined = UNSIZED_LIST_COLUMNS.includes(id)
      ? after && !UNSIZED_LIST_COLUMNS.includes(after)
        ? after
        : undefined
      : id;
    const sizedWidth = sizes ? widths[sizes] : undefined;
    return {
      id,
      width:
        id === "title"
          ? "minmax(0, 1fr)"
          : width
            ? `${width}px`
            : NARROW_LIST_COLUMNS.includes(id)
              ? undefined
              : "max-content",
      align: END_LIST_COLUMNS.includes(id) ? "end" : undefined,
      cell: cellOf(id),
      ...(SUMMED_LIST_COLUMNS.includes(id) && { total: totalOf(id) }),
      // A phone's card rows have no header row.
      ...(!isCompact && {
        header: <span className={styles.columnLabel}>{label}</span>,
        ...(sortable && { sortValue: () => null }),
        headerExtra: (
          <ColumnTools
            label={label}
            sort={
              sortable
                ? { active: sortedColumn === id, reversed: sortReversed }
                : null
            }
            onSort={(state) => setSortFrom(id, state)}
            onHide={
              fixed
                ? undefined
                : () => saveColumns(chosen.filter((c) => c !== id))
            }
            resize={
              sizes
                ? {
                    width: sizedWidth,
                    next: sizes !== id,
                    // The menu resets this column's own width only.
                    custom: sizes === id && sizedWidth !== undefined,
                    onChange: (w) =>
                      setWidths((cur) => ({ ...cur, [sizes]: w })),
                    onCommit: (w) => commitWidths({ ...widths, [sizes]: w }),
                    onReset: () => {
                      const { [sizes]: _gone, ...rest } = widths;
                      commitWidths(rest);
                    },
                  }
                : undefined
            }
          />
        ),
        headerProps: {
          draggable: true,
          "data-drop": dropAt?.column === id ? dropAt.side : undefined,
          onDragStart: (e: React.DragEvent) => {
            dragColumn.current = id;
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", label);
          },
          onDragOver: (e: React.DragEvent<HTMLTableCellElement>) => {
            if (!dragColumn.current) return;
            e.preventDefault();
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            const side =
              e.clientX < rect.left + rect.width / 2 ? "before" : "after";
            if (dropAt?.column !== id || dropAt.side !== side)
              setDropAt({ column: id, side });
          },
          onDrop: (e: React.DragEvent) => {
            if (!dragColumn.current) return;
            e.preventDefault();
            e.stopPropagation();
            if (dropAt) moveColumn(dragColumn.current, id, dropAt.side);
            dragColumn.current = null;
            setDropAt(null);
          },
          onDragEnd: () => {
            dragColumn.current = null;
            setDropAt(null);
          },
        } as React.HTMLAttributes<HTMLTableCellElement>,
      }),
    };
  });

  // The "+" at the end of the header row — every column to switch on.
  if (!isCompact)
    columns.push({
      id: "_columns",
      width: "2.5rem",
      align: "end",
      header: (
        <ColumnPicker
          shown={chosen}
          available={available}
          onChange={saveColumns}
        />
      ),
      cell: () => null,
    });

  // What the screen reader hears when reordering via keyboard. The table
  // knows neither language nor status — it only supplies row, group, and
  // position.
  const announce = ({
    row,
    groupId,
    position,
    total,
    phase,
  }: TableDndAnnouncement<IssueDetail>) => {
    const name = `${identifier(row)} ${row.title}`;
    if (phase === "grabbed") return t("a11y.reorderGrabbed", { name });
    if (phase === "cancelled") return t("a11y.reorderCancelled", { name });
    const group = defs.find((d) => d.id === groupId)?.label ?? "";
    return phase === "moved"
      ? t("a11y.reorderMoved", { position, total, group })
      : t("a11y.reorderDropped", { name, position, total, group });
  };

  const dnd = useTableDnd<IssueDetail>({
    groups,
    getRowKey: (issue) => issue.id,
    // Whoever is currently editing isn't dragged: a draggable row would
    // steal mouse text selection from the field inside it. Not without
    // issue.update.any/.own either — dragging changes the status
    // (`reorderIssue`), which the server rejects without those permissions.
    canDrag: (issue) => issue.id !== editing && issue.access.canEdit,
    rowLabel: (issue) =>
      t("actions.reorder", { name: `${identifier(issue)} ${issue.title}` }),
    announce,
    // A row that ends up in a different group takes on that group's value
    // (its status, priority, …) — the same action as dragging on the board.
    onDrop: ({ row, groupId, previous, next }) => {
      const rank = rankBetween(previous, next);
      const patch = groupPatch(groupKey, groupId);
      startTransition(async () => {
        applyPatch({ id: row.id, ...patch, rank } as {
          id: string;
        } & Partial<IssueDetail>);
        await reorderIssue(row.id, patch.status ?? row.status, rank);
        if (groupKey !== "status") await updateIssue(row.id, patch);
        router.refresh();
      });
    },
  });

  return (
    <div
      className={styles.content}
      ref={containerRef}
      data-project={projectId === undefined ? "" : undefined}
      data-by-status={groupKey === "status" ? "" : undefined}
    >
      <Table
        fill
        variant="card"
        label={t("nav.issues")}
        columns={columns}
        groups={groups}
        getRowKey={(issue) => issue.id}
        dnd={isCompact ? undefined : dnd}
        sort={isCompact ? undefined : tableSort}
        totals={
          isCompact
            ? undefined
            : {
                labelColumn: "title",
                label: (scope, rows, group) => (
                  <span className={styles.totalLabel}>
                    {scope === "all"
                      ? t("issues.table.total", { count: rows.length })
                      : t("issues.table.totalGroup", {
                          group: group?.label ?? "",
                        })}
                  </span>
                ),
              }
        }
        isRowActive={(issue) => identifier(issue) === openIssue}
        isRowFocused={(issue) => issue.id === focusedId}
        rowOverlay={(issue) => (
          <IssueRowLink
            issue={issue}
            identifier={identifier(issue)}
            linkProps={issueOpen.linkProps(identifier(issue))}
            compact={isCompact}
            members={members}
            moveTargets={shownDefs}
            currentGroupId={groupIdOf(issue, groupKey)}
            onMoveTo={(groupId) => moveRow(issue, groupId)}
            onOpen={() => issueOpen.open(identifier(issue))}
            onOpenInNewTab={() => issueOpen.openPageInNewTab(identifier(issue))}
            onEditTitle={() => setEditing(issue.id)}
          />
        )}
        empty={
          <EmptyState
            icon={<Icon icon="lucide:list" width={32} />}
            title={emptyTitle ?? t("empty.noIssues")}
          />
        }
      />
    </div>
  );
}
