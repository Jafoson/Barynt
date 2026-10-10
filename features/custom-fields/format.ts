"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { IssueComposerData } from "@/features/issues/types";
import type { FieldDefinition, FieldValue } from "@/lib/custom-fields";

/** The fields that apply to this issue: workspace-wide ones and its project's own. */
export function fieldsFor(
  fields: FieldDefinition[],
  projectId: string,
): FieldDefinition[] {
  return fields.filter(
    (f) => f.projectId === null || f.projectId === projectId,
  );
}

/**
 * How a value reads: a choice by its label, a person by name, a date in the
 * viewer's format. Shared with the card and the list row so one value never
 * looks two ways.
 */
export function useFieldText() {
  const t = useTranslations();
  const format = useFormatter();

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
          ? format.dateTime(new Date(`${value}T12:00:00Z`), {
              dateStyle: "medium",
              timeZone: "UTC",
            })
          : "";
      case "USER": {
        const member = members.find((m) => m.id === value);
        return member ? `${member.firstName} ${member.lastName}` : "";
      }
      case "NUMBER":
        return typeof value === "number" ? format.number(value) : String(value);
      default:
        return String(value);
    }
  };
}
