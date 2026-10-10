"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import {
  deleteCustomField,
  reorderCustomFields,
  setCustomFieldArchived,
} from "@/features/custom-fields/actions";
import type {
  CustomFieldResult,
  CustomFieldRow,
  CustomFieldsView,
} from "@/features/custom-fields/types";
import { useOpenCustomFieldModal } from "@/features/custom-fields/useOpenCustomFieldModal";
import styles from "./customFields.module.scss";

interface Props extends CustomFieldsView {
  workspaceId: string;
  /** Set on a project's page; the fields belong to that project. */
  projectId?: string;
  projectName?: string;
}

/**
 * Define, order, archive and delete the custom fields of one scope.
 *
 * The same component serves the workspace and the project settings. In a
 * project, the workspace's fields are listed below for reference only: they
 * apply there, but changing one would change it in every project, so that
 * happens in the workspace settings.
 *
 * The order is set by hand (up/down), not by sorting columns: it is the order
 * the fields appear in on an issue.
 */
export function CustomFields({
  own,
  inherited,
  workspaceId,
  projectId,
  projectName,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const openModal = useOpenCustomFieldModal();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const done = () => {
    setError("");
    router.refresh();
  };

  const run = (task: () => Promise<CustomFieldResult>) =>
    startTransition(async () => {
      const result = await task();
      if ("error" in result) {
        setError(t(`customFields.errors.${result.error}`));
        return;
      }
      done();
    });

  const openEditor = (field?: CustomFieldRow) =>
    openModal({ workspaceId, projectId, field, onDone: done });

  const move = (index: number, delta: -1 | 1) => {
    const ids = own.map((f) => f.id);
    const target = index + delta;
    if (target < 0 || target >= ids.length) return;
    [ids[index], ids[target]] = [ids[target], ids[index]];
    run(() => reorderCustomFields({ workspaceId, projectId, ids }));
  };

  const remove = async (field: CustomFieldRow) => {
    const ok = await confirm({
      title: t("customFields.deleteTitle", { name: field.name }),
      description: t("customFields.deleteDesc", { count: field.valueCount }),
      confirmLabel: t("actions.delete"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (!ok) return;
    run(() => deleteCustomField(field.id));
  };

  const newButton = (
    <Button
      variant="primary"
      icon={<Icon icon="lucide:plus" width={15} />}
      onClick={() => openEditor()}
    >
      {t("customFields.newField")}
    </Button>
  );

  const nameCell = (row: CustomFieldRow) => (
    <div className={styles.name}>
      <span className={styles.nameText}>{row.name}</span>
      <span className={styles.key}>{row.key}</span>
    </div>
  );
  const typeCell = (row: CustomFieldRow) => (
    <span className={styles.muted}>{t(`customFields.types.${row.type}`)}</span>
  );
  const usageCell = (row: CustomFieldRow) =>
    row.valueCount === 0 ? (
      <span className={styles.unused}>{t("customFields.unused")}</span>
    ) : (
      <span className={styles.muted}>
        {t("customFields.usage", { count: row.valueCount })}
      </span>
    );

  const ownColumns: TableColumn<CustomFieldRow>[] = [
    {
      id: "name",
      header: t("customFields.colName"),
      width: "minmax(0, 1fr)",
      cell: nameCell,
    },
    {
      id: "type",
      header: t("customFields.colType"),
      width: "minmax(120px, max-content)",
      cell: typeCell,
    },
    {
      id: "usage",
      header: t("customFields.colUsage"),
      width: "minmax(120px, max-content)",
      cell: usageCell,
    },
    {
      id: "state",
      header: "",
      width: "minmax(90px, max-content)",
      cell: (row) =>
        row.archived ? (
          <span className={styles.archived}>{t("customFields.archived")}</span>
        ) : null,
    },
    {
      id: "actions",
      header: "",
      width: "196px",
      align: "end",
      cell: (row) => {
        const index = own.findIndex((f) => f.id === row.id);
        return (
          <div className={styles.rowActions}>
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:chevron-up" width={15} />}
              title={t("customFields.moveUp")}
              aria-label={t("customFields.moveUp")}
              disabled={isPending || index === 0}
              onClick={() => move(index, -1)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:chevron-down" width={15} />}
              title={t("customFields.moveDown")}
              aria-label={t("customFields.moveDown")}
              disabled={isPending || index === own.length - 1}
              onClick={() => move(index, 1)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:pencil" width={15} />}
              title={t("actions.edit")}
              aria-label={t("actions.edit")}
              disabled={isPending}
              onClick={() => openEditor(row)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={
                <Icon
                  icon={
                    row.archived ? "lucide:archive-restore" : "lucide:archive"
                  }
                  width={15}
                />
              }
              title={
                row.archived
                  ? t("customFields.restore")
                  : t("customFields.archive")
              }
              aria-label={
                row.archived
                  ? t("customFields.restore")
                  : t("customFields.archive")
              }
              disabled={isPending}
              onClick={() =>
                run(() => setCustomFieldArchived(row.id, !row.archived))
              }
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:trash-2" width={15} />}
              title={t("actions.delete")}
              aria-label={t("actions.delete")}
              disabled={isPending}
              onClick={() => remove(row)}
            />
          </div>
        );
      },
    },
  ];

  const inheritedColumns: TableColumn<CustomFieldRow>[] = [
    {
      id: "name",
      header: t("customFields.colName"),
      width: "minmax(0, 1fr)",
      cell: nameCell,
    },
    {
      id: "type",
      header: t("customFields.colType"),
      width: "minmax(120px, max-content)",
      cell: typeCell,
    },
    {
      id: "state",
      header: "",
      width: "minmax(90px, max-content)",
      cell: (row) =>
        row.archived ? (
          <span className={styles.archived}>{t("customFields.archived")}</span>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        divider={false}
        title={t("customFields.title")}
        count={own.length}
        description={
          projectId
            ? t("customFields.subtitleProject", { project: projectName ?? "" })
            : t("customFields.subtitleWorkspace")
        }
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
          label={t("customFields.title")}
          columns={ownColumns}
          rows={own}
          getRowKey={(row) => row.id}
          empty={
            <EmptyState
              icon={<Icon icon="lucide:text-cursor-input" width={32} />}
              title={t("customFields.emptyTitle")}
              description={t("customFields.emptyDesc")}
              action={newButton}
            />
          }
        />

        {inherited.length > 0 && (
          <section className={styles.group}>
            <h2 className={styles.groupTitle}>
              {t("customFields.inheritedTitle")}
            </h2>
            <p className={styles.groupDesc}>
              {t("customFields.inheritedDesc")}
            </p>
            <Table
              variant="card"
              label={t("customFields.inheritedTitle")}
              columns={inheritedColumns}
              rows={inherited}
              getRowKey={(row) => row.id}
            />
          </section>
        )}
      </div>
    </>
  );
}
