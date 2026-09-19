"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Avatar, AvatarStack } from "@/components/ui/atoms/Avatar/Avatar";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { LoadMoreSentinel } from "@/components/ui/layout/Table/LoadMoreSentinel/LoadMoreSentinel";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import { useInfiniteScroll } from "@/components/ui/layout/Table/useInfiniteScroll";
import { useTableSort } from "@/components/ui/layout/Table/useTableSort";
import { deleteProject } from "@/features/projects/actions";
import { useOpenCreateProject } from "@/features/projects/useOpenCreateProject";
import type {
  WorkspaceProjectRow,
  WorkspaceProjectsView,
} from "@/features/workspaces/types";
import { Link } from "@/i18n/navigation";
import { useModal } from "@/lib/context";
import { projectPath } from "@/lib/nav";
import { EditProjectModal } from "./components/EditProjectModal";
import styles from "./workspaceProjects.module.scss";

type LoadMoreProjects = (
  cursor: string,
) => Promise<{ items: WorkspaceProjectRow[]; nextCursor: string | null }>;

interface Props extends WorkspaceProjectsView {
  workspaceId: string;
  /** Loads the next page of the single list (without `seesAllProjects`),
   * `loadMoreWorkspaceProjects` in `features/workspaces/actions.ts`. */
  loadMore: LoadMoreProjects;
  /** Loads the next page of public projects (under `seesAllProjects`). */
  loadMorePublic: LoadMoreProjects;
  /** Loads the next page of private projects (under `seesAllProjects`). */
  loadMorePrivate: LoadMoreProjects;
}

/**
 * All of the workspace's projects in one list — with what can be changed
 * about them from here.
 *
 * The row leads into the project; changes happen in the dialog next to it.
 * The two belong together: whoever opens the overview mostly wants to
 * check on things, not restructure them, and a field that takes effect
 * while typing would be one accident too many in a list of twenty rows.
 *
 * `canUpdate` and `canDelete` sit on each row, not on the page: both
 * permissions apply at the project level. Whoever leads one sees their
 * buttons exactly there — and none on the remaining rows.
 *
 * Whoever sees every project in the workspace (`seesAllProjects`) gets them
 * in two sections: public and private, each with its own heading, its own
 * intro text, and its own table. The same structure as on the labels page —
 * there, the workspace's own labels sit above the inherited ones. Two lists
 * with a sentence attached say more than one list with a "Visibility"
 * column: they also explain what the difference means. The column is
 * dropped in exchange.
 *
 * For everyone else, it stays a single list with that column: they only
 * ever see their own slice anyway, and a "Private" heading over three of
 * twelve projects would be misleading.
 */
export function WorkspaceProjects({
  rows,
  publicRows,
  privateRows,
  canCreate,
  seesAllProjects,
  workspaceId,
  nextCursor,
  publicNextCursor,
  privateNextCursor,
  loadMore,
  loadMorePublic,
  loadMorePrivate,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const { openModal } = useModal();
  const openCreateProject = useOpenCreateProject();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  // Always all three — which one actually displays anything is decided
  // only by the render below (`seesAllProjects`). Hooks can't be called
  // conditionally.
  const singleScroll = useInfiniteScroll({
    initialItems: rows,
    initialCursor: nextCursor,
    loadMore,
  });
  const publicScroll = useInfiniteScroll({
    initialItems: publicRows,
    initialCursor: publicNextCursor,
    loadMore: loadMorePublic,
  });
  const privateScroll = useInfiniteScroll({
    initialItems: privateRows,
    initialCursor: privateNextCursor,
    loadMore: loadMorePrivate,
  });

  const done = () => {
    setError("");
    router.refresh();
  };

  const openCreate = () => openCreateProject(workspaceId);

  const openEdit = (row: WorkspaceProjectRow) =>
    openModal(({ close }) => (
      <EditProjectModal project={row} onDone={done} close={close} />
    ));

  const remove = async (row: WorkspaceProjectRow) => {
    // The count appears in the confirmation dialog because it makes the
    // difference: deleting an empty project is cleaning up, deleting a
    // full one is a loss.
    const ok = await confirm({
      title: t("workspaceProjects.deleteTitle", { name: row.name }),
      description: t("projectSettings.deleteDesc", { count: row.issueCount }),
      confirmLabel: t("actions.delete"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteProject(row.id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      done();
    });
  };

  const newButton = canCreate && (
    <Button
      variant="primary"
      icon={<Icon icon="lucide:plus" width={15} />}
      onClick={openCreate}
    >
      {t("actions.newProject")}
    </Button>
  );

  const columns: TableColumn<WorkspaceProjectRow>[] = [
    {
      id: "project",
      header: t("fields.project"),
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
            size={28}
          />
          <span className={styles.name}>{row.name}</span>
          <span className={styles.prefix}>{row.prefix}</span>
        </span>
      ),
    },
    // When grouped, visibility already sits in the section heading —
    // saying the same thing twice in one row would only be wider, not clearer.
    ...(seesAllProjects
      ? []
      : [
          {
            id: "visibility",
            header: t("projectSettings.visibility"),
            width: "minmax(110px, max-content)",
            sortValue: (row: WorkspaceProjectRow) => row.visibility,
            cell: (row: WorkspaceProjectRow) => (
              <Badge mono={false}>
                {row.visibility === "public"
                  ? t("projectSettings.public")
                  : t("projectSettings.private")}
              </Badge>
            ),
          },
        ]),
    {
      id: "members",
      header: t("nav.members"),
      width: "minmax(140px, max-content)",
      align: "end",
      sortValue: (row) => row.memberCount,
      // Faces and count: the stack answers "who's in there", the number
      // answers "how many". The stack shows the first four, so the total
      // sits next to it instead of as a "+n" inside it.
      cell: (row) => (
        <span className={styles.members}>
          {row.members.length > 0 && (
            <AvatarStack
              ids={row.members.map((member) => member.id)}
              users={row.members}
              size={22}
              max={4}
            />
          )}
          <span className={styles.count}>{row.memberCount}</span>
        </span>
      ),
    },
    {
      id: "issues",
      header: t("nav.issues"),
      width: "minmax(90px, max-content)",
      align: "end",
      sortValue: (row) => row.issueCount,
      cell: (row) => (
        <span className={styles.count}>
          {row.issueCount}
          <span className={styles.countLabel}>{t("nav.issues")}</span>
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
          {row.canUpdate && (
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:pencil" width={15} />}
              title={t("actions.edit")}
              aria-label={t("actions.edit")}
              disabled={isPending}
              onClick={() => openEdit(row)}
            />
          )}
          {row.canDelete && (
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

  // Three sort states for three possible tables — as with the labels: the
  // lists sit side by side and should each be sortable on their own.
  const singleSort = useTableSort(columns);
  const publicSort = useTableSort(columns);
  const privateSort = useTableSort(columns);

  // The row leads into the project — as a link, so keyboard, middle-click,
  // and "open in new tab" all keep working. All tables use the same one.
  const rowOverlay = (row: WorkspaceProjectRow) => (
    <Link href={projectPath(workspaceId, row.slug, "")} aria-label={row.name} />
  );

  const totalCount = seesAllProjects
    ? publicScroll.items.length + privateScroll.items.length
    : singleScroll.items.length;

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.projects")}
        count={totalCount}
        description={t("workspaceProjects.subtitle")}
        actions={newButton}
      />

      <div className={styles.content}>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}

        {/* If there's no project at all, a single table remains — the
            empty state belongs to it, and two headings over nothing would
            be two too many. */}
        {totalCount === 0 ? (
          <Table
            variant="card"
            label={t("nav.projects")}
            columns={columns}
            rows={[]}
            getRowKey={(row) => row.id}
            empty={
              <EmptyState
                icon={<Icon icon="lucide:folders" width={32} />}
                title={t("workspaceProjects.emptyTitle")}
                description={t("workspaceProjects.emptyDesc")}
                action={newButton}
              />
            }
          />
        ) : seesAllProjects ? (
          <>
            {/* Public first: that's the normal case for a workspace and
                the longer list. An empty half is dropped — a heading with
                no rows underneath would assert a split that doesn't
                currently exist. */}
            {publicScroll.items.length > 0 && (
              <section className={styles.group}>
                {/* The lock or the globe icon is there because "private"
                    is a state, not a title. */}
                <h2 className={styles.groupTitle}>
                  <Icon
                    icon="lucide:globe"
                    width={15}
                    className={styles.groupIcon}
                    aria-hidden
                  />
                  {t("workspaceProjects.publicGroup")}
                  <span className={styles.groupCount}>
                    {publicScroll.items.length}
                  </span>
                </h2>
                <p className={styles.groupDesc}>
                  {t("workspaceProjects.publicDesc")}
                </p>

                <Table
                  fill
                  variant="card"
                  label={t("workspaceProjects.publicGroup")}
                  columns={columns}
                  rows={publicSort.sortRows(publicScroll.items)}
                  sort={publicSort.sort}
                  getRowKey={(row) => row.id}
                  rowOverlay={rowOverlay}
                  footer={
                    publicScroll.cursor && (
                      <LoadMoreSentinel
                        ref={publicScroll.sentinelRef}
                        loading={publicScroll.loading}
                      />
                    )
                  }
                />
              </section>
            )}

            {privateScroll.items.length > 0 && (
              <section className={styles.group}>
                <h2 className={styles.groupTitle}>
                  <Icon
                    icon="lucide:lock"
                    width={15}
                    className={styles.groupIcon}
                    aria-hidden
                  />
                  {t("workspaceProjects.privateGroup")}
                  <span className={styles.groupCount}>
                    {privateScroll.items.length}
                  </span>
                </h2>
                <p className={styles.groupDesc}>
                  {t("workspaceProjects.privateDesc")}
                </p>

                <Table
                  fill
                  variant="card"
                  label={t("workspaceProjects.privateGroup")}
                  columns={columns}
                  rows={privateSort.sortRows(privateScroll.items)}
                  sort={privateSort.sort}
                  getRowKey={(row) => row.id}
                  rowOverlay={rowOverlay}
                  footer={
                    privateScroll.cursor && (
                      <LoadMoreSentinel
                        ref={privateScroll.sentinelRef}
                        loading={privateScroll.loading}
                      />
                    )
                  }
                />
              </section>
            )}
          </>
        ) : (
          // Without a split, it stays the single list it was before: no
          // heading, no intro.
          <section className={styles.group}>
            <Table
              fill
              variant="card"
              label={t("nav.projects")}
              columns={columns}
              rows={singleSort.sortRows(singleScroll.items)}
              sort={singleSort.sort}
              getRowKey={(row) => row.id}
              rowOverlay={rowOverlay}
              footer={
                singleScroll.cursor && (
                  <LoadMoreSentinel
                    ref={singleScroll.sentinelRef}
                    loading={singleScroll.loading}
                  />
                )
              }
            />
          </section>
        )}
      </div>
    </>
  );
}
