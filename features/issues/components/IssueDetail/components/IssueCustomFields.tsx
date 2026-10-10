"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { AddValue } from "@/features/custom-fields/components/AddValue/AddValue";
import {
  fieldsFor,
  useFieldText,
  useFieldTimeZone,
} from "@/features/custom-fields/format";
import {
  fromInputString,
  inputVariant,
  toInputString,
} from "@/features/custom-fields/input";
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
  icon,
  hint,
  children,
}: {
  label: string;
  icon?: string | null;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.row} title={hint || undefined}>
      <span className={styles.rowLabel}>
        {icon && (
          <Icon
            icon={icon}
            width={13}
            aria-hidden="true"
            className={fieldStyles.labelIcon}
          />
        )}
        {label}
      </span>
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
  const timeZone = useFieldTimeZone();
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
        <Row
          key={field.id}
          label={field.name}
          icon={field.icon}
          hint={field.description}
        >
          <span className={styles.valueBtn}>{shown}</span>
        </Row>
      );
    }

    if (field.type === "CHECKBOX") {
      return (
        <Row
          key={field.id}
          label={field.name}
          icon={field.icon}
          hint={field.description}
        >
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
        <Row
          key={field.id}
          label={field.name}
          icon={field.icon}
          hint={field.description}
        >
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
                {field.type === "SELECT" && field.allowCustomOptions && (
                  <AddValue
                    onAdd={(label) => {
                      set(field, { create: label });
                      close();
                    }}
                  />
                )}
              </div>
            )}
          </InlinePicker>
        </Row>
      );
    }

    if (field.type === "MULTI_SELECT") {
      const current = Array.isArray(value) ? value : [];
      // Values typed in while this picker is open: they don't exist as
      // choices yet, so they travel as `{ create }` and are made on save.
      type Pending = { ids: string[]; created: string[] };
      return (
        <Row
          key={field.id}
          label={field.name}
          icon={field.icon}
          hint={field.description}
        >
          <InlinePicker width={240} stop trigger={trigger} title={field.name}>
            {(close) => (
              <ValuePopover<Pending>
                initialValue={{ ids: current, created: [] }}
                clearable={current.length > 0}
                onConfirm={(next) => {
                  const all = [
                    ...next.ids,
                    ...next.created.map((label) => ({ create: label })),
                  ];
                  set(field, all.length > 0 ? all : null);
                }}
                onClear={() => set(field, null)}
                close={close}
              >
                {(selected, setSelected) => (
                  <>
                    <div className={fieldStyles.choices}>
                      {field.options.map((option) => {
                        const on = selected.ids.includes(option.id);
                        return (
                          <button
                            key={option.id}
                            type="button"
                            aria-pressed={on}
                            className={fieldStyles.choice}
                            onClick={() =>
                              setSelected({
                                ...selected,
                                ids: on
                                  ? selected.ids.filter(
                                      (id) => id !== option.id,
                                    )
                                  : [...selected.ids, option.id],
                              })
                            }
                          >
                            <span className={fieldStyles.check}>
                              {on && <Icon icon="lucide:check" width={14} />}
                            </span>
                            {option.label}
                          </button>
                        );
                      })}
                      {selected.created.map((label) => (
                        <button
                          key={`new-${label}`}
                          type="button"
                          aria-pressed
                          className={fieldStyles.choice}
                          onClick={() =>
                            setSelected({
                              ...selected,
                              created: selected.created.filter(
                                (l) => l !== label,
                              ),
                            })
                          }
                        >
                          <span className={fieldStyles.check}>
                            <Icon icon="lucide:check" width={14} />
                          </span>
                          {label}
                        </button>
                      ))}
                    </div>
                    {field.allowCustomOptions && (
                      <AddValue
                        onAdd={(label) =>
                          setSelected({
                            ...selected,
                            created: selected.created.includes(label)
                              ? selected.created
                              : [...selected.created, label],
                          })
                        }
                      />
                    )}
                  </>
                )}
              </ValuePopover>
            )}
          </InlinePicker>
        </Row>
      );
    }

    // TEXT, URL, NUMBER and the three date modes: typed in, saved with the
    // button so a value that is still being typed never reaches the server.
    // An instant is entered in the person's own zone and stored in UTC.
    return (
      <Row
        key={field.id}
        label={field.name}
        icon={field.icon}
        hint={field.description}
      >
        <InlinePicker width={260} stop trigger={trigger} title={field.name}>
          {(close) => (
            <ValuePopover<string>
              initialValue={toInputString(field, value, timeZone)}
              clearable={value !== null}
              onConfirm={(next) =>
                set(field, fromInputString(field, next, timeZone))
              }
              onClear={() => set(field, null)}
              close={close}
            >
              {(pending, setPending) => (
                <Input
                  variant={inputVariant(field)}
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
