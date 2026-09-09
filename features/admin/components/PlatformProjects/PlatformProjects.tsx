"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { LoadMoreSentinel } from "@/components/ui/layout/Table/LoadMoreSentinel/LoadMoreSentinel";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import { useInfiniteScroll } from "@/components/ui/layout/Table/useInfiniteScroll";
import { useTableSort } from "@/components/ui/layout/Table/useTableSort";
import { reassignProject, setProjectArchived } from "@/features/admin/actions";
import type { PlatformProject } from "@/features/admin/queries";
import { useModal } from "@/lib/context";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import { BreakGlassModal } from "./components/BreakGlassModal";
import styles from "./platformProjects.module.scss";

/** An account an orphaned project can be reassigned to. */
export interface OwnerOption {
  id: string;
  name: string;
  email: string | null;
}

interface Props {
  projects: PlatformProject[];
  owners: OwnerOption[];
  canManage: boolean;
  canBreakGlass: boolean;
  nextCursor: string | null;
  /** Loads the next page from a cursor (`loadMoreProjects`,
   * `features/admin/actions.ts`). */
  loadMore: (
    cursor: string,
  ) => Promise<{ items: PlatformProject[]; nextCursor: string | null }>;
}

/**
 * All projects on the platform — their shell, not their content.
 *
 * This list also shows private projects, and that's the point: platform
 * administration needs to know *that* they exist, in order to reassign
 * orphans, attribute cost, and clean up. What's inside them, it does not
 * show — there is no row, no link, and no expand arrow in this table that
 * leads to issues or comments. The "issues" column is a number and stays one.
 *
 * The only way in sits at the end of the row and is named for what it is:
 * break-glass access. It requires a reason, visibly adds the actor to the
 * member list, and ends up in the audit log afterward — see
 * `BreakGlassModal` and `features/admin/actions.ts`.
 */
export function PlatformProjects({
  projects,
  owners,
  canManage,
  canBreakGlass,
  nextCursor,
  loadMore,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const timeAgo = useTimeAgo();
  const { openModal } = useModal();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const { items, cursor, loading, sentinelRef } = useInfiniteScroll({
    initialItems: projects,
    initialCursor: nextCursor,
    loadMore,
  });

  const run = (action: () => Promise<{ ok: true } | { error: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError("error" in result ? result.error : "");
      router.refresh();
    });

  const openBreakGlass = (project: PlatformProject) =>
    openModal(({ close }) => (
      <BreakGlassModal project={project} close={close} />
    ));

  const columns: TableColumn<PlatformProject>[] = [
    {
      id: "project",
      header: t("platform.colProject"),
      width: "minmax(0, 1fr)",
      sortValue: (row) => row.name,
      cell: (row) => (
        <span className={styles.project}>
          <Avatar
            avatar={{
              name: row.name,
              color: row.color,
              image: row.avatarUrl ?? undefined,
            }}
            shape="square"
            size={32}
          />
          <span className={styles.projectText}>
            <span className={styles.projectName}>
              {row.name}
              {row.visibility === "private" && (
                <Icon
                  icon="lucide:lock"
                  width={12}
                  className={styles.lock}
                  aria-label={t("platform.private")}
                />
              )}
              {row.archivedAt && (
                <Badge size="sm" mono={false}>
                  {t("platform.archived")}
                </Badge>
              )}
              {row.orphaned && (
                <Badge size="sm" mono={false} className={styles.warnBadge}>
                  {t("platform.orphaned")}
                </Badge>
              )}
            </span>
            <span className={styles.projectMeta}>{row.workspace.name}</span>
          </span>
        </span>
      ),
    },
    {
      id: "owner",
      header: t("platform.colOwner"),
      width: "minmax(170px, max-content)",
      sortValue: (row) =>
        row.owner ? `${row.owner.firstName} ${row.owner.lastName}` : null,
      cell: (row) => {
        const label = row.owner
          ? `${row.owner.firstName} ${row.owner.lastName}`.trim()
          : t("platform.noOwner");

        if (!canManage || owners.length === 0)
          return (
            <span className={row.owner ? styles.muted : styles.warn}>
              {label}
            </span>
          );

        return (
          <InlinePicker
            trigger={
              <button
                type="button"
                className={styles.ownerTrigger}
                title={t("platform.reassign")}
              >
                <span className={row.owner ? undefined : styles.warn}>
                  {label}
                </span>
                <Icon icon="lucide:chevron-down" width={14} />
              </button>
            }
            width={280}
            stop
          >
            {(close) => (
              <SelectMenu
                searchable
                placeholder={t("platform.reassignSearch")}
                items={owners.map((owner) => ({
                  value: owner.id,
                  label: owner.name,
                  hint: owner.email ?? undefined,
                }))}
                value={row.owner?.id ?? null}
                onPick={(value) => {
                  run(() => reassignProject(row.id, String(value)));
                  close();
                }}
                onClose={close}
              />
            )}
          </InlinePicker>
        );
      },
    },
    {
      id: "members",
      header: t("platform.colMembers"),
      width: "minmax(100px, max-content)",
      align: "end",
      sortValue: (row) => row.memberCount,
      cell: (row) => <span className={styles.num}>{row.memberCount}</span>,
    },
    {
      // A number, not a way in. It says how much is in the project — not
      // what.
      id: "issues",
      header: t("platform.colIssues"),
      width: "minmax(100px, max-content)",
      align: "end",
      sortValue: (row) => row.issueCount,
      cell: (row) => <span className={styles.num}>{row.issueCount}</span>,
    },
    {
      id: "created",
      header: t("platform.colCreated"),
      width: "minmax(120px, max-content)",
      sortValue: (row) => row.createdAt,
      cell: (row) => (
        <span className={styles.muted} suppressHydrationWarning>
          {timeAgo(row.createdAt.getTime())}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      width: "max-content",
      align: "end",
      cell: (row) => (
        <span className={styles.actions}>
          {canManage && (
            <Button
              variant="ghost"
              size="sm"
              icon={
                <Icon
                  icon={
                    row.archivedAt ? "lucide:archive-restore" : "lucide:archive"
                  }
                  width={15}
                />
              }
              title={
                row.archivedAt ? t("platform.unarchive") : t("platform.archive")
              }
              aria-label={
                row.archivedAt ? t("platform.unarchive") : t("platform.archive")
              }
              disabled={isPending}
              onClick={() =>
                run(() => setProjectArchived(row.id, !row.archivedAt))
              }
            />
          )}
          {canBreakGlass && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:siren" width={15} />}
              className={styles.breakGlass}
              title={t("platform.breakGlass")}
              aria-label={t("platform.breakGlass")}
              disabled={isPending}
              onClick={() => openBreakGlass(row)}
            />
          )}
        </span>
      ),
    },
  ];

  const { sort, sortRows } = useTableSort(columns);

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.projects")}
        count={items.length}
        description={t("platform.projectsDesc")}
      />

      <div className={styles.content}>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}

        <Table
          fill
          variant="card"
          label={t("nav.projects")}
          columns={columns}
          rows={sortRows(items)}
          sort={sort}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<Icon icon="lucide:folders" width={32} />}
              title={t("platform.projectsEmpty")}
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
