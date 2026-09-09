"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { LoadMoreSentinel } from "@/components/ui/layout/Table/LoadMoreSentinel/LoadMoreSentinel";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import { useInfiniteScroll } from "@/components/ui/layout/Table/useInfiniteScroll";
import { useTableSort } from "@/components/ui/layout/Table/useTableSort";
import { setWorkspaceSuspended } from "@/features/admin/actions";
import type { PlatformWorkspace } from "@/features/admin/queries";
import { useModal } from "@/lib/context";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import { DeleteWorkspaceModal } from "./components/DeleteWorkspaceModal";
import styles from "./platformWorkspaces.module.scss";

interface Props {
  workspaces: PlatformWorkspace[];
  canSuspend: boolean;
  canDelete: boolean;
  nextCursor: string | null;
  /** Loads the next page from a cursor (`loadMoreWorkspaces`,
   * `features/admin/actions.ts`). */
  loadMore: (
    cursor: string,
  ) => Promise<{ items: PlatformWorkspace[]; nextCursor: string | null }>;
}

/**
 * The platform's tenants.
 *
 * ── What's here ──
 *
 * Name, person responsible, size, age, last activity, state. That's the
 * shell: enough to administer a tenant, bill it, and suspend it.
 *
 * ── What's missing, and why ──
 *
 * There's no way in. No row is a link, no button says "open". A platform
 * admin isn't a member of someone else's workspace, and the permission
 * resolution doesn't grant them anything there either (`lib/permissions.ts`)
 * — a link would just lead to an empty page and create the impression that
 * a door exists. It does exist, but elsewhere and narrower: break-glass
 * access per project, with a reason and an audit entry.
 *
 * ── What you're allowed to do ──
 *
 * Suspending is the normal case and reversible: it removes access for
 * everyone in the tenant and leaves the data in place. Deleting is the
 * exception and final — that's why the button is only available on a
 * workspace that's already suspended. Anyone who wants to delete has to
 * suspend first; that's the night in between that no confirmation dialog can
 * replace.
 */
export function PlatformWorkspaces({
  workspaces,
  canSuspend,
  canDelete,
  nextCursor,
  loadMore,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const timeAgo = useTimeAgo();
  const { openModal } = useModal();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const { items, cursor, loading, sentinelRef } = useInfiniteScroll({
    initialItems: workspaces,
    initialCursor: nextCursor,
    loadMore,
  });

  const run = (action: () => Promise<{ ok: true } | { error: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError("error" in result ? result.error : "");
      router.refresh();
    });

  const toggleSuspended = async (row: PlatformWorkspace) => {
    // Only suspending asks for confirmation. Unsuspending gives back
    // something that was there before — that doesn't need a confirmation
    // prompt.
    if (!row.suspended) {
      const ok = await confirm({
        title: t("platformWorkspaces.suspendTitle", { name: row.name }),
        description: t("platformWorkspaces.suspendDesc", {
          members: row.members,
        }),
        confirmLabel: t("platformWorkspaces.suspend"),
        cancelLabel: t("actions.cancel"),
        danger: true,
      });
      if (!ok) return;
    }

    run(() => setWorkspaceSuspended(row.id, !row.suspended));
  };

  const openDelete = (row: PlatformWorkspace) =>
    openModal(({ close }) => (
      <DeleteWorkspaceModal workspace={row} close={close} />
    ));

  const columns: TableColumn<PlatformWorkspace>[] = [
    {
      id: "workspace",
      header: t("platformWorkspaces.colWorkspace"),
      width: "minmax(0, 1fr)",
      sortValue: (row) => row.name,
      cell: (row) => (
        <span className={styles.workspace}>
          <Avatar
            avatar={{
              name: row.name,
              color: row.color,
              image: row.avatarUrl ?? undefined,
            }}
            shape="square"
            size={32}
          />
          <span className={styles.text}>
            <span className={styles.name}>
              {row.name}
              {row.suspended && (
                <Badge size="sm" mono={false} className={styles.suspended}>
                  {t("platformWorkspaces.statusSuspended")}
                </Badge>
              )}
            </span>
            <span className={styles.meta}>{row.slug}</span>
          </span>
        </span>
      ),
    },
    {
      id: "owner",
      header: t("platformWorkspaces.colOwner"),
      width: "minmax(170px, max-content)",
      sortValue: (row) =>
        row.owner ? `${row.owner.firstName} ${row.owner.lastName}` : null,
      cell: (row) =>
        row.owner ? (
          <span className={styles.owner}>
            {`${row.owner.firstName} ${row.owner.lastName}`.trim()}
          </span>
        ) : (
          // Without an owner, nobody administers the tenant anymore — the
          // same situation as an orphaned project, just one level up.
          <span className={styles.warn}>{t("platformWorkspaces.noOwner")}</span>
        ),
    },
    {
      id: "members",
      header: t("platformWorkspaces.colMembers"),
      width: "minmax(100px, max-content)",
      align: "end",
      sortValue: (row) => row.members,
      cell: (row) => <span className={styles.num}>{row.members}</span>,
    },
    {
      id: "projects",
      header: t("platform.projects"),
      width: "minmax(100px, max-content)",
      align: "end",
      sortValue: (row) => row.projects,
      cell: (row) => <span className={styles.num}>{row.projects}</span>,
    },
    {
      // A number, not a way in.
      id: "issues",
      header: t("dashboard.issues"),
      width: "minmax(100px, max-content)",
      align: "end",
      sortValue: (row) => row.issues,
      cell: (row) => <span className={styles.num}>{row.issues}</span>,
    },
    {
      id: "activity",
      header: t("platformWorkspaces.colActivity"),
      width: "minmax(130px, max-content)",
      sortValue: (row) => row.lastActivityAt,
      cell: (row) => (
        <span className={styles.muted} suppressHydrationWarning>
          {row.lastActivityAt
            ? timeAgo(row.lastActivityAt.getTime())
            : t("platformWorkspaces.never")}
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
          {canSuspend && (
            <Button
              variant="ghost"
              size="sm"
              icon={
                <Icon
                  icon={row.suspended ? "lucide:circle-check" : "lucide:ban"}
                  width={15}
                />
              }
              title={
                row.suspended
                  ? t("platformWorkspaces.unsuspend")
                  : t("platformWorkspaces.suspend")
              }
              aria-label={
                row.suspended
                  ? t("platformWorkspaces.unsuspend")
                  : t("platformWorkspaces.suspend")
              }
              disabled={isPending}
              onClick={() => toggleSuspended(row)}
            />
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              className={styles.delete}
              icon={<Icon icon="lucide:trash-2" width={15} />}
              // Disabled while the tenant is active. The title explains
              // why — a grayed-out button with no explanation is a dead end.
              disabled={isPending || !row.suspended}
              title={
                row.suspended
                  ? t("platformWorkspaces.delete")
                  : t("platformWorkspaces.deleteNeedsSuspend")
              }
              aria-label={
                row.suspended
                  ? t("platformWorkspaces.delete")
                  : t("platformWorkspaces.deleteNeedsSuspend")
              }
              onClick={() => openDelete(row)}
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
        title={t("nav.workspaces")}
        count={items.length}
        description={t("platformWorkspaces.desc")}
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
          label={t("nav.workspaces")}
          columns={columns}
          rows={sortRows(items)}
          sort={sort}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<Icon icon="lucide:building-2" width={32} />}
              title={t("platformWorkspaces.empty")}
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
