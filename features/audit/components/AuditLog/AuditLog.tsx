"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { Label } from "@/components/ui/atoms/Label/Label";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { LoadMoreSentinel } from "@/components/ui/layout/Table/LoadMoreSentinel/LoadMoreSentinel";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import { useInfiniteScroll } from "@/components/ui/layout/Table/useInfiniteScroll";
import type { ActivityPage } from "@/features/audit/actions";
import {
  PriorityIcon,
  StatusIcon,
} from "@/features/issues/components/IssueIcons/IssueIcons";
import { Link } from "@/i18n/navigation";
// `@/lib/audit/actions` and not `@/lib/audit`: this list renders in the
// browser, and the server part next to it carries `server-only` along with
// the Prisma client.
import {
  type AuditAction,
  type AuditEntry,
  actorDisplayName,
  type LabelsChangeMeta,
  type PriorityChangeMeta,
  parseTargetLabel,
  type StatusChangeMeta,
  toAuditAction,
} from "@/lib/audit/actions";
import { issuePath, projectPath } from "@/lib/nav";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import styles from "./auditLog.module.scss";

interface Props {
  entries: AuditEntry[];
  title: string;
  description: string;
  /** To link an issue's reference (`TargetLabel`). Without it — the
   * platform overview spans all workspaces — it stays plain text. */
  workspaceSlug?: string;
  /** Id of the last entry loaded initially — `null` if `entries` is already
   * everything. Controls whether more is loaded at all. */
  nextCursor: string | null;
  /** Loads the next page from a cursor — a server function bound to either
   * a workspace or a project (`loadMoreWorkspaceActivity`/
   * `loadMoreProjectActivity` in `features/audit/actions.ts`). */
  loadMore: (cursor: string) => Promise<ActivityPage>;
}

/**
 * How an action appears in the list: its icon, its label, and whether it
 * should stand out.
 *
 * The icons group what belongs together — everything around access carries a
 * key, everything around permissions a shield, everything destructive a
 * trash can, break-glass access its own icon, and everything everyday
 * (projects, members, issues, labels — project and workspace activity, not
 * just platform administration) a neutral plus/minus.
 *
 * `message` is the name in `messages/*.json` and **not** the action's key.
 * The key contains dots, and next-intl reads a dot as nesting:
 * `audit.action.auth.login` would be an object `auth` with a field `login`
 * — and `auth.login.failed` would then require `login` to be text and an
 * object at the same time. The messages are therefore named flat, and this
 * table is the bridge between the two worlds.
 *
 * `satisfies Record<AuditAction, …>` is the actual safeguard: a new action in
 * `lib/audit/actions.ts` breaks the type check here until it also has an
 * icon and a label.
 */
export const AUDIT_ACTION_META = {
  "auth.login": { icon: "lucide:log-in", message: "authLogin" },
  "auth.login.failed": {
    icon: "lucide:shield-x",
    message: "authLoginFailed",
    loud: true,
  },
  "user.role.platform": {
    icon: "lucide:shield-check",
    message: "userRolePlatform",
  },
  "user.deactivated": { icon: "lucide:user-x", message: "userDeactivated" },
  "user.reactivated": { icon: "lucide:user-check", message: "userReactivated" },
  "member.role.changed": {
    icon: "lucide:shield-check",
    message: "memberRoleChanged",
  },
  "project.breakglass": {
    icon: "lucide:siren",
    message: "projectBreakglass",
    loud: true,
  },
  "project.owner.changed": {
    icon: "lucide:replace",
    message: "projectOwnerChanged",
  },
  "project.archived": { icon: "lucide:archive", message: "projectArchived" },
  "project.unarchived": {
    icon: "lucide:archive-restore",
    message: "projectUnarchived",
  },
  "project.deleted": {
    icon: "lucide:trash-2",
    message: "projectDeleted",
    loud: true,
  },
  "workspace.suspended": {
    icon: "lucide:ban",
    message: "workspaceSuspended",
    loud: true,
  },
  "workspace.unsuspended": {
    icon: "lucide:circle-check",
    message: "workspaceUnsuspended",
  },
  "workspace.deleted": {
    icon: "lucide:trash-2",
    message: "workspaceDeleted",
    loud: true,
  },
  "mail.template.updated": {
    icon: "lucide:mail",
    message: "mailTemplateUpdated",
  },
  "mail.template.reset": {
    icon: "lucide:mail-x",
    message: "mailTemplateReset",
  },
  "system.settings.updated": {
    icon: "lucide:settings",
    message: "systemSettingsUpdated",
  },
  "project.created": { icon: "lucide:folder-plus", message: "projectCreated" },
  "project.visibility.changed": {
    icon: "lucide:eye",
    message: "projectVisibilityChanged",
  },
  "member.added": { icon: "lucide:user-plus", message: "memberAdded" },
  "member.removed": { icon: "lucide:user-minus", message: "memberRemoved" },
  "project.member.added": {
    icon: "lucide:user-plus",
    message: "projectMemberAdded",
  },
  "project.member.removed": {
    icon: "lucide:user-minus",
    message: "projectMemberRemoved",
  },
  "project.member.role.changed": {
    icon: "lucide:shield-check",
    message: "projectMemberRoleChanged",
  },
  "issue.created": { icon: "lucide:circle-plus", message: "issueCreated" },
  "issue.deleted": { icon: "lucide:circle-x", message: "issueDeleted" },
  "issue.assigned": { icon: "lucide:user-check", message: "issueAssigned" },
  "issue.unassigned": {
    icon: "lucide:user-round-x",
    message: "issueUnassigned",
  },
  "issue.title.changed": {
    icon: "lucide:pencil",
    message: "issueTitleChanged",
  },
  "issue.description.changed": {
    icon: "lucide:file-text",
    message: "issueDescriptionChanged",
  },
  "issue.status.changed": {
    icon: "lucide:git-branch",
    message: "issueStatusChanged",
  },
  "issue.priority.changed": {
    icon: "lucide:flag",
    message: "issuePriorityChanged",
  },
  "issue.type.changed": { icon: "lucide:shapes", message: "issueTypeChanged" },
  "issue.labels.changed": { icon: "lucide:tag", message: "issueLabelsChanged" },
  "issue.shared": { icon: "lucide:link", message: "issueShared" },
  "issue.share.revoked": {
    icon: "lucide:link-2-off",
    message: "issueShareRevoked",
  },
  "label.created": { icon: "lucide:tag", message: "labelCreated" },
  "label.deleted": { icon: "lucide:tag", message: "labelDeleted" },
} as const satisfies Record<
  AuditAction,
  { icon: string; message: string; loud?: boolean }
>;

/** What an unknown action gets — a dot and nothing else. */
const UNKNOWN_ICON = "lucide:dot";

function metaOf(action: string) {
  const known = toAuditAction(action);
  return known ? AUDIT_ACTION_META[known] : null;
}

function isLoud(action: string): boolean {
  const meta = metaOf(action);
  return meta !== null && "loud" in meta && meta.loud;
}

/**
 * Icon and message key of an action — for more compact displays outside the
 * full table, such as the overview's activity card
 * (`ProjectProfileView`/`WorkspaceProfileView`). The translation itself stays
 * with the calling component: `t(\`audit.action.${message}\`)`.
 */
export function auditActionMeta(action: string) {
  const meta = metaOf(action);
  return { icon: meta?.icon ?? UNKNOWN_ICON, message: meta?.message ?? null };
}

/**
 * Shows a reference like `MOB-1` as its own narrow label for quickly
 * recognizing the ticket, and an "old → new" not as equally weighted running
 * text, but "old" dimmed and "new" emphasized — the parsing itself lives in
 * `parseTargetLabel` (`lib/audit/actions.ts`), pure string handling with no
 * React.
 *
 * Three kinds of actions additionally get their own visual treatment instead
 * of plain text, using the data from `meta` (`features/issues/actions.ts`
 * writes it in exactly this shape): status and priority with their icon
 * (`StatusIcon`/`PriorityIcon` — the same ones as on the board and list),
 * status additionally in its own color instead of the neutral text color.
 * Labels as chips like everywhere else in the app (`Label`), not as text
 * with a leading `+`/`−` — added ones filled in, removed ones struck
 * through. If `meta` is missing (rows from before this change), it falls
 * back to plain text.
 */
/** Actions where the target itself is the project — `text` here is already
 * the project name, not an "old → new". The whole text becomes the link. */
const PROJECT_IS_TARGET: ReadonlySet<string> = new Set([
  "project.created",
  "project.archived",
  "project.unarchived",
  "project.deleted",
  "project.owner.changed",
  "project.visibility.changed",
  "project.breakglass",
]);

/** Actions whose target is a person, but who remains associated with a
 * project — otherwise unrecognizable in the workspace-wide feed which
 * project "Added to project" belongs to. These get their own chip. */
const PROJECT_IS_CONTEXT: ReadonlySet<string> = new Set([
  "project.member.added",
  "project.member.removed",
  "project.member.role.changed",
]);

/** Actions where the target itself is the workspace — like
 * `PROJECT_IS_TARGET`, just without a link: a platform admin isn't a member
 * of someone else's workspace (see `PlatformWorkspaces`). */
const WORKSPACE_IS_TARGET: ReadonlySet<string> = new Set([
  "workspace.suspended",
  "workspace.unsuspended",
  "workspace.deleted",
]);

type EntityRef = {
  slug: string;
  name: string;
  color: string;
  avatarUrl: string | null;
};

interface TargetLabelProps {
  text: string;
  action: string;
  meta?: unknown;
  /** Color of the person named in `text`, for an avatar next to "new" —
   * e.g. who an issue is now assigned to. */
  personColor?: string | null;
  /** Links the reference to the issue. Without it, it's shown as plain text. */
  workspaceSlug?: string;
  /** Current project behind `projectId` — for the link and avatar in
   * `PROJECT_IS_TARGET`/`PROJECT_IS_CONTEXT` (`lib/audit/index.ts`). */
  projectRef?: EntityRef | null;
  /** Current workspace behind `workspaceId` — for the avatar in
   * `WORKSPACE_IS_TARGET`, with no link (`lib/audit/index.ts`). */
  workspaceRef?: EntityRef | null;
}

export function TargetLabel({
  text,
  action,
  meta,
  personColor,
  workspaceSlug,
  projectRef,
  workspaceRef,
}: TargetLabelProps) {
  const { ref, before, after } = parseTargetLabel(text);
  if (!ref && !after) return null;

  const refNode = ref ? (
    workspaceSlug ? (
      <Link href={issuePath(workspaceSlug, ref)} className={styles.ref}>
        {ref}
      </Link>
    ) : (
      <span className={styles.ref}>{ref}</span>
    )
  ) : null;

  const projectLink =
    workspaceSlug && projectRef ? (
      <Link
        href={projectPath(workspaceSlug, projectRef.slug, "overview")}
        className={styles.projectRef}
      >
        <Avatar
          avatar={{
            name: projectRef.name,
            color: projectRef.color,
            image: projectRef.avatarUrl ?? undefined,
          }}
          shape="square"
          size={14}
        />
        {projectRef.name}
      </Link>
    ) : null;

  if (WORKSPACE_IS_TARGET.has(action)) {
    return (
      <span className={styles.targetLabel}>
        {workspaceRef ? (
          <span className={styles.projectRef}>
            <Avatar
              avatar={{
                name: workspaceRef.name,
                color: workspaceRef.color,
                image: workspaceRef.avatarUrl ?? undefined,
              }}
              shape="square"
              size={14}
            />
            {workspaceRef.name}
          </span>
        ) : (
          <span className={styles.changeAfter}>{after}</span>
        )}
      </span>
    );
  }

  if (PROJECT_IS_TARGET.has(action)) {
    return (
      <span className={styles.targetLabel}>
        {projectLink ?? <span className={styles.changeAfter}>{after}</span>}
      </span>
    );
  }

  if (action === "issue.labels.changed") {
    const labels = meta as LabelsChangeMeta | undefined;
    return (
      <span className={styles.targetLabel}>
        {refNode}
        {labels ? (
          <>
            {labels.added.map((l) => (
              <Label key={`+${l.id}`} size="xs" filled color={l.color}>
                {l.name}
              </Label>
            ))}
            {labels.removed.map((l) => (
              <Label
                key={`-${l.id}`}
                size="xs"
                color={l.color}
                className={styles.removedLabel}
              >
                {l.name}
              </Label>
            ))}
          </>
        ) : (
          after && <span className={styles.changeAfter}>{after}</span>
        )}
      </span>
    );
  }

  const priority =
    action === "issue.priority.changed"
      ? (meta as PriorityChangeMeta | undefined)
      : undefined;
  const status =
    action === "issue.status.changed"
      ? (meta as StatusChangeMeta | undefined)
      : undefined;

  return (
    <span className={styles.targetLabel}>
      {refNode}
      {before !== undefined && (
        <>
          <span
            className={styles.changeBefore}
            style={status?.fromColor ? { color: status.fromColor } : undefined}
          >
            {priority && <PriorityIcon priority={priority.from} size={13} />}
            {status && (
              <StatusIcon
                status={status.from}
                color={status.fromColor ?? undefined}
                size={13}
              />
            )}
            {before}
          </span>
          <Icon
            icon="lucide:arrow-right"
            width={11}
            className={styles.changeArrow}
          />
        </>
      )}
      {after && (
        <span
          className={styles.changeAfter}
          style={status?.toColor ? { color: status.toColor } : undefined}
        >
          {priority && <PriorityIcon priority={priority.to} size={13} />}
          {status && (
            <StatusIcon
              status={status.to}
              color={status.toColor ?? undefined}
              size={13}
            />
          )}
          {personColor && (
            <Avatar
              avatar={{ name: after, color: personColor }}
              shape="circle"
              size={16}
              fontSize={9}
            />
          )}
          {after}
        </span>
      )}
      {PROJECT_IS_CONTEXT.has(action) && projectLink}
    </span>
  );
}

/**
 * The audit log: who, when, what — and on what.
 *
 * It can't be edited and can't be deleted; there's no action for that,
 * neither here nor on the server (`lib/audit/index.ts`). Two filters,
 * deliberately coarse: "all"/"only the loud ones" as a toggle, and an action
 * filter that only shows what actually occurs in this list — a picker full
 * of actions that never happen would be useless.
 *
 * The names in the rows are the ones from back then, not the ones from
 * today — they were frozen at write time. Renaming your account therefore
 * doesn't change what the log says about you.
 */
export function AuditLog({
  entries,
  title,
  description,
  workspaceSlug,
  nextCursor,
  loadMore,
}: Props) {
  const t = useTranslations();
  const timeAgo = useTimeAgo();
  const [loudOnly, setLoudOnly] = useState(false);
  const [actionFilter, setActionFilter] = useState<string>("all");

  const { items, cursor, loading, sentinelRef } = useInfiniteScroll({
    initialItems: entries,
    initialCursor: nextCursor,
    loadMore: (cursor) =>
      loadMore(cursor).then((page) => ({
        items: page.entries,
        nextCursor: page.nextCursor,
      })),
  });

  const availableActions = useMemo(
    () => [...new Set(items.map((e) => e.action))],
    [items],
  );

  const rows = items
    .filter((e) => !loudOnly || isLoud(e.action))
    .filter((e) => actionFilter === "all" || e.action === actionFilter);

  // Unknown keys are shown raw instead of not at all: the log is older than
  // any given version of the UI, and a row this version can't name should
  // still appear.
  const label = (action: string) => {
    const meta = metaOf(action);
    return meta ? t(`audit.action.${meta.message}`) : action;
  };

  const columns: TableColumn<AuditEntry>[] = [
    {
      id: "action",
      header: t("audit.colAction"),
      width: "minmax(0, 1fr)",
      sortValue: (row) => row.action,
      cell: (row) => (
        <span
          className={styles.action}
          data-loud={isLoud(row.action) || undefined}
        >
          <Icon
            icon={metaOf(row.action)?.icon ?? UNKNOWN_ICON}
            width={15}
            className={styles.icon}
          />
          <span className={styles.actionText}>
            <span className={styles.actionName}>{label(row.action)}</span>
            {row.targetLabel && (
              <TargetLabel
                text={row.targetLabel}
                action={row.action}
                meta={row.meta}
                personColor={row.personColor}
                workspaceSlug={workspaceSlug}
                projectRef={row.projectRef}
                workspaceRef={row.workspaceRef}
              />
            )}
          </span>
        </span>
      ),
    },
    {
      id: "actor",
      header: t("audit.colActor"),
      width: "minmax(200px, max-content)",
      sortValue: (row) => row.actorLabel,
      cell: (row) => (
        <span className={styles.actor}>
          <Avatar
            avatar={
              row.actorColor
                ? {
                    name: actorDisplayName(row.actorLabel),
                    color: row.actorColor,
                    image: row.actorAvatarUrl ?? undefined,
                  }
                : null
            }
            shape="circle"
            size={20}
            placeholder
            placeholderLabel={row.actorLabel}
          />
          <span className={styles.actorName}>{row.actorLabel}</span>
        </span>
      ),
    },
    {
      id: "reason",
      header: t("audit.colReason"),
      width: "minmax(0, 1.2fr)",
      sortValue: (row) => row.reason,
      // Only present for break-glass access, where it's the row's actual
      // point — hence its own column and not a footnote.
      cell: (row) =>
        row.reason ? (
          <span className={styles.reason} title={row.reason}>
            {row.reason}
          </span>
        ) : (
          <span className={styles.empty}>—</span>
        ),
    },
    {
      id: "when",
      header: t("audit.colWhen"),
      width: "minmax(130px, max-content)",
      align: "end",
      sortValue: (row) => row.createdAt,
      cell: (row) => (
        <time
          className={styles.when}
          dateTime={row.createdAt.toISOString()}
          title={row.createdAt.toLocaleString()}
          suppressHydrationWarning
        >
          {timeAgo(row.createdAt.getTime())}
        </time>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        divider={false}
        title={title}
        count={rows.length}
        description={description}
        actions={
          <>
            {availableActions.length > 1 && (
              <select
                className={styles.filterSelect}
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                aria-label={t("audit.filterAction")}
              >
                <option value="all">{t("audit.allActions")}</option>
                {availableActions.map((action) => (
                  <option key={action} value={action}>
                    {label(action)}
                  </option>
                ))}
              </select>
            )}
            <Chip
              type="filter"
              icon={<Icon icon="lucide:siren" width={14} />}
              selected={loudOnly}
              onClick={() => setLoudOnly((value) => !value)}
            >
              {t("audit.loudOnly")}
            </Chip>
          </>
        }
      />

      <div className={styles.content}>
        <Table
          fill
          variant="card"
          label={title}
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<Icon icon="lucide:scroll-text" width={32} />}
              title={t("audit.emptyTitle")}
              description={t("audit.emptyDesc")}
            />
          }
          footer={
            cursor && <LoadMoreSentinel ref={sentinelRef} loading={loading} />
          }
        />
      </div>
    </>
  );
}
