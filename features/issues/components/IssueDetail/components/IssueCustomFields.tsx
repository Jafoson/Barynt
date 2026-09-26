"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { FieldEditor } from "@/features/custom-fields/components/FieldEditor/FieldEditor";
import { FieldValueView } from "@/features/custom-fields/components/FieldValueView/FieldValueView";
import type {
  IssueFieldEntry,
  SetFieldValue,
} from "@/features/custom-fields/types";
import { fieldIcon } from "@/lib/custom-fields/icons";
import type { FieldValue } from "@/lib/custom-fields/types";
import type { IssueDetail, User } from "@/types";
import styles from "../issueDetail.module.scss";
import type { IssueDetailLayout } from "../types";

interface IssueCustomFieldsProps {
  issue: IssueDetail;
  members: User[];
  layout: IssueDetailLayout;
  onField: SetFieldValue;
}

/** One field: its name on the left, its answer on the right, the answer changed in a popover. */
function FieldRow({
  entry,
  members,
  canEdit,
  onField,
}: {
  entry: IssueFieldEntry;
  members: User[];
  canEdit: boolean;
  onField: SetFieldValue;
}) {
  const t = useTranslations();
  const { field, value } = entry;
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  const save = (next: FieldValue | null) =>
    startTransition(async () => {
      const result = await onField(field.id, next);
      setError("error" in result ? result.error : "");
    });

  return (
    <div className={styles.row}>
      <span
        className={[styles.rowLabel, styles.customLabel].join(" ")}
        title={field.description || undefined}
      >
        {field.icon && (
          <Icon
            icon={fieldIcon(field)}
            width={13}
            className={styles.customIcon}
          />
        )}
        {field.name}
      </span>
      <div className={styles.rowValue}>
        {canEdit ? (
          <div className={styles.customValue}>
            <InlinePicker
              width={field.type === "user" ? 220 : 240}
              stop
              title={field.name}
              trigger={
                <button
                  type="button"
                  className={styles.valueBtn}
                  disabled={isPending}
                  data-field-nav
                >
                  <FieldValueView
                    field={field}
                    value={value}
                    members={members}
                  />
                </button>
              }
            >
              {(close) => (
                <FieldEditor
                  field={field}
                  value={value}
                  members={members}
                  onSave={save}
                  close={close}
                />
              )}
            </InlinePicker>
            {field.type === "url" && value !== null && (
              <a
                className={styles.customLink}
                href={String(value)}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={t("customFields.openLink", { name: field.name })}
                title={t("customFields.openLink", { name: field.name })}
              >
                <Icon icon="lucide:external-link" width={14} />
              </a>
            )}
            {error && (
              <p className={styles.customError} role="alert">
                {error}
              </p>
            )}
          </div>
        ) : (
          <span className={styles.valueBtn}>
            <FieldValueView
              field={field}
              value={value}
              members={members}
              link
            />
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * The issue's custom fields (BARY-81): the workspace's and its project's, each with this issue's
 * answer. Editing follows editing the issue (`issue.access.canEdit`), like the planning rows next
 * to it, and each change is its own request, so one that is refused says why beside its own row.
 *
 * In the main column this gets a header of its own, like `IssuePlanning`; in the attributes sidebar
 * it is bare rows. An issue with no fields shows nothing at all.
 */
export function IssueCustomFields({
  issue,
  members,
  layout,
  onField,
}: IssueCustomFieldsProps) {
  const t = useTranslations();
  if (issue.customFields.length === 0) return null;

  const rows = issue.customFields.map((entry) => (
    <FieldRow
      key={entry.field.id}
      entry={entry}
      members={members}
      canEdit={issue.access.canEdit}
      onField={onField}
    />
  ));

  if (layout === "aside") return <>{rows}</>;

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <Icon icon="lucide:layout-list" width={15} aria-hidden="true" />
        <h3 className={styles.sectionTitle}>{t("customFields.title")}</h3>
      </header>
      <div className={styles.rowGrid}>{rows}</div>
    </section>
  );
}
