"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { UserCell } from "@/components/ui/atoms/UserCell/UserCell";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { LoadMoreSentinel } from "@/components/ui/layout/Table/LoadMoreSentinel/LoadMoreSentinel";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import { useInfiniteScroll } from "@/components/ui/layout/Table/useInfiniteScroll";
import { useTableSort } from "@/components/ui/layout/Table/useTableSort";
import { NewProjectButton } from "@/features/projects/components/NewProjectButton/NewProjectButton";
import type { ProjectOverviewRow } from "@/features/projects/queries";
import { Link } from "@/i18n/navigation";
import { projectPath } from "@/lib/nav";
import { fullName } from "@/lib/utils/string";
import styles from "./projectOverview.module.scss";

interface Props {
  rows: ProjectOverviewRow[];
  canCreate: boolean;
  workspaceId: string;
  nextCursor: string | null;
  /** Loads the next page from a cursor (`loadMoreProjectsOverview`,
   * `features/projects/actions.ts`, bound to `workspaceId`). */
  loadMore: (
    cursor: string,
  ) => Promise<{ items: ProjectOverviewRow[]; nextCursor: string | null }>;
}

/**
 * All the projects you're allowed to see, in one list.
 *
 * An overview, not management: one table instead of two sections split by
 * visibility, and only the four pieces of info you look for when searching
 * for a project — name, what it's for, who leads it, under which prefix its
 * tasks run. Whether it's private plays no role here: whatever is in the
 * list is fine to see anyway.
 *
 * Editing and deleting happen one level over, in
 * `features/workspaces/components/WorkspaceProjects` — that's where the pen
 * and trash icons live, and the numbers too. The row here simply leads into
 * the project.
 */
export function ProjectOverview({
  rows,
  canCreate,
  workspaceId,
  nextCursor,
  loadMore,
}: Props) {
  const t = useTranslations();

  const { items, cursor, loading, sentinelRef } = useInfiniteScroll({
    initialItems: rows,
    initialCursor: nextCursor,
    loadMore,
  });

  // On a phone or tablet the floating plus (`NewIssueFab`) creates projects
  // here, so the button itself is hidden by CSS.
  const newButton = canCreate && (
    <span className={styles.newButton}>
      <NewProjectButton workspaceId={workspaceId} />
    </span>
  );

  const columns: TableColumn<ProjectOverviewRow>[] = [
    {
      id: "project",
      header: t("fields.project"),
      width: "minmax(160px, max-content)",
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
          <span className={styles.name}>{row.name}</span>
        </span>
      ),
    },
    {
      id: "desc",
      header: t("fields.description"),
      // The description gets the remaining width and is truncated: a list
      // where every row is the same height is easier to skim than one where
      // a long sentence gets three lines.
      width: "minmax(0, 1fr)",
      sortValue: (row) => row.desc,
      cell: (row) =>
        row.desc ? (
          <span className={styles.desc} title={row.desc}>
            {row.desc}
          </span>
        ) : null,
    },
    {
      id: "lead",
      header: t("fields.lead"),
      width: "minmax(170px, max-content)",
      // Without a lead, sorts to the bottom: the column's question is "who",
      // and "nobody" is the weakest answer to that.
      sortValue: (row) => (row.lead ? fullName(row.lead) : "￿"),
      cell: (row) =>
        row.lead ? (
          <UserCell
            avatar={row.lead}
            name={fullName(row.lead)}
            size={26}
            trailing={
              row.moreLeads > 0 && (
                <span className={styles.moreLeads}>+{row.moreLeads}</span>
              )
            }
          />
        ) : (
          <span className={styles.noLead}>{t("projects.noLead")}</span>
        ),
    },
    {
      id: "prefix",
      header: t("fields.prefix"),
      width: "minmax(90px, max-content)",
      align: "end",
      sortValue: (row) => row.prefix,
      cell: (row) => <span className={styles.prefix}>{row.prefix}</span>,
    },
  ];

  const { sort, sortRows } = useTableSort(columns);

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.projects")}
        count={items.length}
        description={t("projects.subtitle")}
        actions={newButton}
      />

      <div className={styles.content}>
        <Table
          fill
          variant="card"
          label={t("nav.projects")}
          columns={columns}
          rows={sortRows(items)}
          sort={sort}
          getRowKey={(row) => row.id}
          // The row leads into the project — as a link, so keyboard,
          // middle-click, and "open in new tab" all keep working.
          rowOverlay={(row) => (
            <Link
              href={projectPath(workspaceId, row.slug, "")}
              aria-label={row.name}
            />
          )}
          empty={
            <EmptyState
              icon={<Icon icon="lucide:folders" width={32} />}
              title={t("workspaceProjects.emptyTitle")}
              description={t("workspaceProjects.emptyDesc")}
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
