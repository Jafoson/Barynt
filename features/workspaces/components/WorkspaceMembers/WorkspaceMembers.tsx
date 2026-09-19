"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
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
import { removeMember, setMemberRole } from "@/features/workspaces/actions";
import type {
  WorkspaceMemberRow,
  WorkspaceMembersView,
} from "@/features/workspaces/types";
import { useModal } from "@/lib/context";
import { roleColor } from "@/lib/rbac";
import { fullName } from "@/lib/utils/string";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { InviteMemberModal } from "./components/InviteMemberModal";
import styles from "./workspaceMembers.module.scss";

interface Props extends WorkspaceMembersView {
  workspaceId: string;
  /** Loads the next page from a cursor (`loadMoreWorkspaceMembers`,
   * `features/workspaces/actions.ts`, bound to `workspaceId`). */
  loadMore: (
    cursor: string,
  ) => Promise<{ items: WorkspaceMemberRow[]; nextCursor: string | null }>;
}

/**
 * Who's in the workspace, with which role, and in which teams.
 *
 * The counterpart to `ProjectMembers` one level up: there, the project role
 * governs a project; here, the workspace role governs the shell that
 * contains all the projects. What's touchable is decided by the server per
 * row (`manageable`) — rank and owner protection don't belong on the client.
 */
export function WorkspaceMembers({
  rows,
  assignableRoles,
  canInvite,
  canSetRole,
  canRemove,
  workspaceId,
  nextCursor,
  loadMore,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const { items, cursor, loading, sentinelRef } = useInfiniteScroll({
    initialItems: rows,
    initialCursor: nextCursor,
    loadMore,
  });

  // `setMemberRole` and `removeMember` throw instead of returning errors —
  // they're wired up to row actions. The throw is caught here so the page
  // doesn't hit its error boundary.
  const run = (action: () => Promise<unknown>, failure: string) =>
    startTransition(async () => {
      try {
        await action();
        setError("");
        router.refresh();
      } catch {
        setError(failure);
      }
    });

  // A bottom sheet on a phone, a dialog from a tablet up.
  const openInvite = () =>
    openModal(
      ({ close }) => (
        <InviteMemberModal
          workspaceId={workspaceId}
          roles={assignableRoles}
          close={close}
          sheet={isPhone}
        />
      ),
      isPhone ? { placement: "bottom" } : undefined,
    );

  const remove = async (row: WorkspaceMemberRow) => {
    // Removing someone from the workspace also removes them from all of
    // its projects. That's in the confirmation dialog because it's the
    // actual consequence of the action.
    const ok = await confirm({
      title: t("workspaceMembers.removeTitle", { name: fullName(row.user) }),
      description: t("workspaceMembers.removeDesc"),
      confirmLabel: t("actions.remove"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (!ok) return;

    run(
      () => removeMember(workspaceId, row.user.id),
      t("workspaceMembers.removeFailed"),
    );
  };

  const inviteButton = canInvite && assignableRoles.length > 0 && (
    <Button
      variant="primary"
      icon={<Icon icon="lucide:plus" width={15} />}
      onClick={openInvite}
    >
      {t("actions.inviteMember")}
    </Button>
  );

  const roleCell = (row: WorkspaceMemberRow) => {
    const pill = (
      <Label size="sm" filled color={roleColor(row.roleRank)}>
        {row.roleName}
      </Label>
    );
    if (!row.manageable || !canSetRole || assignableRoles.length === 0)
      return pill;

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
        width={240}
        stop
      >
        {(close) => (
          <SelectMenu
            items={assignableRoles.map((role) => ({
              value: role.id,
              label: role.name,
              hint: role.desc,
            }))}
            value={row.role}
            onPick={(value) => {
              run(
                () => setMemberRole(workspaceId, row.user.id, String(value)),
                t("workspaceMembers.roleFailed"),
              );
              close();
            }}
            onClose={close}
          />
        )}
      </InlinePicker>
    );
  };

  const columns: TableColumn<WorkspaceMemberRow>[] = [
    {
      id: "member",
      header: t("members.colUser"),
      width: "minmax(0, 1fr)",
      sortValue: (row) => fullName(row.user),
      cell: (row) => (
        <UserCell
          avatar={row.user}
          name={fullName(row.user)}
          meta={row.user.email}
          size={32}
          trailing={
            row.you && (
              <span className={styles.you}>{t("projectMembers.you")}</span>
            )
          }
        />
      ),
    },
    {
      id: "role",
      header: t("fields.role"),
      width: "minmax(150px, max-content)",
      // By rank, not by name: the roles have an inherent order, and
      // "Owner before Member" is the one someone is looking for here.
      sortValue: (row) => row.roleRank,
      cell: roleCell,
    },
    {
      id: "teams",
      header: t("members.colTeams"),
      width: "minmax(160px, max-content)",
      sortValue: (row) => row.teams.length,
      cell: (row) =>
        row.teams.length === 0 ? (
          <span className={styles.noTeams}>{t("members.noTeams")}</span>
        ) : (
          <span className={styles.teams}>
            {row.teams.map((team) => (
              <Label key={team.id} size="sm" color={team.color}>
                {team.name}
              </Label>
            ))}
          </span>
        ),
    },
    {
      id: "status",
      header: t("projectMembers.colStatus"),
      width: "minmax(130px, max-content)",
      sortValue: (row) => (row.pending ? 1 : 0),
      cell: (row) =>
        row.pending ? (
          <span className={styles.statusInvited}>
            {t("projectMembers.statusInvited")}
          </span>
        ) : (
          <span className={styles.status}>
            {t("projectMembers.statusActive")}
          </span>
        ),
    },
    {
      id: "actions",
      header: "",
      width: "40px",
      align: "end",
      cell: (row) =>
        row.manageable &&
        canRemove && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon icon="lucide:user-minus" width={15} />}
            title={t("members.removeTitle")}
            aria-label={t("members.removeTitle")}
            disabled={isPending}
            onClick={() => remove(row)}
          />
        ),
    },
  ];

  const { sort, sortRows } = useTableSort(columns);

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.members")}
        count={items.length}
        description={t("workspaceMembers.subtitle")}
        actions={inviteButton}
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
          label={t("nav.members")}
          columns={columns}
          rows={sortRows(items)}
          sort={sort}
          getRowKey={(row) => row.user.id}
          empty={
            <EmptyState
              icon={<Icon icon="lucide:users" width={32} />}
              title={t("workspaceMembers.emptyTitle")}
              description={t("workspaceMembers.emptyDesc")}
              action={inviteButton}
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
