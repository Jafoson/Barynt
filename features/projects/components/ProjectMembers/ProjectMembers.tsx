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
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { LoadMoreSentinel } from "@/components/ui/layout/Table/LoadMoreSentinel/LoadMoreSentinel";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import { useInfiniteScroll } from "@/components/ui/layout/Table/useInfiniteScroll";
import { useTableSort } from "@/components/ui/layout/Table/useTableSort";
import {
  addProjectMembers,
  removeProjectMember,
  setProjectMemberRole,
} from "@/features/projects/actions";
import type {
  ProjectMemberRow,
  ProjectMembersView,
} from "@/features/projects/types";
import { useModal } from "@/lib/context";
import { roleColor } from "@/lib/rbac";
import { fullName } from "@/lib/utils/string";
import { AddProjectMembersModal } from "./components/AddProjectMembersModal";
import styles from "./projectMembers.module.scss";

interface ProjectMembersProps extends ProjectMembersView {
  projectId: string;
  projectName: string;
  /** Loads the next page from an offset (`loadMoreProjectMembers`,
   * `features/projects/actions.ts`, bound to `projectId`). */
  loadMore: (
    cursor: string,
  ) => Promise<{ items: ProjectMemberRow[]; nextCursor: string | null }>;
}

/**
 * Everyone with access to a project, as a list. The "Access" column says
 * where it comes from: an own project role or the inherited workspace role.
 * A click turns inherited access into an own role — only what belongs to
 * the project itself gets changed.
 */
export function ProjectMembers({
  projectId,
  projectName,
  rows,
  candidates,
  assignableRoles,
  defaultRole,
  canAdd,
  canSetRole,
  canRemove,
  canInvite,
  nextCursor,
  loadMore,
}: ProjectMembersProps) {
  const t = useTranslations();
  const router = useRouter();
  const { openModal } = useModal();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const { items, cursor, loading, sentinelRef } = useInfiniteScroll({
    initialItems: rows,
    initialCursor: nextCursor,
    loadMore,
  });

  const run = (action: () => Promise<{ ok: true } | { error: string }>) =>
    startTransition(async () => {
      const result = await action();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError("");
      router.refresh();
    });

  const openAdd = () =>
    openModal(({ close }) => (
      <AddProjectMembersModal
        projectId={projectId}
        projectName={projectName}
        candidates={candidates}
        roles={assignableRoles}
        defaultRole={defaultRole}
        canInvite={canInvite}
        close={close}
      />
    ));

  const addButton = canAdd && (
    <Button
      variant="primary"
      icon={<Icon icon="lucide:plus" width={15} />}
      onClick={openAdd}
    >
      {t("actions.addMember")}
    </Button>
  );

  const roleCell = (row: ProjectMemberRow) => {
    const own = row.source === "project";
    const viaTeam = row.origin === "team";
    // Filled means "this role belongs to the project". An inherited
    // workspace role stays faded — it applies here, but was decided
    // elsewhere. This replaces the former dedicated column for that.
    const pill = (
      <Label
        size="sm"
        filled={own}
        color={roleColor(row.roleRank)}
        title={
          !own
            ? t("projectMembers.inherited")
            : viaTeam
              ? t("projectMembers.viaTeam", {
                  team: row.originTeam?.name ?? "",
                })
              : undefined
        }
      >
        {row.roleName}
        {viaTeam && (
          <Icon
            icon="lucide:users-round"
            width={11}
            className={styles.teamIcon}
          />
        )}
      </Label>
    );
    // Only a project's own role can be changed here, and only with
    // `member.role.update`. The inherited one belongs to the workspace —
    // whoever wants to touch it has to enroll the person into the project first.
    if (!own || !row.manageable || !canSetRole || assignableRoles.length === 0)
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
        width={220}
        stop
      >
        {(close) => (
          <SelectMenu
            items={assignableRoles.map((role) => ({
              value: role.id,
              label: role.name,
            }))}
            value={row.role}
            onPick={(value) => {
              run(() =>
                setProjectMemberRole(projectId, row.user.id, String(value)),
              );
              close();
            }}
            onClose={close}
          />
        )}
      </InlinePicker>
    );
  };

  // Active is the normal case and therefore stays quiet; a pending
  // invitation is the special case and announces itself with color and dot.
  const statusCell = (row: ProjectMemberRow) =>
    row.pending ? (
      <span className={styles.statusInvited}>
        {t("projectMembers.statusInvited")}
      </span>
    ) : (
      <span className={styles.status}>{t("projectMembers.statusActive")}</span>
    );

  const actionCell = (row: ProjectMemberRow) => {
    if (!row.manageable) return null;

    // Inherited access can't be revoked — only converted into an own
    // project role, which can then be changed. That's an enrollment into
    // the project and therefore requires `member.invite`.
    if (row.source === "workspace") {
      if (!canAdd) return null;
      const label = t("projectMembers.addToProject");
      return (
        <Button
          variant="ghost"
          size="sm"
          icon={<Icon icon="lucide:user-plus" width={15} />}
          title={label}
          aria-label={label}
          disabled={isPending}
          onClick={() =>
            run(() =>
              addProjectMembers({
                projectId,
                userIds: [row.user.id],
                role: defaultRole,
              }),
            )
          }
        />
      );
    }

    if (!canRemove) return null;

    const label = t("projectMembers.removeFromProject");
    return (
      <Button
        variant="ghost"
        size="sm"
        icon={<Icon icon="lucide:trash-2" width={15} />}
        title={label}
        aria-label={label}
        disabled={isPending}
        onClick={() => run(() => removeProjectMember(projectId, row.user.id))}
      />
    );
  };

  const columns: TableColumn<ProjectMemberRow>[] = [
    {
      id: "member",
      header: t("projectMembers.colMember"),
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
      // By rank: "Admin before Member" is the ordering a role has.
      sortValue: (row) => row.roleRank,
      cell: roleCell,
    },
    {
      id: "status",
      header: t("projectMembers.colStatus"),
      width: "minmax(140px, max-content)",
      sortValue: (row) => (row.pending ? 1 : 0),
      cell: statusCell,
    },
    {
      id: "actions",
      header: "",
      width: "40px",
      align: "end",
      cell: actionCell,
    },
  ];

  const { sort, sortRows } = useTableSort(columns);

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.members")}
        count={items.length}
        description={t("projectMembers.subtitle", {
          count: items.length,
          project: projectName,
        })}
        actions={addButton}
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
          getRowKey={(row) => `${row.source}:${row.user.id}`}
          empty={
            <EmptyState
              icon={<Icon icon="lucide:users" width={32} />}
              title={t("projectMembers.emptyTitle")}
              description={t("projectMembers.emptyDesc")}
              action={addButton}
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
