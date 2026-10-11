"use client";

import { useLocale, useTranslations } from "next-intl";
import type { IssueComposerData } from "@/features/issues/types";
import type { FieldDefinition, FieldValue } from "@/lib/custom-fields";
import { formatFieldDate } from "@/lib/custom-fields/datetime";
import { usePreferences } from "@/lib/preferences/PreferencesContext";

/**
 * The fields that apply to this issue: workspace-wide ones and its
 * project's own — minus the ones the project's settings turned off.
 */
export function fieldsFor(
  fields: FieldDefinition[],
  projectId: string,
): FieldDefinition[] {
  return fields.filter(
    (f) =>
      (f.projectId === null || f.projectId === projectId) &&
      !(f.hiddenInProjects ?? []).includes(projectId),
  );
}

/**
 * The zone times are entered and shown in: the one chosen in the account's
 * appearance settings, otherwise the browser's own.
 */
export function useFieldTimeZone(): string {
  const { timeZone } = usePreferences();
  return timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * How a value reads: a choice by its label, a person by name, a date and
 * time the way this person set it in the appearance settings. Shared with
 * the card, the row and the detail view so one value never looks two ways.
 */
export function useFieldText() {
  const t = useTranslations();
  const locale = useLocale();
  const { fieldDateFormat, fieldTimeFormat } = usePreferences();
  const timeZone = useFieldTimeZone();

  return (
    field: FieldDefinition,
    value: FieldValue,
    members: IssueComposerData["members"],
  ): string => {
    const optionLabel = (id: string) =>
      field.options.find((o) => o.id === id)?.label ?? id;

    switch (field.type) {
      case "SELECT":
        return optionLabel(String(value));
      case "MULTI_SELECT":
        return (Array.isArray(value) ? value : []).map(optionLabel).join(", ");
      case "CHECKBOX":
        return value === true ? t("customFields.yes") : t("customFields.no");
      case "DATE":
        return typeof value === "string"
          ? formatFieldDate(value, {
              mode: field.dateMode,
              dateFormat: fieldDateFormat,
              timeFormat: fieldTimeFormat,
              timeZone,
              locale,
            })
          : "";
      case "USER": {
        const member = members.find((m) => m.id === value);
        return member ? `${member.firstName} ${member.lastName}` : "";
      }
      case "NUMBER": {
        if (typeof value !== "number") return String(value);
        // Places as the field fixes them; a free field shows what was typed.
        const places = field.numberDecimals ?? 2;
        const options: Intl.NumberFormatOptions =
          field.numberMode === "DECIMAL"
            ? { minimumFractionDigits: places, maximumFractionDigits: places }
            : field.numberMode === "INTEGER"
              ? { maximumFractionDigits: 0 }
              : { maximumFractionDigits: 10 };
        const formatted = new Intl.NumberFormat(locale, options).format(value);
        // A narrow no-break space keeps "50 %" on one line.
        return field.numberUnit
          ? `${formatted}\u202F${field.numberUnit}`
          : formatted;
      }
      default:
        return String(value);
    }
  };
}
