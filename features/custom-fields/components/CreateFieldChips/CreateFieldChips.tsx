"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { fieldsFor, useFieldText } from "@/features/custom-fields/format";
import { ValuePopover } from "@/features/issues/components/ValuePopover/ValuePopover";
import type { IssueComposerData } from "@/features/issues/types";
import type { FieldDefinition, FieldValue } from "@/lib/custom-fields";
import styles from "./createFieldChips.module.scss";

interface Props {
  projectId: string;
  fields: FieldDefinition[];
  members: IssueComposerData["members"];
  values: Record<string, FieldValue>;
  /** `null` clears the value. */
  onChange: (fieldId: string, value: FieldValue | null) => void;
}

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

  return (
    <>
      {fieldsFor(fields, projectId).map((field) => {
        const value = values[field.id];
        const has = value !== undefined;

        return (
          <FilterChip
            key={field.id}
            name={field.name}
            label={has ? text(field, value, members) : field.name}
            icon={<Icon icon={ICONS[field.type]} width={14} />}
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
                const selected = Array.isArray(value) ? value : [];
                return (
                  <ValuePopover<string[]>
                    initialValue={selected}
                    clearable={selected.length > 0}
                    onConfirm={(next) =>
                      onChange(field.id, next.length > 0 ? next : null)
                    }
                    onClear={() => onChange(field.id, null)}
                    close={closeMenu}
                  >
                    {(picked, setPicked) => (
                      <div className={styles.choices}>
                        {field.options.map((option) => {
                          const on = picked.includes(option.id);
                          return (
                            <button
                              key={option.id}
                              type="button"
                              aria-pressed={on}
                              className={styles.choice}
                              onClick={() =>
                                setPicked(
                                  on
                                    ? picked.filter((id) => id !== option.id)
                                    : [...picked, option.id],
                                )
                              }
                            >
                              <span className={styles.check}>
                                {on && <Icon icon="lucide:check" width={14} />}
                              </span>
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </ValuePopover>
                );
              }

              const variant =
                field.type === "NUMBER"
                  ? "number"
                  : field.type === "DATE"
                    ? "date"
                    : "text";
              return (
                <ValuePopover<string>
                  initialValue={has ? String(value) : ""}
                  clearable={has}
                  onConfirm={(next) =>
                    onChange(field.id, next.trim() === "" ? null : next.trim())
                  }
                  onClear={() => onChange(field.id, null)}
                  close={closeMenu}
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
              );
            }}
          </FilterChip>
        );
      })}
    </>
  );
}
