"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { fieldsFor, useFieldText } from "@/features/custom-fields/format";
import { ValuePopover } from "@/features/issues/components/ValuePopover/ValuePopover";
import type { IssueComposerData, IssuePatch } from "@/features/issues/types";
import type { FieldDefinition } from "@/lib/custom-fields";
import type { IssueDetail } from "@/types";
import styles from "../issueDetail.module.scss";
import type { IssueDetailLayout } from "../types";
import fieldStyles from "./issueCustomFields.module.scss";

interface Props {
  issue: IssueDetail;
  data: IssueComposerData;
  layout: IssueDetailLayout;
  onPatch: (patch: IssuePatch) => void;
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.row} title={hint || undefined}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={styles.rowValue}>{children}</div>
    </div>
  );
}

/**
 * The issue's custom fields, one row each, in the order the workspace set.
 * Written through the same patch as every other attribute: the server checks
 * the value against the field's definition and the person's right to edit
 * the issue.
 */
export function IssueCustomFields({ issue, data, layout, onPatch }: Props) {
  const t = useTranslations();
  const text = useFieldText();
  const canEdit = issue.access.canEdit;
  const fields = fieldsFor(data.customFields, issue.project);

  if (fields.length === 0) return null;

  const set = (field: FieldDefinition, value: unknown) =>
    onPatch({ fieldValues: { [field.id]: value } });

  const rowFor = (field: FieldDefinition) => {
    const value = issue.fieldValues[field.id] ?? null;
    const empty = (
      <span className={styles.valueText}>{t("customFields.noValue")}</span>
    );

    const shown =
      value === null ? (
        empty
      ) : field.type === "URL" ? (
        <a
          className={fieldStyles.link}
          href={String(value)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
        >
          {String(value)}
        </a>
      ) : (
        <span className={styles.valueText}>
          {text(field, value, data.members)}
        </span>
      );

    if (!canEdit) {
      return (
        <Row key={field.id} label={field.name} hint={field.description}>
          <span className={styles.valueBtn}>{shown}</span>
        </Row>
      );
    }

    if (field.type === "CHECKBOX") {
      return (
        <Row key={field.id} label={field.name} hint={field.description}>
          <Switch
            checked={value === true}
            label={field.name}
            labelHidden
            onChange={(checked) => set(field, checked)}
          />
        </Row>
      );
    }

    const trigger = (
      <button type="button" className={styles.valueBtn} data-field-nav>
        {shown}
      </button>
    );

    // A single choice or a person commits on pick — choosing is the
    // confirmation, like the status and assignee pickers.
    if (field.type === "SELECT" || field.type === "USER") {
      const choices =
        field.type === "SELECT"
          ? field.options.map((o) => ({ id: o.id, label: o.label }))
          : data.members.map((m) => ({
              id: m.id,
              label: `${m.firstName} ${m.lastName}`,
            }));
      return (
        <Row key={field.id} label={field.name} hint={field.description}>
          <InlinePicker width={240} stop trigger={trigger} title={field.name}>
            {(close) => (
              <div className={fieldStyles.choices} role="listbox">
                {value !== null && (
                  <button
                    type="button"
                    className={fieldStyles.choice}
                    onClick={() => {
                      set(field, null);
                      close();
                    }}
                  >
                    <span className={fieldStyles.check} />
                    {t("actions.clear")}
                  </button>
                )}
                {choices.map((choice) => (
                  <button
                    key={choice.id}
                    type="button"
                    role="option"
                    aria-selected={value === choice.id}
                    className={fieldStyles.choice}
                    onClick={() => {
                      set(field, choice.id);
                      close();
                    }}
                  >
                    <span className={fieldStyles.check}>
                      {value === choice.id && (
                        <Icon icon="lucide:check" width={14} />
                      )}
                    </span>
                    {choice.label}
                  </button>
                ))}
              </div>
            )}
          </InlinePicker>
        </Row>
      );
    }

    if (field.type === "MULTI_SELECT") {
      const current = Array.isArray(value) ? value : [];
      return (
        <Row key={field.id} label={field.name} hint={field.description}>
          <InlinePicker width={240} stop trigger={trigger} title={field.name}>
            {(close) => (
              <ValuePopover<string[]>
                initialValue={current}
                clearable={current.length > 0}
                onConfirm={(next) => set(field, next)}
                onClear={() => set(field, null)}
                close={close}
              >
                {(selected, setSelected) => (
                  <div className={fieldStyles.choices}>
                    {field.options.map((option) => {
                      const on = selected.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={on}
                          className={fieldStyles.choice}
                          onClick={() =>
                            setSelected(
                              on
                                ? selected.filter((id) => id !== option.id)
                                : [...selected, option.id],
                            )
                          }
                        >
                          <span className={fieldStyles.check}>
                            {on && <Icon icon="lucide:check" width={14} />}
                          </span>
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </ValuePopover>
            )}
          </InlinePicker>
        </Row>
      );
    }

    // TEXT, URL, NUMBER, DATE: typed in, saved with the button so a value
    // that is still being typed never reaches the server.
    const variant =
      field.type === "NUMBER"
        ? "number"
        : field.type === "DATE"
          ? "date"
          : "text";
    const initial =
      value === null
        ? ""
        : field.type === "NUMBER"
          ? String(value)
          : String(value);
    return (
      <Row key={field.id} label={field.name} hint={field.description}>
        <InlinePicker width={240} stop trigger={trigger} title={field.name}>
          {(close) => (
            <ValuePopover<string>
              initialValue={initial}
              clearable={value !== null}
              onConfirm={(next) => set(field, next === "" ? null : next)}
              onClear={() => set(field, null)}
              close={close}
            >
              {(pending, setPending) => (
                <Input
                  variant={variant}
                  size="sm"
                  value={pending}
                  autoFocus
                  aria-label={field.name}
                  onChange={(e) => setPending(e.target.value)}
                />
              )}
            </ValuePopover>
          )}
        </InlinePicker>
      </Row>
    );
  };

  const rows = <>{fields.map(rowFor)}</>;
  if (layout === "aside") return rows;

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <Icon icon="lucide:text-cursor-input" width={15} aria-hidden="true" />
        <h3 className={styles.sectionTitle}>{t("customFields.title")}</h3>
      </header>
      <div className={styles.rowGrid}>{rows}</div>
    </section>
  );
}
