"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useOptimistic, useRef, useState, useTransition } from "react";
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
import { reorderIssue, updateIssue } from "@/features/issues/actions";
import {
  isCardFieldKey,
  visibleCardFields,
} from "@/features/issues/card-fields";
import { AssigneePicker } from "@/features/issues/components/AssigneePicker/AssigneePicker";
import { IssueTitleField } from "@/features/issues/components/IssueTitleField/IssueTitleField";
import {
  type GroupKey,
  groupDefs,
  groupIdOf,
  groupPatch,
  visibleGroups,
} from "@/features/issues/group";
import { useIssueOpen } from "@/features/issues/issue-links";
import { rankBetween } from "@/features/issues/rank";
import { type SortKey, sortByKey } from "@/features/issues/sort";
import type { IssueComposerData } from "@/features/issues/types";
import {
  type DetailFieldKey,
  visibleDetailFields,
} from "@/features/projects/detail-fields";
import { Link } from "@/i18n/navigation";
import { useHasOpenModal } from "@/lib/context";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import type { IssueDetail } from "@/types";
import {
  DueDateCell,
  LabelsCell,
  PriorityCell,
  ProjectCell,
  StatusCell,
  StoryPointsCell,
  TypeCell,
  UpdatedCell,
} from "./components/IssueCells";
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
  /** What's shown instead of the empty table. Default: "No tasks". */
  emptyTitle?: string;
}

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
  emptyTitle,
}: ListViewProps) {
  const { projects, members, labels, statuses, priorities, issueTypes } =
    composer;
  const t = useTranslations();
  const router = useRouter();
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

  // This person's own choice (BARY-33) applies to every row the same way —
  // computed once, unlike the project-level check below.
  const userVisibleFields = visibleCardFields(hiddenCardFields);

  // Per row, not once for the whole table — a cross-project list ("my
  // issues") can mix projects with different field visibility.
  const isFieldVisible = (issue: IssueDetail, key: DetailFieldKey) => {
    const project = projects.find((p) => p.id === issue.project);
    if (!visibleDetailFields(project?.hiddenDetailFields ?? []).has(key)) {
      return false;
    }
    return isCardFieldKey(key) ? userVisibleFields.has(key) : true;
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
    { statuses, priorities, issueTypes, members },
    {
      unassigned: t("fields.unassigned"),
      noStoryPoints: t("fields.noStoryPoints"),
    },
    shown,
  );
  const groups: TableGroup<IssueDetail>[] = visibleGroups(defs, shown).map(
    (group) => {
      // By rank, not by creation date — otherwise the row would end up
      // somewhere other than where it was dropped after a drag.
      const rows = sortByKey(
        shown.filter((issue) => groupIdOf(issue, groupKey) === group.id),
        sortKey,
        { statuses, issueTypes, members },
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
    },
  );

  // The keyboard cursor — which row j/k/arrows would move next, independent
  // of `openIssue` (the one actually shown in the panel). Flattened across
  // groups in display order, skipping collapsed ones: up/down moves through
  // the list exactly as it's drawn, not the underlying grouping.
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const flatRows = groups.flatMap((g) => (g.collapsed ? [] : g.rows));
  const containerRef = useRef<HTMLDivElement>(null);
  const hasOpenModal = useHasOpenModal();

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
    if (row) issueOpen.openPanel(identifier(row));
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

  const columns: TableColumn<IssueDetail>[] = [
    {
      id: "priority",
      cell: (issue) =>
        isFieldVisible(issue, "priority") ? (
          <PriorityCell issue={issue} priorities={priorities} />
        ) : null,
    },
    {
      id: "identifier",
      cell: (issue) => (
        <span className={styles.identifier}>{identifier(issue)}</span>
      ),
    },
    // Only where the rows come from different projects — otherwise every
    // row would show the same thing.
    ...(projectId === undefined
      ? [
          {
            id: "project",
            width: "max-content",
            cell: (issue: IssueDetail) => (
              <ProjectCell issue={issue} projects={projects} />
            ),
          },
        ]
      : []),
    {
      id: "status",
      cell: (issue) => <StatusCell issue={issue} statuses={statuses} />,
    },
    {
      id: "type",
      cell: (issue) => <TypeCell issue={issue} issueTypes={issueTypes} />,
    },
    {
      id: "title",
      width: "minmax(0, 1fr)",
      // The title is its own trigger: click and type. It therefore sits
      // above the row link — the issue is opened via the rest of the row.
      //
      // Without issue.update.any/.own it stays plain text: the server
      // would reject the patch anyway (`updateIssue`), and a button that
      // triggers nothing is just a false invitation.
      cell: (issue) =>
        editing === issue.id && issue.access.canEdit ? (
          <IssueTitleField
            className={styles.titleEdit}
            value={issue.title}
            onSave={(value) => saveTitle(issue, value)}
            onDone={() => setEditing(null)}
          />
        ) : issue.access.canEdit ? (
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
        ),
    },
    {
      id: "labels",
      width: "max-content",
      align: "end",
      cell: (issue) =>
        isFieldVisible(issue, "labels") ? (
          <LabelsCell issue={issue} labels={labels} />
        ) : null,
    },
    {
      id: "assignee",
      align: "end",
      cell: (issue) => <AssigneePicker issue={issue} members={members} />,
    },
    {
      id: "storyPoints",
      width: "max-content",
      align: "end",
      cell: (issue) =>
        isFieldVisible(issue, "storyPoints") ? (
          <StoryPointsCell issue={issue} />
        ) : null,
    },
    {
      id: "dueDate",
      width: "max-content",
      align: "end",
      cell: (issue) =>
        isFieldVisible(issue, "dueDate") ? <DueDateCell issue={issue} /> : null,
    },
    {
      id: "updated",
      width: "max-content",
      align: "end",
      cell: (issue) => <UpdatedCell issue={issue} />,
    },
  ];

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
    <div className={styles.content} ref={containerRef}>
      <Table
        fill
        variant="card"
        label={t("nav.issues")}
        columns={columns}
        groups={groups}
        getRowKey={(issue) => issue.id}
        dnd={dnd}
        isRowActive={(issue) => identifier(issue) === openIssue}
        isRowFocused={(issue) => issue.id === focusedId}
        rowOverlay={(issue) => (
          <Link
            {...issueOpen.linkProps(identifier(issue))}
            scroll={false}
            aria-label={`${identifier(issue)} ${issue.title}`}
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
