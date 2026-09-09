"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { CopyField } from "@/components/ui/atoms/CopyField/CopyField";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { Label } from "@/components/ui/atoms/Label/Label";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { LoadMoreSentinel } from "@/components/ui/layout/Table/LoadMoreSentinel/LoadMoreSentinel";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import { useInfiniteScroll } from "@/components/ui/layout/Table/useInfiniteScroll";
import {
  resendInvitation,
  revokeInvitation,
} from "@/features/workspaces/actions";
import type { PendingInvitationRow } from "@/features/workspaces/types";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import styles from "./pendingInvitations.module.scss";

interface Props {
  rows: PendingInvitationRow[];
  canManage: boolean;
  nextCursor: string | null;
  /** Loads the next page from a token (`loadMorePendingWorkspaceInvitations`
   * or the project equivalent, bound to the respective id). */
  loadMore: (
    cursor: string,
  ) => Promise<{ items: PendingInvitationRow[]; nextCursor: string | null }>;
}

/**
 * Pending invitations — not yet accepted, regardless of whether they've
 * already expired.
 *
 * Unlike the member list (`WorkspaceMembers`/`ProjectMembers`), this table
 * shows only the intermediate state: as soon as someone accepts the
 * invitation, the row disappears here and shows up there instead. "Resend"
 * and "Revoke" are the only actions — nobody changes a role or address
 * after the fact, that's what a new invitation is for.
 */
export function PendingInvitations({
  rows,
  canManage,
  nextCursor,
  loadMore,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [resent, setResent] = useState<{ email: string; url: string } | null>(
    null,
  );
  const timeAgo = useTimeAgo();
  const format = useFormatter();

  const { items, cursor, loading, sentinelRef } = useInfiniteScroll({
    initialItems: rows,
    initialCursor: nextCursor,
    loadMore,
  });

  const resend = (row: PendingInvitationRow) =>
    startTransition(async () => {
      const result = await resendInvitation(row.token);
      if ("error" in result) {
        setError(result.error);
        setResent(null);
        return;
      }
      setError("");
      setResent(
        result.inviteUrl ? { email: row.email, url: result.inviteUrl } : null,
      );
      router.refresh();
    });

  const revoke = async (row: PendingInvitationRow) => {
    const ok = await confirm({
      title: t("pendingInvitations.revokeTitle", { email: row.email }),
      description: t("pendingInvitations.revokeDesc"),
      confirmLabel: t("pendingInvitations.revoke"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await revokeInvitation(row.token);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError("");
      setResent(null);
      router.refresh();
    });
  };

  const columns: TableColumn<PendingInvitationRow>[] = [
    {
      id: "email",
      header: t("pendingInvitations.colEmail"),
      // Fixed lower bound instead of `minmax(0, …)`: with many narrow
      // neighboring columns (role, invited by/on, expires, actions), a
      // lower bound of 0 would otherwise squeeze this column down to a few
      // pixels — the address is the row's main subject and mustn't be the
      // one that gives way.
      width: "minmax(200px, 1fr)",
      sortValue: (row) => row.email,
      cell: (row) => (
        <div className={styles.person}>
          <span className={styles.email}>{row.email}</span>
          {(row.firstName || row.lastName) && (
            <span className={styles.name}>
              {`${row.firstName} ${row.lastName}`.trim()}
            </span>
          )}
        </div>
      ),
    },
    {
      id: "role",
      header: t("fields.role"),
      width: "minmax(90px, max-content)",
      sortValue: (row) => row.roleName,
      cell: (row) => (
        <Label size="sm" filled>
          {row.roleName}
        </Label>
      ),
    },
    {
      id: "invitedBy",
      header: t("pendingInvitations.colInvitedBy"),
      width: "minmax(110px, max-content)",
      sortValue: (row) => row.invitedByName ?? "",
      cell: (row) => (
        <span className={styles.invitedBy}>
          {row.invitedByName ?? t("pendingInvitations.unknownInviter")}
        </span>
      ),
    },
    {
      id: "createdAt",
      header: t("pendingInvitations.colCreated"),
      width: "minmax(90px, max-content)",
      sortValue: (row) => row.createdAt,
      cell: (row) => (
        <time
          dateTime={row.createdAt.toISOString()}
          title={row.createdAt.toLocaleString()}
          suppressHydrationWarning
        >
          {timeAgo(row.createdAt.getTime())}
        </time>
      ),
    },
    {
      id: "expires",
      header: t("pendingInvitations.colExpires"),
      width: "minmax(90px, max-content)",
      sortValue: (row) => row.expires,
      cell: (row) =>
        row.expired ? (
          <span className={styles.expired}>
            {t("pendingInvitations.expired")}
          </span>
        ) : (
          // `timeAgo` tells how long ago something happened — for a date in
          // the future that would be backwards ("just now" for "in 14
          // days"). An absolute date says the right thing here.
          <time
            dateTime={row.expires.toISOString()}
            title={row.expires.toLocaleString()}
          >
            {format.dateTime(row.expires, { month: "short", day: "numeric" })}
          </time>
        ),
    },
    {
      id: "actions",
      header: "",
      width: "minmax(72px, max-content)",
      align: "end",
      cell: (row) =>
        canManage && (
          <div className={styles.rowActions}>
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:rotate-cw" width={13} />}
              title={t("pendingInvitations.resend")}
              aria-label={t("pendingInvitations.resend")}
              disabled={isPending}
              onClick={() => resend(row)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:x" width={14} />}
              title={t("pendingInvitations.revoke")}
              aria-label={t("pendingInvitations.revoke")}
              disabled={isPending}
              onClick={() => revoke(row)}
            />
          </div>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.invitations")}
        count={items.length}
        description={t("pendingInvitations.subtitle")}
      />

      <div className={styles.content}>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}
        {resent && (
          <div className={styles.resent}>
            <p className={styles.resentText}>
              <Icon icon="lucide:mail-check" width={14} />
              {t("pendingInvitations.resent", { email: resent.email })}
            </p>
            <CopyField
              value={resent.url}
              copyLabel={t("members.inviteLinkCopy")}
              copiedLabel={t("members.inviteLinkCopied")}
            />
          </div>
        )}

        <Table
          fill
          variant="card"
          label={t("nav.invitations")}
          columns={columns}
          rows={items}
          getRowKey={(row) => row.token}
          empty={
            <EmptyState
              icon={<Icon icon="lucide:mail" width={32} />}
              title={t("pendingInvitations.emptyTitle")}
              description={t("pendingInvitations.emptyDesc")}
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
