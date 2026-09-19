"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { AvatarStack } from "@/components/ui/atoms/Avatar/Avatar";
import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { Label } from "@/components/ui/atoms/Label/Label";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { LoadMoreSentinel } from "@/components/ui/layout/Table/LoadMoreSentinel/LoadMoreSentinel";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import { useInfiniteScroll } from "@/components/ui/layout/Table/useInfiniteScroll";
import { useTableSort } from "@/components/ui/layout/Table/useTableSort";
import { deleteTeam } from "@/features/workspaces/actions";
import type {
  WorkspaceTeamRow,
  WorkspaceTeamsView,
} from "@/features/workspaces/types";
import { useModal } from "@/lib/context";
import { fullName } from "@/lib/utils/string";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { TeamModal } from "./components/TeamModal";
import styles from "./workspaceTeams.module.scss";

interface Props extends WorkspaceTeamsView {
  workspaceId: string;
  /** Loads the next page from a cursor (`loadMoreWorkspaceTeams`,
   * `features/workspaces/actions.ts`, bound to `workspaceId`). */
  loadMore: (
    cursor: string,
  ) => Promise<{ items: WorkspaceTeamRow[]; nextCursor: string | null }>;
}

/**
 * The workspace's teams: who belongs together and what they're working on.
 *
 * A team grants no rights — it bundles people and projects so you can talk
 * about a group instead of seven names. That's why there's no role and no
 * access column here, just who's in it, what's pending, and who leads.
 */
export function WorkspaceTeams({
  rows,
  candidates,
  projects,
  assignableProjectRoles,
  canCreate,
  canUpdate,
  canDelete,
  canManageMembers,
  canManageProjects,
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

  // Creating and editing go through the same dialog: they're the same
  // fields, and a second dialog would be a second place to maintain.
  const openEditor = (team?: WorkspaceTeamRow) =>
    openModal(
      ({ close }) => (
        <TeamModal
          workspaceId={workspaceId}
          team={team}
          candidates={candidates}
          projects={projects}
          assignableProjectRoles={assignableProjectRoles}
          canManageMembers={canManageMembers}
          canManageProjects={canManageProjects}
          onDone={() => {
            setError("");
            router.refresh();
          }}
          close={close}
          sheet={isPhone}
        />
      ),
      // A bottom sheet on a phone, a dialog from a tablet up.
      isPhone ? { placement: "bottom" } : undefined,
    );

  const remove = async (row: WorkspaceTeamRow) => {
    const ok = await confirm({
      title: t("workspaceTeams.deleteTitle", { name: row.name }),
      description: t("workspaceTeams.deleteDesc", {
        count: row.members.length,
      }),
      confirmLabel: t("actions.delete"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteTeam(row.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError("");
      router.refresh();
    });
  };

  const newButton = canCreate && (
    <Button
      variant="primary"
      icon={<Icon icon="lucide:plus" width={15} />}
      onClick={() => openEditor()}
    >
      {t("actions.newTeam")}
    </Button>
  );

  // The dialog is only worth offering when it can actually change
  // something — without any of the three permissions, the row stays purely
  // informational.
  const editable = canUpdate || canManageMembers || canManageProjects;

  const columns: TableColumn<WorkspaceTeamRow>[] = [
    {
      id: "team",
      header: t("workspaceTeams.colTeam"),
      width: "minmax(0, 1fr)",
      sortValue: (row) => row.name,
      cell: (row) => (
        <span className={styles.team}>
          <span
            className={styles.dot}
            style={{ background: row.color }}
            aria-hidden
          />
          <span className={styles.identity}>
            <span className={styles.name}>{row.name}</span>
            <span className={styles.key}>{row.key}</span>
          </span>
        </span>
      ),
    },
    {
      id: "lead",
      header: t("workspaceTeams.colLead"),
      width: "minmax(150px, max-content)",
      // Teams without a lead sort to the end — the empty value handles that on its own.
      sortValue: (row) => (row.lead ? fullName(row.lead) : null),
      cell: (row) => (
        <span className={styles.lead}>
          {row.lead ? fullName(row.lead) : t("fields.none")}
        </span>
      ),
    },
    {
      id: "members",
      header: t("nav.members"),
      width: "minmax(130px, max-content)",
      sortValue: (row) => row.members.length,
      cell: (row) =>
        row.members.length === 0 ? (
          <span className={styles.empty}>{t("workspaceTeams.noMembers")}</span>
        ) : (
          <AvatarStack
            ids={row.members.map((m) => m.id)}
            users={row.members}
            size={24}
            max={5}
          />
        ),
    },
    {
      id: "projects",
      header: t("nav.projects"),
      width: "minmax(180px, max-content)",
      sortValue: (row) => row.projects.length,
      cell: (row) =>
        row.projects.length === 0 ? (
          <span className={styles.empty}>{t("workspaceTeams.noProjects")}</span>
        ) : (
          <span className={styles.projects}>
            {row.projects.slice(0, 2).map((p) => (
              <Label
                key={p.id}
                size="sm"
                color={p.color}
                title={
                  p.role
                    ? t("workspaceTeams.projectRoleHint", { role: p.role.name })
                    : t("workspaceTeams.noRole")
                }
              >
                {p.name}
              </Label>
            ))}
            {row.projects.length > 2 && (
              <span className={styles.more}>+{row.projects.length - 2}</span>
            )}
          </span>
        ),
    },
    {
      // What the team is currently carrying: open tasks in its projects.
      // The number belongs to the team only indirectly — it says how much
      // is pending there.
      id: "open",
      header: t("workspaceTeams.colOpen"),
      width: "minmax(90px, max-content)",
      align: "end",
      sortValue: (row) => row.openIssues,
      cell: (row) => (
        <span className={styles.count}>
          {row.openIssues}
          {/* A bare number under no column header: on a phone it says what it counts. */}
          <span className={styles.countLabel}>
            {t("workspaceTeams.colOpen")}
          </span>
        </span>
      ),
    },
    {
      id: "actions",
      header: "",
      width: "84px",
      align: "end",
      cell: (row) => (
        <div className={styles.rowActions}>
          {editable && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:pencil" width={15} />}
              title={t("actions.edit")}
              aria-label={t("actions.edit")}
              disabled={isPending}
              onClick={() => openEditor(row)}
            />
          )}
          {canDelete && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:trash-2" width={15} />}
              title={t("actions.delete")}
              aria-label={t("actions.delete")}
              disabled={isPending}
              onClick={() => remove(row)}
            />
          )}
        </div>
      ),
    },
  ];

  const { sort, sortRows } = useTableSort(columns);

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.teams")}
        count={items.length}
        description={t("workspaceTeams.subtitle")}
        actions={newButton}
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
          label={t("nav.teams")}
          columns={columns}
          rows={sortRows(items)}
          sort={sort}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<Icon icon="lucide:users-round" width={32} />}
              title={t("workspaceTeams.emptyTitle")}
              description={t("workspaceTeams.emptyDesc")}
              action={newButton}
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
