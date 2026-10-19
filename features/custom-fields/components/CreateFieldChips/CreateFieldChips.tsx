"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { FieldChoiceMenu } from "@/features/custom-fields/components/FieldChoiceMenu/FieldChoiceMenu";
import { LinkText } from "@/features/custom-fields/components/LinkChip/LinkChip";
import { LinkValuePopover } from "@/features/custom-fields/components/LinkValuePopover/LinkValuePopover";
import { SiteIcon } from "@/features/custom-fields/components/SiteIcon/SiteIcon";
import {
  fieldsFor,
  useFieldText,
  useFieldTimeZone,
} from "@/features/custom-fields/format";
import {
  fromInputString,
  inputStep,
  inputVariant,
  linkProblem,
  toInputString,
} from "@/features/custom-fields/input";
import { ValuePopover } from "@/features/issues/components/ValuePopover/ValuePopover";
import type { IssueComposerData } from "@/features/issues/types";
import {
  type FieldDefinition,
  titleKey,
  withScheme,
} from "@/lib/custom-fields";

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
        const ownTitle = (f: FieldDefinition) => {
          const own = values[titleKey(f.id)];
          return typeof own === "string" ? own : null;
        };

        return (
          <FilterChip
            key={field.id}
            name={field.name}
            label={
              has && field.type === "URL" && typeof value === "string" ? (
                <LinkText
                  url={withScheme(value)}
                  title={ownTitle(field)}
                  fetchTitle={field.linkFetchTitle}
                />
              ) : has ? (
                draftText(field, value)
              ) : (
                field.name
              )
            }
            icon={
              has &&
              field.type === "URL" &&
              field.linkFavicon &&
              typeof value === "string" ? (
                <SiteIcon url={withScheme(value)} />
              ) : has && field.type === "USER" ? (
                (() => {
                  const member = members.find((m) => m.id === value);
                  return member ? (
                    <Avatar avatar={member} size={16} />
                  ) : (
                    <Icon icon={field.icon ?? ICONS[field.type]} width={14} />
                  );
                })()
              ) : (
                <Icon icon={field.icon ?? ICONS[field.type]} width={14} />
              )
            }
            active={has}
            onClear={() => {
              onChange(field.id, null);
              if (field.type === "URL") onChange(titleKey(field.id), null);
            }}
            width={240}
            data-field-nav
          >
            {(closeMenu) => {
              if (
                field.type === "SELECT" ||
                field.type === "MULTI_SELECT" ||
                field.type === "USER"
              ) {
                return (
                  <FieldChoiceMenu
                    field={field}
                    members={members}
                    value={value}
                    onChange={(next) => onChange(field.id, next)}
                    close={closeMenu}
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

              if (field.type === "URL") {
                const own = values[titleKey(field.id)];
                return (
                  <LinkValuePopover
                    field={field}
                    url={toInputString(
                      field,
                      has ? (value as never) : null,
                      timeZone,
                    )}
                    title={typeof own === "string" ? own : ""}
                    clearable={has}
                    onConfirm={(url, title) => {
                      onChange(field.id, url);
                      onChange(titleKey(field.id), title);
                    }}
                    onClear={() => {
                      onChange(field.id, null);
                      onChange(titleKey(field.id), null);
                    }}
                    close={closeMenu}
                  />
                );
              }

              return (
                <ValuePopover<string>
                  initialValue={toInputString(
                    field,
                    has ? (value as never) : null,
                    timeZone,
                  )}
                  clearable={has}
                  validate={(next) => {
                    const problem = linkProblem(field, next);
                    return problem ? t(`customFields.${problem}`) : null;
                  }}
                  onConfirm={(next) =>
                    onChange(field.id, fromInputString(field, next, timeZone))
                  }
                  onClear={() => onChange(field.id, null)}
                  close={closeMenu}
                >
                  {(pending, setPending) => (
                    <Input
                      variant={inputVariant(field)}
                      step={inputStep(field)}
                      iconRight={
                        field.type === "NUMBER" && field.numberUnit ? (
                          <span>{field.numberUnit}</span>
                        ) : undefined
                      }
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
