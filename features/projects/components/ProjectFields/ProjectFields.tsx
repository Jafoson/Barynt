"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import {
  CONFIGURABLE_DETAIL_FIELDS,
  type DetailFieldKey,
} from "@/features/projects/detail-fields";
import type { ProjectFieldsView } from "@/features/projects/types";
import { useRouter } from "@/i18n/navigation";
import styles from "./projectFields.module.scss";

interface Props extends ProjectFieldsView {
  onChange: (hidden: string[]) => Promise<{ ok: true } | { error: string }>;
}

/**
 * `t(...)` key per field — a lookup object rather than a computed template
 * string so next-intl's `t()` can still typecheck the result as one of its
 * known message keys. Reuses existing labels field-for-field instead of
 * introducing duplicates (`attachments`/`relations` already have their own
 * section titles elsewhere in the app).
 */
const FIELD_LABEL_KEY = {
  type: "fields.type",
  status: "fields.status",
  priority: "fields.priority",
  assignee: "fields.assignee",
  description: "fields.description",
  attachments: "attachments.title",
  labels: "fields.labels",
  relations: "relations.title",
  dueDate: "fields.dueDate",
  storyPoints: "fields.storyPoints",
  estimateHours: "fields.estimateHours",
} as const satisfies Record<DetailFieldKey, string>;

/** The icon of a custom field that has none of its own. */
const CUSTOM_TYPE_ICON: Record<string, string> = {
  TEXT: "lucide:type",
  NUMBER: "lucide:hash",
  DATE: "lucide:calendar",
  SELECT: "lucide:list",
  MULTI_SELECT: "lucide:list-checks",
  CHECKBOX: "lucide:square-check",
  URL: "lucide:link",
  USER: "lucide:user-round",
};

/** A field as a row: icon and name on the left, the on/off switch on the right. */
interface FieldRow {
  id: string;
  label: string;
  icon: string;
  control: React.ReactNode;
}

const COLUMNS: TableColumn<FieldRow>[] = [
  {
    id: "field",
    width: "minmax(0, 1fr)",
    cell: (row) => (
      <div className={styles.setting}>
        <Icon icon={row.icon} width={16} className={styles.icon} />
        <span className={styles.label}>{row.label}</span>
      </div>
    ),
  },
  {
    id: "control",
    width: "max-content",
    align: "end",
    cell: (row) => row.control,
  },
];

/**
 * Which fields of the issue detail view this project shows (BARY-31).
 *
 * A switch per field, effective immediately — the same reasoning as the
 * visibility toggle on the General page: a switch that only takes effect
 * via a separate "Save" would show something incorrect in the meantime.
 * Permanent fields (type/status/assignee/description) don't appear on this
 * page at all, not even as a locked switch — unlike the dashboard's
 * key-figures widget (kept visible as a locked example of what customizing
 * looks like), a row here that can never actually change would just be
 * clutter in a settings list.
 */
export function ProjectFields({
  hiddenDetailFields,
  customFields,
  canUpdate,
  onChange,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [hidden, setHidden] = useState(() => new Set(hiddenDetailFields));
  const [error, setError] = useState("");

  const toggle = (key: string, on: boolean) => {
    const next = new Set(hidden);
    if (on) next.delete(key);
    else next.add(key);
    setHidden(next);

    startTransition(async () => {
      const result = await onChange([...next]);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError("");
      router.refresh();
    });
  };

  const rows: FieldRow[] = CONFIGURABLE_DETAIL_FIELDS.map((field) => {
    const label = t(FIELD_LABEL_KEY[field.key]);
    return {
      id: field.key,
      label,
      icon: field.icon,
      control: (
        <Switch
          checked={!hidden.has(field.key)}
          disabled={!canUpdate || isPending}
          onChange={(next) => toggle(field.key, next)}
          label={label}
          labelHidden
        />
      ),
    };
  });

  // The custom fields, each with its own switch: `cf:<id>` in the same list.
  const customRows: FieldRow[] = customFields.map((field) => {
    const entry = `cf:${field.id}`;
    return {
      id: entry,
      label: field.name,
      icon:
        field.icon ??
        CUSTOM_TYPE_ICON[field.type] ??
        "lucide:text-cursor-input",
      control: (
        <Switch
          checked={!hidden.has(entry)}
          disabled={!canUpdate || isPending}
          onChange={(next) => toggle(entry, next)}
          label={field.name}
          labelHidden
        />
      ),
    };
  });

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.fields")}
        description={t("projectSettings.fieldsDesc")}
      />

      <div className={styles.content}>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}

        <Table
          variant="card"
          label={t("nav.fields")}
          columns={COLUMNS}
          rows={rows}
          getRowKey={(row) => row.id}
        />

        {customRows.length > 0 && (
          <>
            <h2 className={styles.sectionTitle}>{t("customFields.title")}</h2>
            <Table
              variant="card"
              label={t("customFields.title")}
              columns={COLUMNS}
              rows={customRows}
              getRowKey={(row) => row.id}
            />
          </>
        )}
      </div>
    </>
  );
}
