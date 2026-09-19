"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { Label } from "@/components/ui/atoms/Label/Label";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { LoadMoreSentinel } from "@/components/ui/layout/Table/LoadMoreSentinel/LoadMoreSentinel";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import { useInfiniteScroll } from "@/components/ui/layout/Table/useInfiniteScroll";
import { useTableSort } from "@/components/ui/layout/Table/useTableSort";
import { deleteLabel } from "@/features/issues/actions";
import { useOpenLabelModal } from "@/features/issues/useOpenLabelModal";
import type {
  WorkspaceLabelRow,
  WorkspaceLabelsView,
} from "@/features/workspaces/types";
import { Link } from "@/i18n/navigation";
import { projectSettingsPath } from "@/lib/nav";
import styles from "./workspaceLabels.module.scss";

type LoadMoreLabels = (
  cursor: string,
) => Promise<{ items: WorkspaceLabelRow[]; nextCursor: string | null }>;

interface Props extends WorkspaceLabelsView {
  workspaceId: string;
  /** Loads the next page of the workspace's own labels (`loadMoreWorkspaceLabels`,
   * `features/workspaces/actions.ts`, bound to `workspaceId`). */
  loadMoreOwn: LoadMoreLabels;
  /** Mirror image of `loadMoreOwn`, for the inherited project labels
   * (`loadMoreWorkspaceProjectLabels`). */
  loadMoreFromProjects: LoadMoreLabels;
}

/**
 * The workspace's labels, in two lists.
 *
 * On top, what applies everywhere and can be changed here. Below, what
 * belongs to individual projects: the same columns, but without buttons —
 * renaming from here would bleed into a project this page doesn't even
 * mean. The row therefore leads to wherever the label actually belongs.
 *
 * The counterpart to `ProjectLabels`, one level up: there, the inherited
 * list is displayed and hidden; here, it's maintained.
 */
export function WorkspaceLabels({
  own,
  fromProjects,
  canCreate,
  canUpdate,
  canDelete,
  workspaceId,
  ownNextCursor,
  fromProjectsNextCursor,
  loadMoreOwn,
  loadMoreFromProjects,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const openLabelModal = useOpenLabelModal();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const ownScroll = useInfiniteScroll({
    initialItems: own,
    initialCursor: ownNextCursor,
    loadMore: loadMoreOwn,
  });
  const fromProjectsScroll = useInfiniteScroll({
    initialItems: fromProjects,
    initialCursor: fromProjectsNextCursor,
    loadMore: loadMoreFromProjects,
  });

  const openEditor = (label?: WorkspaceLabelRow) =>
    openLabelModal({
      workspaceId,
      label,
      onDone: () => {
        setError("");
        router.refresh();
      },
    });
  const remove = async (row: WorkspaceLabelRow) => {
    // A workspace label is attached to tasks across multiple projects. The
    // number in the confirmation dialog is the total across all of them —
    // it says what would be lost here.
    const ok = await confirm({
      title: t("projectLabels.deleteTitle", { name: row.name }),
      description: t("workspaceLabels.deleteDesc", { count: row.issueCount }),
      confirmLabel: t("actions.delete"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await deleteLabel(row.id);
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
      {t("projectLabels.newLabel")}
    </Button>
  );

  const labelCell = (row: WorkspaceLabelRow) => (
    <Label color={row.color} filled>
      {row.name}
    </Label>
  );

  const usageCell = (row: WorkspaceLabelRow) =>
    row.issueCount === 0 ? (
      <span className={styles.unused}>{t("projectLabels.unused")}</span>
    ) : (
      <span className={styles.usage}>
        {t("projectLabels.usage", { count: row.issueCount })}
      </span>
    );

  const ownColumns: TableColumn<WorkspaceLabelRow>[] = [
    {
      id: "label",
      header: t("projectLabels.colLabel"),
      width: "minmax(0, 1fr)",
      sortValue: (row) => row.name,
      cell: labelCell,
    },
    {
      id: "usage",
      header: t("projectLabels.colUsage"),
      width: "minmax(120px, max-content)",
      sortValue: (row) => row.issueCount,
      cell: usageCell,
    },
    {
      // A project is allowed to hide a workspace label for itself. That
      // this happens belongs here: it explains why a label is missing
      // elsewhere without anyone having deleted it.
      id: "hidden",
      header: t("workspaceLabels.colHidden"),
      width: "minmax(140px, max-content)",
      sortValue: (row) => row.hiddenIn,
      cell: (row) =>
        row.hiddenIn === 0 ? (
          <span className={styles.unused}>{t("workspaceLabels.nowhere")}</span>
        ) : (
          <span className={styles.usage}>
            {t("workspaceLabels.hiddenIn", { count: row.hiddenIn })}
          </span>
        ),
    },
    ...(canUpdate || canDelete
      ? [
          {
            id: "actions",
            header: "",
            width: "84px",
            align: "end" as const,
            cell: (row: WorkspaceLabelRow) => (
              <div className={styles.rowActions}>
                {canUpdate && (
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
        ]
      : []),
  ];

  const projectColumns: TableColumn<WorkspaceLabelRow>[] = [
    {
      id: "label",
      header: t("projectLabels.colLabel"),
      width: "minmax(0, 1fr)",
      sortValue: (row) => row.name,
      cell: labelCell,
    },
    {
      id: "project",
      header: t("fields.project"),
      width: "minmax(160px, max-content)",
      sortValue: (row) => row.projectName,
      cell: (row) => <span className={styles.owner}>{row.projectName}</span>,
    },
    {
      id: "usage",
      header: t("projectLabels.colUsage"),
      width: "minmax(120px, max-content)",
      sortValue: (row) => row.issueCount,
      cell: usageCell,
    },
  ];

  // Two lists, two sort states — the inherited project labels are a
  // separate table and shouldn't sort along with the other one.
  const ownSort = useTableSort(ownColumns);
  const projectSort = useTableSort(projectColumns);

  // Which labels the list shows: the workspace's own, or those of its projects.
  const [scope, setScope] = useState<"workspace" | "projects">("workspace");
  const hasProjectLabels = fromProjectsScroll.items.length > 0;
  const showProjects = hasProjectLabels && scope === "projects";

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.labels")}
        count={ownScroll.items.length}
        description={t("workspaceLabels.subtitle")}
        actions={newButton}
      />

      <div className={styles.content}>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}

        {hasProjectLabels && (
          <div className={styles.scopeSwitch}>
            <SegmentedControl
              variant="surface"
              value={scope}
              onChange={(value) => setScope(value as "workspace" | "projects")}
              items={[
                {
                  value: "workspace",
                  label: t("settings.scopeWorkspace"),
                  icon: <Icon icon="lucide:tag" width={15} />,
                },
                {
                  value: "projects",
                  label: t("nav.projects"),
                  icon: <Icon icon="lucide:folders" width={15} />,
                },
              ]}
            />
          </div>
        )}

        {!showProjects && (
          <Table
            fill
            variant="card"
            label={t("nav.labels")}
            columns={ownColumns}
            rows={ownSort.sortRows(ownScroll.items)}
            sort={ownSort.sort}
            getRowKey={(row) => row.id}
            empty={
              <EmptyState
                icon={<Icon icon="lucide:tag" width={32} />}
                title={t("workspaceLabels.emptyTitle")}
                description={t("workspaceLabels.emptyDesc")}
                action={newButton}
              />
            }
            footer={
              ownScroll.cursor && (
                <LoadMoreSentinel
                  ref={ownScroll.sentinelRef}
                  loading={ownScroll.loading}
                />
              )
            }
          />
        )}

        {showProjects && (
          <section className={styles.group}>
            <p className={styles.groupDesc}>
              {t("workspaceLabels.fromProjectsDesc")}
            </p>

            <Table
              fill
              variant="card"
              label={t("workspaceLabels.fromProjectsTitle")}
              columns={projectColumns}
              rows={projectSort.sortRows(fromProjectsScroll.items)}
              sort={projectSort.sort}
              getRowKey={(row) => row.id}
              // A project label is changed wherever it belongs — the row
              // takes you there instead of just claiming the path exists.
              rowOverlay={(row) =>
                row.projectSlug ? (
                  <Link
                    href={projectSettingsPath(
                      workspaceId,
                      row.projectSlug,
                      "labels",
                    )}
                    aria-label={row.name}
                  />
                ) : null
              }
              footer={
                fromProjectsScroll.cursor && (
                  <LoadMoreSentinel
                    ref={fromProjectsScroll.sentinelRef}
                    loading={fromProjectsScroll.loading}
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
