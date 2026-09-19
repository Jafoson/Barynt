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
import { deleteLabel, setLabelHidden } from "@/features/issues/actions";
import { useOpenLabelModal } from "@/features/issues/useOpenLabelModal";
import type {
  ProjectLabelRow,
  ProjectLabelsView,
} from "@/features/projects/types";
import styles from "./projectLabels.module.scss";

type LoadMoreLabels = (
  cursor: string,
) => Promise<{ items: ProjectLabelRow[]; nextCursor: string | null }>;

interface Props extends ProjectLabelsView {
  projectId: string;
  projectName: string;
  workspaceId: string;
  /** Loads the next page of the project's own labels (`loadMoreProjectLabels`,
   * `features/projects/actions.ts`, bound to `projectId`). */
  loadMoreOwn: LoadMoreLabels;
  /** Mirror image of `loadMoreOwn`, for the inherited workspace labels
   * (`loadMoreProjectInheritedLabels`). */
  loadMoreInherited: LoadMoreLabels;
}

/**
 * A project's labels, in two lists.
 *
 * On top, what belongs to the project and can be changed here. Below, what
 * the workspace dictates: the same columns, but without buttons. Together
 * they make up everything selectable on an issue in this project — leaving
 * out the second list would mean hiding half of it.
 */
export function ProjectLabels({
  projectId,
  projectName,
  workspaceId,
  own,
  inherited,
  canCreate,
  canUpdate,
  canDelete,
  ownNextCursor,
  inheritedNextCursor,
  loadMoreOwn,
  loadMoreInherited,
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
  const inheritedScroll = useInfiniteScroll({
    initialItems: inherited,
    initialCursor: inheritedNextCursor,
    loadMore: loadMoreInherited,
  });

  const openEditor = (label?: ProjectLabelRow) =>
    openLabelModal({
      workspaceId,
      projectId,
      label,
      onDone: () => {
        setError("");
        router.refresh();
      },
    });
  const remove = async (row: ProjectLabelRow) => {
    // Deleting a label also removes it from the issues it's attached to.
    // That's why the count appears in the confirmation dialog: it's the
    // difference between "cleaning up" and "losing an organization scheme".
    const ok = await confirm({
      title: t("projectLabels.deleteTitle", { name: row.name }),
      description: t("projectLabels.deleteDesc", { count: row.issueCount }),
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

  // Hiding is low-stakes enough for a click without confirmation: the label
  // stays with the workspace, tasks keep it, and the same button brings it
  // back. That's why there's no confirmation dialog here like on delete.
  const toggleHidden = (row: ProjectLabelRow) =>
    startTransition(async () => {
      const result = await setLabelHidden(projectId, row.id, !row.hidden);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError("");
      router.refresh();
    });

  const newButton = canCreate && (
    <Button
      variant="primary"
      icon={<Icon icon="lucide:plus" width={15} />}
      onClick={() => openEditor()}
    >
      {t("projectLabels.newLabel")}
    </Button>
  );

  // A hidden label stays readable but recedes — and says so explicitly: the
  // faded color alone wouldn't be informative on its own.
  const labelCell = (row: ProjectLabelRow) =>
    row.hidden ? (
      <>
        <span className={styles.hiddenLabel}>
          <Label color={row.color} filled>
            {row.name}
          </Label>
        </span>
        <span className={styles.hiddenNote}>{t("projectLabels.hidden")}</span>
      </>
    ) : (
      <Label color={row.color} filled>
        {row.name}
      </Label>
    );

  const usageCell = (row: ProjectLabelRow) =>
    row.issueCount === 0 ? (
      <span className={styles.unused}>{t("projectLabels.unused")}</span>
    ) : (
      <span className={styles.usage}>
        {t("projectLabels.usage", { count: row.issueCount })}
      </span>
    );

  // An actions column is only created when there's actually something to do
  // in it — an empty column would be a promise the rows can't fulfill.
  const columns = (
    actions?: (row: ProjectLabelRow) => React.ReactNode,
  ): TableColumn<ProjectLabelRow>[] => [
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
    ...(actions
      ? [
          {
            id: "actions",
            header: "",
            width: "84px",
            align: "end" as const,
            cell: (row: ProjectLabelRow) => (
              <div className={styles.rowActions}>{actions(row)}</div>
            ),
          },
        ]
      : []),
  ];

  const ownActions = (row: ProjectLabelRow) => (
    <>
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
    </>
  );

  // The eye icon shows the row's state: crossed-out means "is hidden", open
  // means "is offered". What a click does to it is in the tooltip — and
  // what currently applies is also spelled out as a word next to the label.
  const inheritedActions = (row: ProjectLabelRow) => (
    <Button
      variant="ghost"
      size="sm"
      icon={
        <Icon icon={row.hidden ? "lucide:eye-off" : "lucide:eye"} width={15} />
      }
      title={t(row.hidden ? "projectLabels.show" : "projectLabels.hide")}
      aria-label={t(row.hidden ? "projectLabels.show" : "projectLabels.hide")}
      disabled={isPending}
      onClick={() => toggleHidden(row)}
    />
  );

  // Two tables, two sort states: the project's own labels and the inherited
  // ones are separate lists and should be sortable separately too.
  const ownColumns = columns(canUpdate || canDelete ? ownActions : undefined);
  const inheritedColumns = columns(canUpdate ? inheritedActions : undefined);
  const ownSort = useTableSort(ownColumns);
  const inheritedSort = useTableSort(inheritedColumns);

  // Which labels the list shows: the project's own, or those it inherits from
  // the workspace.
  const [scope, setScope] = useState<"project" | "workspace">("project");
  const hasInherited = inheritedScroll.items.length > 0;
  const showInherited = hasInherited && scope === "workspace";

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.labels")}
        count={ownScroll.items.length}
        description={t("projectLabels.subtitle", { project: projectName })}
        actions={newButton}
      />

      <div className={styles.content}>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}

        {hasInherited && (
          <div className={styles.scopeSwitch}>
            <SegmentedControl
              variant="surface"
              value={scope}
              onChange={(value) => setScope(value as "project" | "workspace")}
              items={[
                {
                  value: "project",
                  label: t("settings.scopeProject"),
                  icon: <Icon icon="lucide:folders" width={15} />,
                },
                {
                  value: "workspace",
                  label: t("settings.scopeWorkspace"),
                  icon: <Icon icon="lucide:building-2" width={15} />,
                },
              ]}
            />
          </div>
        )}

        {!showInherited && (
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
                title={t("projectLabels.emptyTitle")}
                description={t("projectLabels.emptyDesc")}
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

        {showInherited && (
          <section className={styles.inherited}>
            <Table
              fill
              variant="card"
              label={t("projectLabels.inheritedTitle")}
              columns={inheritedColumns}
              rows={inheritedSort.sortRows(inheritedScroll.items)}
              sort={inheritedSort.sort}
              getRowKey={(row) => row.id}
              footer={
                inheritedScroll.cursor && (
                  <LoadMoreSentinel
                    ref={inheritedScroll.sentinelRef}
                    loading={inheritedScroll.loading}
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
