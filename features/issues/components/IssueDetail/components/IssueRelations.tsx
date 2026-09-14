"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Label } from "@/components/ui/atoms/Label/Label";
import {
  SelectAction,
  SelectEmpty,
} from "@/components/ui/atoms/SelectMenu/atoms/SelectAction";
import {
  type ISelectItem,
  SelectMenu,
} from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import {
  addIssueRelation,
  removeIssueRelation,
  setIssueParent,
  updateIssue,
} from "@/features/issues/actions";
import { CreateIssueModal } from "@/features/issues/components/CreateIssueModal/CreateIssueModal";
import { StatusIcon } from "@/features/issues/components/IssueIcons/IssueIcons";
import { IssueTitleField } from "@/features/issues/components/IssueTitleField/IssueTitleField";
import { useIssueOpen } from "@/features/issues/issue-links";
import type { IssueComposerData, IssuePatch } from "@/features/issues/types";
import { Link } from "@/i18n/navigation";
import { useHasOpenModal, useModal } from "@/lib/context";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import { useUI } from "@/lib/ui-store";
import { fullName } from "@/lib/utils/string";
import { isClosedStatus } from "@/lib/workspace-defaults";
import type {
  IssueDetail,
  IssueRelationKind,
  LinkedIssue,
  Project,
  SearchableIssue,
  Status,
  User,
} from "@/types";
import styles from "../issueDetail.module.scss";

interface IssueRelationsProps {
  issue: IssueDetail;
  data: IssueComposerData;
  /** These mutations bypass `onPatch`/`updateIssue` — a separate refetch,
   *  same reasoning as `IssueAttachments`. */
  onRefresh: () => Promise<void>;
}

type ActionResult = { ok: true } | { error: string };
type SectionKey = "parent" | "subIssues" | "relations";

const RELATION_KINDS: readonly IssueRelationKind[] = [
  "BLOCKS",
  "RELATES_TO",
  "DUPLICATES",
];

/**
 * Which label, icon, and color a relation edge gets, and in what order the
 * flat list under "Relationships" sorts them — same type/direction pair
 * edges cluster together even without a heading of their own. `RELATES_TO`
 * has no direction (see `addIssueRelation`), so both directions share one
 * label. Colors follow the same semantic palette as `DEFAULT_PRIORITIES`/
 * `DEFAULT_ISSUE_TYPES` (`lib/workspace-defaults.ts`) — red for actively
 * blocking, orange for being blocked (a warning, not quite as severe), blue
 * for a neutral cross-reference, purple for either end of a duplicate.
 */
const RELATION_GROUPS = [
  {
    type: "BLOCKS",
    direction: "outgoing",
    labelKey: "relations.blocks",
    icon: "lucide:octagon-x",
    color: "#e05252",
  },
  {
    type: "BLOCKS",
    direction: "incoming",
    labelKey: "relations.blockedBy",
    icon: "lucide:octagon-x",
    color: "#d5733b",
  },
  {
    type: "RELATES_TO",
    direction: "both",
    labelKey: "relations.relatesTo",
    icon: "lucide:link-2",
    color: "#5b9bd5",
  },
  {
    type: "DUPLICATES",
    direction: "outgoing",
    labelKey: "relations.duplicateOf",
    icon: "lucide:copy",
    color: "#a78bfa",
  },
  {
    type: "DUPLICATES",
    direction: "incoming",
    labelKey: "relations.duplicatedBy",
    icon: "lucide:copy",
    color: "#a78bfa",
  },
] as const;

interface RelationRow {
  id: string;
  type: IssueRelationKind;
  direction: "outgoing" | "incoming";
  issue: LinkedIssue;
}

function groupFor(type: IssueRelationKind, direction: "outgoing" | "incoming") {
  return RELATION_GROUPS.find(
    (g) =>
      g.type === type && (g.direction === "both" || g.direction === direction),
  );
}

function refOf(issue: SearchableIssue, projects: Project[]): string {
  return `${projects.find((p) => p.id === issue.project)?.prefix ?? "?"}-${issue.key}`;
}

function toItems(
  candidates: SearchableIssue[],
  excludeIds: Set<string>,
  projects: Project[],
  statuses: Status[],
): ISelectItem[] {
  return candidates
    .filter((i) => !excludeIds.has(i.id))
    .map((i) => ({
      value: i.id,
      label: i.title,
      hint: refOf(i, projects),
      icon: (
        <StatusIcon
          status={i.status}
          size={13}
          color={statuses.find((s) => s.id === i.status)?.color}
        />
      ),
    }));
}

// ── Table cells ──────────────────────────────────────────────────────────
//
// Each checks `issue.access` on the *linked* issue, not the one currently
// open (it may sit in a different project) — same restraint as
// `IssueProperties`/`StatusCell`/`AssigneePicker`, just resolved per row
// here instead of once for the page. They write through `onPatch`
// (`patchLinked` below), not `useIssuePatch`: that hook's `router.refresh()`
// wouldn't reach this panel's own client-fetched issue state.

function LinkedStatusCell({
  issue,
  statuses,
  onPatch,
}: {
  issue: LinkedIssue;
  statuses: Status[];
  onPatch: (patch: IssuePatch) => void;
}) {
  const t = useTranslations();
  const status = statuses.find((s) => s.id === issue.status);

  if (!issue.access.canEdit) {
    return (
      <span className={styles.tablePickerBtn} data-readonly>
        <StatusIcon status={issue.status} size={15} color={status?.color} />
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
          className={styles.tablePickerBtn}
          title={status?.name ?? issue.status}
          aria-label={t("fields.status")}
        >
          <StatusIcon status={issue.status} size={15} color={status?.color} />
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
            onPatch({ status: value as string });
            close();
          }}
          onClose={close}
        />
      )}
    </InlinePicker>
  );
}

function LinkedTitleCell({
  issue,
  isEditing,
  onEdit,
  onDone,
  onPatch,
}: {
  issue: LinkedIssue;
  isEditing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onPatch: (patch: IssuePatch) => void;
}) {
  const t = useTranslations();

  if (isEditing && issue.access.canEdit) {
    return (
      <IssueTitleField
        className={styles.tableTitleEdit}
        value={issue.title}
        onSave={(value) => {
          if (value !== issue.title) onPatch({ title: value });
        }}
        onDone={onDone}
      />
    );
  }
  if (issue.access.canEdit) {
    return (
      <button
        type="button"
        className={styles.tableTitle}
        title={t("actions.editTitle")}
        onClick={onEdit}
      >
        {issue.title}
      </button>
    );
  }
  return (
    <span className={styles.tableTitle} data-readonly>
      {issue.title}
    </span>
  );
}

/** Ref + title in one column — the row is narrower than the issues page's
 *  table, so both share the space instead of getting a column each. */
function IdentifierTitleCell({
  issue,
  projects,
  isEditing,
  onEdit,
  onDone,
  onPatch,
}: {
  issue: LinkedIssue;
  projects: Project[];
  isEditing: boolean;
  onEdit: () => void;
  onDone: () => void;
  onPatch: (patch: IssuePatch) => void;
}) {
  return (
    <span className={styles.tableIdentTitle}>
      <span className={styles.tableIdentifier}>{refOf(issue, projects)}</span>
      <LinkedTitleCell
        issue={issue}
        isEditing={isEditing}
        onEdit={onEdit}
        onDone={onDone}
        onPatch={onPatch}
      />
    </span>
  );
}

function LinkedAssigneeCell({
  issue,
  members,
  onPatch,
}: {
  issue: LinkedIssue;
  members: User[];
  onPatch: (patch: IssuePatch) => void;
}) {
  const t = useTranslations();
  const assignee = members.find((m) => m.id === issue.assignee) ?? null;

  if (!issue.access.canAssign) {
    return (
      <span className={styles.tablePickerBtn} data-readonly>
        <Avatar avatar={assignee} size={20} placeholder />
      </span>
    );
  }

  return (
    <InlinePicker
      width={220}
      align="end"
      stop
      trigger={
        <button
          type="button"
          className={styles.tablePickerBtn}
          title={assignee ? fullName(assignee) : t("fields.unassigned")}
          aria-label={t("fields.assignee")}
        >
          <Avatar avatar={assignee} size={20} placeholder />
        </button>
      }
    >
      {(close) => (
        <SelectMenu
          searchable
          items={[
            {
              value: null,
              label: t("fields.unassigned"),
              icon: <Avatar avatar={null} size={18} placeholder />,
            },
            ...members.map((user) => ({
              value: user.id,
              label: fullName(user),
              icon: <Avatar avatar={user} size={18} />,
            })),
          ]}
          value={issue.assignee}
          onPick={(value) => {
            onPatch({ assignee: value as string | null });
            close();
          }}
          onClose={close}
        />
      )}
    </InlinePicker>
  );
}

function RemoveCell({
  onRemove,
  label,
}: {
  onRemove?: () => void;
  label: string;
}) {
  if (!onRemove) return null;
  return (
    <button
      type="button"
      className={styles.tableRemove}
      aria-label={label}
      title={label}
      onClick={onRemove}
    >
      <Icon icon="lucide:x" width={13} />
    </button>
  );
}

/** Status/ref+title/assignee/remove — shared by the parent, sub-issues, and
 *  relations tables; only the `id` a write targets and the remove action
 *  differ between them. */
function makeLinkedColumns(opts: {
  projects: Project[];
  statuses: Status[];
  members: User[];
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onPatch: (id: string, patch: IssuePatch) => void;
  onRemove?: (li: LinkedIssue) => () => void;
  removeLabel: string;
}): TableColumn<LinkedIssue>[] {
  const {
    projects,
    statuses,
    members,
    editingId,
    setEditingId,
    onPatch,
    onRemove,
    removeLabel,
  } = opts;
  return [
    {
      id: "status",
      width: "max-content",
      cell: (li) => (
        <LinkedStatusCell
          issue={li}
          statuses={statuses}
          onPatch={(p) => onPatch(li.id, p)}
        />
      ),
    },
    {
      id: "title",
      width: "minmax(0, 1fr)",
      cell: (li) => (
        <IdentifierTitleCell
          issue={li}
          projects={projects}
          isEditing={editingId === li.id}
          onEdit={() => setEditingId(li.id)}
          onDone={() => setEditingId(null)}
          onPatch={(p) => onPatch(li.id, p)}
        />
      ),
    },
    {
      id: "assignee",
      width: "max-content",
      align: "end",
      cell: (li) => (
        <LinkedAssigneeCell
          issue={li}
          members={members}
          onPatch={(p) => onPatch(li.id, p)}
        />
      ),
    },
    {
      id: "remove",
      width: "max-content",
      align: "end",
      cell: (li) => (
        <RemoveCell onRemove={onRemove?.(li)} label={removeLabel} />
      ),
    },
  ];
}

/** Same four columns, plus a leading one for the edge's type ("Blocks",
 *  "Duplicate of", ...) — relations, unlike sub-issues, need to say what
 *  kind of connection each row is. */
function makeRelationColumns(opts: {
  projects: Project[];
  statuses: Status[];
  members: User[];
  editingId: string | null;
  setEditingId: (id: string | null) => void;
  onPatch: (id: string, patch: IssuePatch) => void;
  onRemove?: (r: RelationRow) => () => void;
  removeLabel: string;
  typeChip: (r: RelationRow) => React.ReactNode;
}): TableColumn<RelationRow>[] {
  const {
    projects,
    statuses,
    members,
    editingId,
    setEditingId,
    onPatch,
    onRemove,
    removeLabel,
    typeChip,
  } = opts;
  return [
    {
      id: "relationType",
      width: "max-content",
      cell: (r) => typeChip(r),
    },
    {
      id: "status",
      width: "max-content",
      cell: (r) => (
        <LinkedStatusCell
          issue={r.issue}
          statuses={statuses}
          onPatch={(p) => onPatch(r.issue.id, p)}
        />
      ),
    },
    {
      id: "title",
      width: "minmax(0, 1fr)",
      cell: (r) => (
        <IdentifierTitleCell
          issue={r.issue}
          projects={projects}
          isEditing={editingId === r.issue.id}
          onEdit={() => setEditingId(r.issue.id)}
          onDone={() => setEditingId(null)}
          onPatch={(p) => onPatch(r.issue.id, p)}
        />
      ),
    },
    {
      id: "assignee",
      width: "max-content",
      align: "end",
      cell: (r) => (
        <LinkedAssigneeCell
          issue={r.issue}
          members={members}
          onPatch={(p) => onPatch(r.issue.id, p)}
        />
      ),
    },
    {
      id: "remove",
      width: "max-content",
      align: "end",
      cell: (r) => <RemoveCell onRemove={onRemove?.(r)} label={removeLabel} />,
    },
  ];
}

/**
 * "Create new issue" — sits below the search field/list in both the
 * sub-issue and relation pickers: linking to something that doesn't exist
 * yet is common enough (a sub-issue is often *discovered* while looking at
 * the parent, not already sitting in the backlog) that it shouldn't require
 * leaving the picker first. Opens the same full `CreateIssueModal` as
 * `NewIssueButton`/`ListGroupHeader`, then feeds the result straight back
 * into `onCreated` — same as picking an existing issue from the list.
 *
 * `projectId` is `undefined` when the viewer can't create an issue in any
 * project at all — same case `NewIssueButton` hides itself for — and the
 * row is left out entirely (divider included, via the caller) rather than
 * opening a modal that would just reject the submit.
 */
function CreateIssueAction({
  data,
  projectId,
  onCreated,
}: {
  data: IssueComposerData;
  projectId: string | undefined;
  onCreated: (issueId: string) => void;
}) {
  const t = useTranslations();
  const { openModal } = useModal();
  const initialStatus =
    data.statuses.find((s) => s.id === "backlog")?.id ?? data.statuses[0]?.id;

  if (!projectId || !initialStatus) return null;

  return (
    <SelectAction
      icon={<Icon icon="lucide:plus" width={14} />}
      onClick={() =>
        openModal(({ close }) => (
          <CreateIssueModal
            projectId={projectId}
            initialStatus={initialStatus}
            data={data}
            close={close}
            onCreated={onCreated}
          />
        ))
      }
    >
      {t("relations.createIssue")}
    </SelectAction>
  );
}

/**
 * Behind "Add relation": which kind of edge first (`BLOCKS`/`RELATES_TO`/
 * `DUPLICATES`), then who — the same two-screen shape as
 * `LabelPickerMenu`'s name-then-color flow, for the same reason: `Popover`
 * unmounts its content on close, so every reopen naturally restarts at the
 * choice screen.
 */
function AddRelationMenu({
  data,
  excludeId,
  defaultProjectId,
  onPick,
  onClose,
}: {
  data: IssueComposerData;
  excludeId: string;
  defaultProjectId: string | undefined;
  onPick: (relatedId: string, type: IssueRelationKind) => void;
  onClose: () => void;
}) {
  const t = useTranslations();
  const [type, setType] = useState<IssueRelationKind | null>(null);

  if (!type) {
    return (
      <div className={styles.attachmentChooser}>
        {RELATION_KINDS.map((kind) => {
          // Adding an edge always creates it from this issue's own point of
          // view — the same "outgoing" framing `addIssueRelation` stores it
          // under — so the chooser's icon/label already match the chip the
          // new row will render with.
          const group = groupFor(kind, "outgoing");
          if (!group) return null;
          return (
            <button
              key={kind}
              type="button"
              className={styles.attachmentChooserOption}
              onClick={() => setType(kind)}
            >
              <Icon icon={group.icon} width={15} color={group.color} />
              {t(group.labelKey)}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <SelectMenu
      searchable
      placeholder={t("relations.searchPlaceholder")}
      value={null}
      items={toItems(
        data.searchIssues,
        new Set([excludeId]),
        data.projects,
        data.statuses,
      )}
      onPick={(v) => {
        if (v) onPick(String(v), type);
        onClose();
      }}
      onClose={onClose}
      emptyState={() => <SelectEmpty>{t("relations.noMatches")}</SelectEmpty>}
      footer={
        defaultProjectId && (
          <>
            <div className={styles.pickerDivider} />
            <CreateIssueAction
              data={data}
              projectId={defaultProjectId}
              onCreated={(issueId) => {
                onPick(issueId, type);
                onClose();
              }}
            />
          </>
        )
      }
    />
  );
}

/**
 * Section header — the same shape as "Comments"/"Attachments"
 * (`.sectionHead`: icon, title, count), with the collapse chevron right
 * after the title (its natural reading order — "Sub-issues, expand/
 * collapse, count") and the "+" trigger on its own at the trailing end via
 * `.iconBtn`'s built-in `margin-left: auto`. Shared by the three sections
 * below so they line up identically.
 */
function SectionHead({
  icon,
  label,
  count,
  collapsed,
  onToggleCollapse,
  onAdd,
}: {
  icon: string;
  label: string;
  count?: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onAdd?: React.ReactNode;
}) {
  const t = useTranslations();
  return (
    <header className={styles.sectionHead}>
      <Icon icon={icon} width={15} aria-hidden="true" />
      <h3 className={styles.sectionTitle}>{label}</h3>
      <button
        type="button"
        className={styles.relationsToggle}
        onClick={onToggleCollapse}
        aria-expanded={!collapsed}
        title={t(collapsed ? "relations.expand" : "relations.collapse")}
        aria-label={t(collapsed ? "relations.expand" : "relations.collapse")}
      >
        <Icon icon="lucide:chevron-down" width={13} />
      </button>
      {count && <span className={styles.commentsCount}>{count}</span>}
      {onAdd}
    </header>
  );
}

/**
 * Sub-issues (`parent`/`children`) and typed edges (`relations`) — BARY-1.
 * Each shown as a compact `Table` — the same component and column raster
 * as the issues page's own list, just narrower (`.miniTableWrap` shrinks
 * the shared spacing custom properties `Table` reads for exactly this) and
 * with fewer columns. Three independent, collapsible sections, each hidden
 * once there's nothing to show and nothing to add.
 */
export function IssueRelations({
  issue,
  data,
  onRefresh,
}: IssueRelationsProps) {
  const t = useTranslations();
  const { toast } = useUI();
  const { canEdit } = issue.access;
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Record<SectionKey, boolean>>({
    parent: false,
    subIssues: false,
    relations: false,
  });
  const { linkProps } = useIssueOpen(data.workspaceId);
  const hasOpenModal = useHasOpenModal();

  // "t"/"r" jump straight to the sub-issue/relation picker, same convention
  // as "l" for labels (`IssueLabels.tsx`) — a keyboard-only way to reach a
  // control that otherwise needs a mouse click on a small "+" button.
  // Collapsed sections still expand: opening the picker is pointless if its
  // list stays hidden right after.
  const [addSubIssueOpen, setAddSubIssueOpen] = useState(false);
  const [addRelationOpen, setAddRelationOpen] = useState(false);
  useShortcut(
    "t",
    () => {
      setCollapsed((cur) => ({ ...cur, subIssues: false }));
      setAddSubIssueOpen(true);
    },
    { enabled: canEdit && !hasOpenModal },
  );
  useShortcut(
    "r",
    () => {
      setCollapsed((cur) => ({ ...cur, relations: false }));
      setAddRelationOpen(true);
    },
    { enabled: canEdit && !hasOpenModal },
  );

  const toggle = (key: SectionKey) =>
    setCollapsed((cur) => ({ ...cur, [key]: !cur[key] }));

  // Up/Down between a mini-table's own rows, once focus is already
  // somewhere inside one (`[data-relation-table]`, the three
  // `.miniTableWrap`s below) — the panel-wide field-roving in
  // `IssueDetailView.tsx` only ever treats a whole table as a single stop
  // (the "+" trigger before it), so without this, arrows inside it either
  // did nothing or — worse — `isRovable` there used to wave every row
  // through as "fair game" and teleport focus back up to the title field.
  // `isRovable` now excludes this attribute for exactly that reason.
  //
  // Lands on the row's own row-filling link (`Table`'s `rowOverlay`, always
  // the first focusable element in a row's first cell — see `Table.tsx`)
  // regardless of which of the row's controls currently has focus, so
  // Up/Down always means "the next/previous issue", not "the next/previous
  // field of this one". Clamped at the first/last row rather than wrapping
  // or escaping to the "+" trigger — simple "list navigation", Tab still
  // owns entering/leaving the table.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return;
      const table = active.closest<HTMLElement>("[data-relation-table]");
      if (!table) return;
      const rows = Array.from(
        table.querySelectorAll<HTMLElement>("tr[role=row]"),
      );
      if (rows.length === 0) return;
      const currentRow = active.closest("tr[role=row]");
      const index = currentRow ? rows.indexOf(currentRow as HTMLElement) : -1;
      const nextRow = rows[index + (event.key === "ArrowDown" ? 1 : -1)];
      if (!nextRow) return;
      event.preventDefault();
      nextRow.querySelector<HTMLElement>("a, button")?.focus();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const run = async (fn: () => Promise<ActionResult>) => {
    setBusy(true);
    try {
      const result = await fn();
      if ("error" in result) toast(result.error);
      else await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  /** Writes a field on a *linked* issue (not the one currently open) —
   *  status/assignee/title from a row's own picker/title field. */
  const patchLinked = async (id: string, patch: IssuePatch) => {
    setBusy(true);
    try {
      await updateIssue(id, patch);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const rowOverlay = (li: LinkedIssue) => {
    const ref = refOf(li, data.projects);
    return <Link {...linkProps(ref)} aria-label={`${ref} ${li.title}`} />;
  };

  const showParent = issue.parent !== null;
  const showSubIssues = issue.children.length > 0 || canEdit;
  const showRelations = issue.relations.length > 0 || canEdit;
  if (!showParent && !showSubIssues && !showRelations) return null;

  // Same project this issue is already in, provided the viewer can create
  // there — otherwise the first project they can, same fallback
  // `NewIssueButton` uses. `undefined` (no creatable project at all) hides
  // `CreateIssueAction` entirely.
  const defaultProjectId = data.creatableProjectIds.includes(issue.project)
    ? issue.project
    : data.creatableProjectIds[0];

  const doneCount = issue.children.filter((c) =>
    isClosedStatus(c.status),
  ).length;

  const subIssueExclude = new Set(
    [issue.id, issue.parent?.id, ...issue.children.map((c) => c.id)].filter(
      (id): id is string => !!id,
    ),
  );

  const relationRows: RelationRow[] = [...issue.relations].sort((a, b) => {
    const ai = RELATION_GROUPS.indexOf(
      groupFor(a.type, a.direction) ?? RELATION_GROUPS[0],
    );
    const bi = RELATION_GROUPS.indexOf(
      groupFor(b.type, b.direction) ?? RELATION_GROUPS[0],
    );
    return ai - bi;
  });

  const columnBase = {
    projects: data.projects,
    statuses: data.statuses,
    members: data.members,
    editingId,
    setEditingId,
    onPatch: patchLinked,
  };

  const parentColumns = makeLinkedColumns({
    ...columnBase,
    onRemove: canEdit
      ? () => () => run(() => setIssueParent(issue.id, null))
      : undefined,
    removeLabel: t("relations.removeParent"),
  });

  const childColumns = makeLinkedColumns({
    ...columnBase,
    onRemove: canEdit
      ? (li) => () => run(() => setIssueParent(li.id, null))
      : undefined,
    removeLabel: t("relations.removeSubIssue"),
  });

  const relationColumns = makeRelationColumns({
    ...columnBase,
    onRemove: canEdit
      ? (r) => () => run(() => removeIssueRelation(r.id))
      : undefined,
    removeLabel: t("relations.removeRelation"),
    typeChip: (r) => {
      const group = groupFor(r.type, r.direction);
      if (!group) return null;
      return (
        <Label color={group.color} size="xs" filled hasIcon>
          <Icon icon={group.icon} width={10} />
          {t(group.labelKey)}
        </Label>
      );
    },
  });

  return (
    <div className={styles.relationsWrap}>
      {showParent && issue.parent && (
        <section className={styles.section}>
          <SectionHead
            icon="lucide:corner-left-up"
            label={t("relations.parent")}
            collapsed={collapsed.parent}
            onToggleCollapse={() => toggle("parent")}
          />
          {!collapsed.parent && (
            <div className={styles.miniTableWrap} data-relation-table>
              <Table
                variant="card"
                columns={parentColumns}
                rows={[issue.parent]}
                getRowKey={(li) => li.id}
                rowOverlay={rowOverlay}
              />
            </div>
          )}
        </section>
      )}

      {showSubIssues && (
        <section className={styles.section}>
          <SectionHead
            icon="lucide:list-tree"
            label={t("relations.subIssues")}
            count={
              issue.children.length > 0
                ? `${doneCount}/${issue.children.length}`
                : undefined
            }
            collapsed={collapsed.subIssues}
            onToggleCollapse={() => toggle("subIssues")}
            onAdd={
              canEdit && (
                <InlinePicker
                  width={260}
                  align="end"
                  stop
                  open={addSubIssueOpen}
                  onOpenChange={setAddSubIssueOpen}
                  trigger={
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={t("relations.addSubIssue")}
                      title={t("relations.addSubIssue")}
                      disabled={busy}
                      data-field-nav
                    >
                      <Icon icon="lucide:plus" width={14} />
                    </button>
                  }
                >
                  {(close) => (
                    <SelectMenu
                      searchable
                      placeholder={t("relations.searchPlaceholder")}
                      value={null}
                      items={toItems(
                        data.searchIssues,
                        subIssueExclude,
                        data.projects,
                        data.statuses,
                      )}
                      onPick={(v) => {
                        close();
                        if (v) {
                          run(() => setIssueParent(String(v), issue.id));
                        }
                      }}
                      onClose={close}
                      emptyState={() => (
                        <SelectEmpty>{t("relations.noMatches")}</SelectEmpty>
                      )}
                      footer={
                        defaultProjectId && (
                          <>
                            <div className={styles.pickerDivider} />
                            <CreateIssueAction
                              data={data}
                              projectId={defaultProjectId}
                              onCreated={(issueId) => {
                                close();
                                run(() => setIssueParent(issueId, issue.id));
                              }}
                            />
                          </>
                        )
                      }
                    />
                  )}
                </InlinePicker>
              )
            }
          />
          {!collapsed.subIssues && issue.children.length > 0 && (
            <div className={styles.miniTableWrap} data-relation-table>
              <Table
                variant="card"
                columns={childColumns}
                rows={issue.children}
                getRowKey={(li) => li.id}
                rowOverlay={rowOverlay}
              />
            </div>
          )}
        </section>
      )}

      {showRelations && (
        <section className={styles.section}>
          <SectionHead
            icon="lucide:link-2"
            label={t("relations.title")}
            count={
              issue.relations.length > 0
                ? String(issue.relations.length)
                : undefined
            }
            collapsed={collapsed.relations}
            onToggleCollapse={() => toggle("relations")}
            onAdd={
              canEdit && (
                <InlinePicker
                  width={240}
                  align="end"
                  stop
                  open={addRelationOpen}
                  onOpenChange={setAddRelationOpen}
                  trigger={
                    <button
                      type="button"
                      className={styles.iconBtn}
                      aria-label={t("relations.addRelation")}
                      title={t("relations.addRelation")}
                      disabled={busy}
                      data-field-nav
                    >
                      <Icon icon="lucide:plus" width={14} />
                    </button>
                  }
                >
                  {(close) => (
                    <AddRelationMenu
                      data={data}
                      excludeId={issue.id}
                      defaultProjectId={defaultProjectId}
                      onPick={(relatedId, type) => {
                        close();
                        run(() => addIssueRelation(issue.id, relatedId, type));
                      }}
                      onClose={close}
                    />
                  )}
                </InlinePicker>
              )
            }
          />
          {!collapsed.relations && relationRows.length > 0 && (
            <div className={styles.miniTableWrap} data-relation-table>
              <Table
                variant="card"
                columns={relationColumns}
                rows={relationRows}
                getRowKey={(r) => r.id}
                rowOverlay={(r) => rowOverlay(r.issue)}
              />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
