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
  setCustomFieldArchived,
} from "@/features/custom-fields/actions";
import type {
  CustomFieldManageRow,
  CustomFieldRow,
  CustomFieldsView,
} from "@/features/custom-fields/types";
import { useOpenCustomFieldModal } from "@/features/custom-fields/useOpenCustomFieldModal";
import {
  CUSTOM_FIELD_TYPE_ICONS,
  MAX_CUSTOM_FIELDS_PER_WORKSPACE,
} from "@/lib/custom-fields/types";
import styles from "./customFields.module.scss";

interface Props {
  view: CustomFieldsView;
  /**
   * Inside another page (a project's Fields, under the switches of the built-in fields): a heading
   * of its own with the button, instead of the page's header.
   */
  embedded?: boolean;
}

/**
 * The custom fields of a workspace or of a project: what is asked of every issue there, next to
 * what an issue has anyway.
 *
 * A field is **archived** before it is deleted: an archived field is out of the way (no longer on
 * an issue, no longer offered) but keeps its answers, so bringing it back loses nothing. Deleting
 * one takes its answers with it, which the confirmation says in numbers. A workspace's field shows
 * on a project's page as well, read only: it is changed where it belongs.
 */
export function CustomFields({ view, embedded = false }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const openModal = useOpenCustomFieldModal();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const scope = view.projectId
    ? { projectId: view.projectId }
    : { workspaceId: view.workspaceId };
  const active = view.fields.filter((field) => !field.archived);
  const archived = view.fields.filter((field) => field.archived);
  const full = view.room <= 0;

  const done = () => {
    setError("");
    router.refresh();
  };
  const open = (field?: CustomFieldManageRow) =>
    openModal({ scope, field, onDone: done });

  const run = (work: () => ReturnType<typeof deleteCustomField>) =>
    startTransition(async () => {
      const result = await work();
      if ("error" in result) {
        setError(result.error);
        return;
      }
      done();
    });

  const archive = (row: CustomFieldManageRow, on: boolean) =>
    run(() => setCustomFieldArchived(row.id, on));

  const remove = async (row: CustomFieldManageRow) => {
    const ok = await confirm({
      title: t("customFields.deleteTitle", { name: row.name }),
      description: t("customFields.deleteDesc", { count: row.valueCount }),
      confirmLabel: t("actions.delete"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (!ok) return;
    run(() => deleteCustomField(row.id));
  };

  const newButton = view.canManage && (
    <Button
      variant="primary"
      icon={<Icon icon="lucide:plus" width={15} />}
      disabled={full}
      title={
        full
          ? t("customFields.limit", { limit: MAX_CUSTOM_FIELDS_PER_WORKSPACE })
          : undefined
      }
      onClick={() => open()}
    >
      {t("customFields.newField")}
    </Button>
  );

  const nameCell = (row: CustomFieldRow) => (
    <div className={styles.name}>
      <span className={styles.title}>{row.name}</span>
      {row.description && (
        <span className={styles.desc}>{row.description}</span>
      )}
    </div>
  );
  const typeCell = (row: CustomFieldRow) => (
    <span className={styles.type}>
      <Icon icon={CUSTOM_FIELD_TYPE_ICONS[row.type]} width={15} />
      {t(`customFields.types.${row.type}`)}
    </span>
  );
  const keyCell = (row: CustomFieldRow) => (
    <code className={styles.key}>{row.key}</code>
  );

  const ownColumns = (
    isArchived: boolean,
  ): TableColumn<CustomFieldManageRow>[] => [
    {
      id: "name",
      header: t("customFields.colName"),
      width: "minmax(0, 1fr)",
      sortValue: (row) => row.name,
      cell: nameCell,
    },
    {
      id: "type",
      header: t("customFields.colType"),
      width: "minmax(120px, max-content)",
      sortValue: (row) => row.type,
      cell: typeCell,
    },
    {
      id: "key",
      header: t("customFields.colKey"),
      width: "minmax(120px, max-content)",
      sortValue: (row) => row.key,
      cell: keyCell,
    },
    {
      id: "answers",
      header: t("customFields.colAnswers"),
      width: "minmax(100px, max-content)",
      sortValue: (row) => row.valueCount,
      cell: (row) =>
        row.valueCount === 0 ? (
          <span className={styles.unused}>{t("customFields.unused")}</span>
        ) : (
          <span className={styles.usage}>
            {t("customFields.answers", { count: row.valueCount })}
          </span>
        ),
    },
    ...(view.canManage
      ? [
          {
            id: "actions",
            header: "",
            width: "112px",
            align: "end" as const,
            cell: (row: CustomFieldManageRow) =>
              row.pluginId ? (
                <span
                  className={styles.plugin}
                  title={t("customFields.pluginOwned")}
                >
                  <Icon icon="lucide:puzzle" width={15} />
                  {t("customFields.plugin")}
                </span>
              ) : (
                <div className={styles.rowActions}>
                  {!isArchived && (
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={<Icon icon="lucide:pencil" width={15} />}
                      title={t("actions.edit")}
                      aria-label={t("actions.edit")}
                      disabled={isPending}
                      onClick={() => open(row)}
                    />
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    icon={
                      <Icon
                        icon={
                          isArchived
                            ? "lucide:archive-restore"
                            : "lucide:archive"
                        }
                        width={15}
                      />
                    }
                    title={
                      isArchived
                        ? t("customFields.restore")
                        : t("customFields.archive")
                    }
                    aria-label={
                      isArchived
                        ? t("customFields.restore")
                        : t("customFields.archive")
                    }
                    disabled={isPending}
                    onClick={() => archive(row, !isArchived)}
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
              ),
          },
        ]
      : []),
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
      id: "key",
      header: t("customFields.colKey"),
      width: "minmax(120px, max-content)",
      cell: keyCell,
    },
  ];

  const intro = t(
    view.level === "workspace"
      ? "customFields.workspaceIntro"
      : "customFields.projectIntro",
  );

  const header = embedded ? (
    <div className={styles.embeddedHeader}>
      <div>
        <h2 className={styles.heading}>{t("customFields.title")}</h2>
        <p className={styles.intro}>{intro}</p>
      </div>
      {newButton}
    </div>
  ) : (
    <PageHeader
      divider={false}
      title={t("nav.fields")}
      count={active.length}
      description={intro}
      actions={newButton}
    />
  );

  const activeTable = (
    <Table
      variant="card"
      label={t("customFields.title")}
      columns={ownColumns(false)}
      rows={active}
      getRowKey={(row) => row.id}
      empty={
        <EmptyState
          icon={<Icon icon="lucide:layout-list" width={32} />}
          title={t("customFields.emptyTitle")}
          description={t(
            view.canManage
              ? "customFields.emptyDesc"
              : "customFields.emptyReadOnly",
          )}
          action={newButton}
        />
      }
    />
  );

  return (
    <>
      {!embedded && header}
      <div className={embedded ? styles.embedded : styles.content}>
        {embedded && header}
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}

        {view.canManage && full && (
          <p className={styles.note}>
            {t("customFields.limit", {
              limit: MAX_CUSTOM_FIELDS_PER_WORKSPACE,
            })}
          </p>
        )}

        {activeTable}

        {view.inherited.length > 0 && (
          <section className={styles.group}>
            <h3 className={styles.groupTitle}>
              {t("customFields.inheritedTitle")}
            </h3>
            <p className={styles.groupDesc}>
              {t("customFields.inheritedDesc")}
            </p>
            <Table
              variant="card"
              label={t("customFields.inheritedTitle")}
              columns={inheritedColumns}
              rows={view.inherited}
              getRowKey={(row) => row.id}
            />
          </section>
        )}

        {archived.length > 0 && (
          <section className={styles.group}>
            <h3 className={styles.groupTitle}>
              {t("customFields.archivedTitle")}
            </h3>
            <p className={styles.groupDesc}>{t("customFields.archivedDesc")}</p>
            <Table
              variant="card"
              label={t("customFields.archivedTitle")}
              columns={ownColumns(true)}
              rows={archived}
              getRowKey={(row) => row.id}
            />
          </section>
        )}
      </div>
    </>
  );
}
