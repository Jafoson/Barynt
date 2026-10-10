"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
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
import type { IssueComposerData } from "@/features/issues/types";
import type { FieldDefinition } from "@/lib/custom-fields";
import styles from "./createFieldChips.module.scss";

/**
 * What the dialog holds for a field before the issue exists: a value as the
 * server takes it. A choice typed in is `{ create: "label" }`, made when the
 * issue is created.
 */
export type DraftValue = unknown;

interface Props {
  projectId: string;
  fields: FieldDefinition[];
  members: IssueComposerData["members"];
  values: Record<string, DraftValue>;
  /** `null` clears the value. */
  onChange: (fieldId: string, value: DraftValue | null) => void;
}

const isCreate = (v: unknown): v is { create: string } =>
  typeof v === "object" && v !== null && "create" in v;

const ICONS: Record<FieldDefinition["type"], string> = {
  TEXT: "lucide:type",
  NUMBER: "lucide:hash",
  DATE: "lucide:calendar",
  SELECT: "lucide:list",
  MULTI_SELECT: "lucide:list-checks",
  CHECKBOX: "lucide:square-check",
  URL: "lucide:link",
  USER: "lucide:user-round",
};

/**
 * One toolbar chip per custom field that applies to the project the issue
 * is created in — same look and keyboard behavior as the type, status and
 * assignee chips next to it.
 */
export function CreateFieldChips({
  projectId,
  fields,
  members,
  values,
  onChange,
}: Props) {
  const t = useTranslations();
  const text = useFieldText();
  const timeZone = useFieldTimeZone();

  /** How a draft reads on its chip, including a choice not made yet. */
  const draftText = (field: FieldDefinition, value: DraftValue): string => {
    if (isCreate(value)) return value.create;
    if (Array.isArray(value)) {
      return value
        .map((v) =>
          isCreate(v)
            ? v.create
            : (field.options.find((o) => o.id === v)?.label ?? String(v)),
        )
        .join(", ");
    }
    return text(field, value as never, members);
  };

  return (
    <>
      {fieldsFor(fields, projectId).map((field) => {
        const value = values[field.id];
        const has = value !== undefined;

        return (
          <FilterChip
            key={field.id}
            name={field.name}
            label={has ? draftText(field, value) : field.name}
            icon={<Icon icon={field.icon ?? ICONS[field.type]} width={14} />}
            active={has}
            onClear={() => onChange(field.id, null)}
            width={240}
            data-field-nav
          >
            {(closeMenu) => {
              if (field.type === "SELECT" || field.type === "USER") {
                const items =
                  field.type === "SELECT"
                    ? field.options.map((o) => ({
                        value: o.id,
                        label: o.label,
                      }))
                    : members.map((m) => ({
                        value: m.id,
                        label: `${m.firstName} ${m.lastName}`,
                      }));
                return (
                  <>
                    <SelectMenu
                      items={items}
                      value={typeof value === "string" ? value : null}
                      onPick={(v) => {
                        onChange(field.id, v as string);
                        closeMenu();
                      }}
                      onClose={closeMenu}
                      searchable={items.length > 8}
                    />
                    {field.type === "SELECT" && field.allowCustomOptions && (
                      <AddValue
                        onAdd={(label) => {
                          onChange(field.id, { create: label });
                          closeMenu();
                        }}
                      />
                    )}
                  </>
                );
              }

              if (field.type === "CHECKBOX") {
                return (
                  <SelectMenu
                    items={[
                      { value: "yes", label: t("customFields.yes") },
                      { value: "no", label: t("customFields.no") },
                    ]}
                    value={
                      value === true ? "yes" : value === false ? "no" : null
                    }
                    onPick={(v) => {
                      onChange(field.id, v === "yes");
                      closeMenu();
                    }}
                    onClose={closeMenu}
                  />
                );
              }

              if (field.type === "MULTI_SELECT") {
                type Pending = { ids: string[]; created: string[] };
                const list = Array.isArray(value) ? value : [];
                const initial: Pending = {
                  ids: list.filter((v): v is string => typeof v === "string"),
                  created: list.flatMap((v) => (isCreate(v) ? [v.create] : [])),
                };
                return (
                  <ValuePopover<Pending>
                    initialValue={initial}
                    clearable={list.length > 0}
                    onConfirm={(next) => {
                      const all = [
                        ...next.ids,
                        ...next.created.map((label) => ({ create: label })),
                      ];
                      onChange(field.id, all.length > 0 ? all : null);
                    }}
                    onClear={() => onChange(field.id, null)}
                    close={closeMenu}
                  >
                    {(picked, setPicked) => (
                      <>
                        <div className={styles.choices}>
                          {field.options.map((option) => {
                            const on = picked.ids.includes(option.id);
                            return (
                              <button
                                key={option.id}
                                type="button"
                                aria-pressed={on}
                                className={styles.choice}
                                onClick={() =>
                                  setPicked({
                                    ...picked,
                                    ids: on
                                      ? picked.ids.filter(
                                          (id) => id !== option.id,
                                        )
                                      : [...picked.ids, option.id],
                                  })
                                }
                              >
                                <span className={styles.check}>
                                  {on && (
                                    <Icon icon="lucide:check" width={14} />
                                  )}
                                </span>
                                {option.label}
                              </button>
                            );
                          })}
                          {picked.created.map((label) => (
                            <button
                              key={`new-${label}`}
                              type="button"
                              aria-pressed
                              className={styles.choice}
                              onClick={() =>
                                setPicked({
                                  ...picked,
                                  created: picked.created.filter(
                                    (l) => l !== label,
                                  ),
                                })
                              }
                            >
                              <span className={styles.check}>
                                <Icon icon="lucide:check" width={14} />
                              </span>
                              {label}
                            </button>
                          ))}
                        </div>
                        {field.allowCustomOptions && (
                          <AddValue
                            onAdd={(label) =>
                              setPicked({
                                ...picked,
                                created: picked.created.includes(label)
                                  ? picked.created
                                  : [...picked.created, label],
                              })
                            }
                          />
                        )}
                      </>
                    )}
                  </ValuePopover>
                );
              }

              return (
                <ValuePopover<string>
                  initialValue={
                    has ? toInputString(field, value as never, timeZone) : ""
                  }
                  clearable={has}
                  onConfirm={(next) =>
                    onChange(field.id, fromInputString(field, next, timeZone))
                  }
                  onClear={() => onChange(field.id, null)}
                  close={closeMenu}
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
              );
            }}
          </FilterChip>
        );
      })}
    </>
  );
}
