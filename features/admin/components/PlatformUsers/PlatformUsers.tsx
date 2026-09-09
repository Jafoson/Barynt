"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Label } from "@/components/ui/atoms/Label/Label";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { UserCell } from "@/components/ui/atoms/UserCell/UserCell";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { LoadMoreSentinel } from "@/components/ui/layout/Table/LoadMoreSentinel/LoadMoreSentinel";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import { useInfiniteScroll } from "@/components/ui/layout/Table/useInfiniteScroll";
import { useTableSort } from "@/components/ui/layout/Table/useTableSort";
import { setPlatformRole, setUserActive } from "@/features/admin/actions";
import type {
  PlatformRoleOption,
  PlatformUser,
} from "@/features/admin/queries";
import { roleColor } from "@/lib/rbac";
import { fullName } from "@/lib/utils/string";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import styles from "./platformUsers.module.scss";

interface Props {
  users: PlatformUser[];
  roles: PlatformRoleOption[];
  /** Your own id — your own row can't be touched. */
  currentUserId: string;
  nextCursor: string | null;
  /** Loads the next page from a cursor (`loadMoreUsers`,
   * `features/admin/actions.ts`). */
  loadMore: (
    cursor: string,
  ) => Promise<{ items: PlatformUser[]; nextCursor: string | null }>;
}

/**
 * All accounts on the platform: who's there, what they sign in with, what
 * they're allowed to do, and when they were last around.
 *
 * Two interventions hang off every row, and both are permission shifts —
 * setting the platform role and deactivating an account. Both end up in the
 * audit log, both are locked on your own row: `setPlatformRole` and
 * `setUserActive` reject that, and the UI doesn't even display it as an
 * option.
 *
 * What is **not** here is just as deliberate as what is. There's no password
 * column, no hash, no "show password" action. Whether one is even set is
 * conveyed by the icon in the access column — nobody learns more than that
 * at this level, and the server doesn't hand out more either
 * (`features/admin/queries.ts`).
 */
export function PlatformUsers({
  users,
  roles,
  currentUserId,
  nextCursor,
  loadMore,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const timeAgo = useTimeAgo();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const { items, cursor, loading, sentinelRef } = useInfiniteScroll({
    initialItems: users,
    initialCursor: nextCursor,
    loadMore,
  });

  const run = (action: () => Promise<{ ok: true } | { error: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError("error" in result ? result.error : "");
      router.refresh();
    });

  const toggleActive = async (row: PlatformUser) => {
    const active = row.deactivatedAt === null;

    // Deactivating is the more drastic direction and gets the confirmation
    // prompt — it also states what *doesn't* happen in the process: the
    // work stays in place.
    if (active) {
      const ok = await confirm({
        title: t("platform.deactivateTitle", { name: fullName(row) }),
        description: t("platform.deactivateDesc"),
        confirmLabel: t("platform.deactivate"),
        cancelLabel: t("actions.cancel"),
        danger: true,
      });
      if (!ok) return;
    }

    run(() => setUserActive(row.id, !active));
  };

  const roleCell = (row: PlatformUser) => {
    const rank = roles.find((r) => r.key === row.platformRole?.key)?.rank ?? 0;
    const pill = (
      <Label size="sm" filled color={roleColor(rank)}>
        {row.platformRole?.name ?? t("platform.noRole")}
      </Label>
    );

    // Not your own role through this table: self-promotion would be a way
    // around the rank order, and the server rejects it anyway.
    if (row.id === currentUserId || roles.length === 0) return pill;

    return (
      <InlinePicker
        trigger={
          <button
            type="button"
            className={styles.roleTrigger}
            title={t("fields.role")}
          >
            {pill}
            <Icon icon="lucide:chevron-down" width={14} />
          </button>
        }
        width={260}
        stop
      >
        {(close) => (
          <SelectMenu
            items={roles.map((role) => ({ value: role.id, label: role.name }))}
            value={
              roles.find((r) => r.key === row.platformRole?.key)?.id ?? null
            }
            onPick={(value) => {
              run(() => setPlatformRole(row.id, String(value)));
              close();
            }}
            onClose={close}
          />
        )}
      </InlinePicker>
    );
  };

  const columns: TableColumn<PlatformUser>[] = [
    {
      id: "user",
      header: t("platform.colUser"),
      width: "minmax(0, 1fr)",
      sortValue: (row) => fullName(row),
      cell: (row) => (
        <UserCell
          avatar={row}
          name={fullName(row)}
          meta={row.email}
          size={32}
          className={row.deactivatedAt ? styles.dimmed : undefined}
          trailing={
            <>
              {row.deactivatedAt && (
                <Badge size="sm" mono={false}>
                  {t("platform.statusDeactivated")}
                </Badge>
              )}
              {!row.deactivatedAt && row.invitePending && (
                <Badge size="sm" mono={false}>
                  {t("platform.statusInvited")}
                </Badge>
              )}
            </>
          }
        />
      ),
    },
    {
      id: "role",
      header: t("fields.role"),
      width: "minmax(160px, max-content)",
      sortValue: (row) =>
        roles.find((r) => r.key === row.platformRole?.key)?.rank ?? -1,
      cell: roleCell,
    },
    {
      id: "access",
      header: t("platform.colAccess"),
      width: "minmax(110px, max-content)",
      sortValue: (row) => (row.hasPasskey ? 1 : 0),
      // Anyone without a passkey gets in via a connected provider or hasn't
      // accepted their invitation yet.
      cell: (row) => (
        <span className={styles.access}>
          <Icon
            icon={row.hasPasskey ? "lucide:key-round" : "lucide:key-square"}
            width={14}
          />
          {row.hasPasskey
            ? t("platform.accessPasskey")
            : t("platform.accessProvider")}
        </span>
      ),
    },
    {
      id: "workspaces",
      header: t("platform.colWorkspaces"),
      width: "minmax(110px, max-content)",
      align: "end",
      sortValue: (row) => row.workspaceCount,
      cell: (row) => <span className={styles.num}>{row.workspaceCount}</span>,
    },
    {
      id: "lastSeen",
      header: t("platform.colLastSeen"),
      width: "minmax(130px, max-content)",
      sortValue: (row) => row.lastSeenAt,
      cell: (row) => (
        <span className={styles.muted} suppressHydrationWarning>
          {row.lastSeenAt
            ? timeAgo(row.lastSeenAt.getTime())
            : t("platform.never")}
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      width: "40px",
      align: "end",
      cell: (row) =>
        row.id !== currentUserId && (
          <Button
            variant="ghost"
            size="sm"
            icon={
              <Icon
                icon={row.deactivatedAt ? "lucide:user-check" : "lucide:user-x"}
                width={15}
              />
            }
            title={
              row.deactivatedAt
                ? t("platform.reactivate")
                : t("platform.deactivate")
            }
            aria-label={
              row.deactivatedAt
                ? t("platform.reactivate")
                : t("platform.deactivate")
            }
            disabled={isPending}
            onClick={() => toggleActive(row)}
          />
        ),
    },
  ];

  const { sort, sortRows } = useTableSort(columns);

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.users")}
        count={items.length}
        description={t("platform.usersDesc")}
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
          label={t("nav.users")}
          columns={columns}
          rows={sortRows(items)}
          sort={sort}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<Icon icon="lucide:users" width={32} />}
              title={t("platform.usersEmpty")}
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
