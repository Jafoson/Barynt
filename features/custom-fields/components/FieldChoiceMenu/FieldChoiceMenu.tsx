"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { SelectAction } from "@/components/ui/atoms/SelectMenu/atoms/SelectAction";
import {
  type ISelectItem,
  SelectMenu,
} from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { OptionVisual } from "@/features/custom-fields/components/OptionVisual/OptionVisual";
import type { IssueComposerData } from "@/features/issues/types";
import type { FieldDefinition } from "@/lib/custom-fields";

interface Props {
  field: FieldDefinition;
  members: IssueComposerData["members"];
  /**
   * What the field holds now, in the form the server takes: an option id,
   * a person's id, a list of them, or `{ create }` entries for choices that
   * don't exist yet (the create dialog holds those until the issue is made).
   */
  value: unknown;
  /** The new value in the same form, `null` to clear. */
  onChange: (next: unknown) => void;
  close: () => void;
}

const isCreate = (v: unknown): v is { create: string } =>
  typeof v === "object" && v !== null && "create" in v;

const NEW = "new:";

/**
 * The list a choice, multi-choice or person field is picked from. The same
 * menu the labels, status and assignee use: a search field on top, the check
 * mark on the right, and — where the field allows its own values — an
 * "Add “…”" row at the end of the list whatever else matches. Picking it
 * hands the new value on like creating a label does, and it is selected.
 *
 * A single choice commits on pick and closes. A multi-choice list stays open
 * and writes on every toggle, again like the labels.
 */
export function FieldChoiceMenu({
  field,
  members,
  value,
  onChange,
  close,
}: Props) {
  const t = useTranslations();
  const multi = field.type === "MULTI_SELECT";

  const entries = multi && Array.isArray(value) ? value : [value];
  const ids = entries.filter((v): v is string => typeof v === "string");
  const drafts = entries.flatMap((v) => (isCreate(v) ? [v.create] : []));

  const options: ISelectItem[] =
    field.type === "USER"
      ? members.map((m) => ({
          value: m.id,
          label: `${m.firstName} ${m.lastName}`,
          icon: <Avatar avatar={m} size={18} />,
        }))
      : field.options.map((o) => ({
          value: o.id,
          label: o.label,
          icon: <OptionVisual option={o} />,
        }));

  // A choice typed in but not made yet shows as selected until it exists.
  const draftItems: ISelectItem[] = drafts.map((label) => ({
    value: `${NEW}${label}`,
    label,
  }));

  const items: ISelectItem[] = [
    ...(!multi && ids.length > 0
      ? [{ value: null, label: t("customFields.noValue") }]
      : []),
    ...options,
    ...draftItems,
  ];

  const selected = multi
    ? [...ids, ...draftItems.map((d) => d.value)]
    : (ids[0] ?? null);

  const pick = (picked: string | number | null) => {
    if (!multi) {
      onChange(picked === null ? null : picked);
      close();
      return;
    }
    const key = String(picked);
    const nextIds = ids.includes(key)
      ? ids.filter((id) => id !== key)
      : key.startsWith(NEW)
        ? ids
        : [...ids, key];
    const nextDrafts = key.startsWith(NEW)
      ? drafts.filter((label) => `${NEW}${label}` !== key)
      : drafts;
    const next = [
      ...nextIds,
      ...nextDrafts.map((label) => ({ create: label })),
    ];
    onChange(next.length > 0 ? next : null);
  };

  const canCreate =
    field.allowCustomOptions &&
    (field.type === "SELECT" || field.type === "MULTI_SELECT");

  return (
    <SelectMenu
      multi={multi}
      checkMark
      searchable
      placeholder={t("customFields.searchValues")}
      items={items}
      value={selected}
      onPick={pick}
      onClose={close}
      createAction={
        canCreate
          ? (query) => (
              <SelectAction
                icon={<Icon icon="lucide:plus" width={14} />}
                onClick={() => {
                  if (!multi) {
                    onChange({ create: query });
                    close();
                    return;
                  }
                  onChange([
                    ...ids,
                    ...drafts.map((label) => ({ create: label })),
                    { create: query },
                  ]);
                }}
              >
                {t("customFields.createValue", { value: query })}
              </SelectAction>
            )
          : undefined
      }
    />
  );
}
