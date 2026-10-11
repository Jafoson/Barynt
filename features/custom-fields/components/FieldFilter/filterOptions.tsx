import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { OptionVisual } from "@/features/custom-fields/components/OptionVisual/OptionVisual";
import type { Translator } from "@/i18n/types";
import type { FieldDefinition } from "@/lib/custom-fields";
import {
  CHECKBOX_ANSWERS,
  DATE_BUCKETS,
  FILTER_NONE,
} from "@/lib/custom-fields/filter";
import { fullName } from "@/lib/utils/string";
import type { User } from "@/types";

export interface FieldFilterOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
}

/**
 * The answers a field's filter offers, in order: "not set" first (as in the
 * grouping), then the field's own values — or the fixed answers of a yes/no
 * and a date.
 */
export function fieldFilterOptions(
  field: FieldDefinition,
  members: User[],
  t: Translator,
): FieldFilterOption[] {
  const none = { value: FILTER_NONE, label: t("customFields.noValue") };

  switch (field.type) {
    case "CHECKBOX":
      return CHECKBOX_ANSWERS.map((answer) => ({
        value: answer,
        label: t(answer === "yes" ? "customFields.yes" : "customFields.no"),
      }));
    case "DATE": {
      const label = {
        overdue: t("filters.dueDateOverdue"),
        today: t("filters.dueDateToday"),
        week: t("filters.dueDateWeek"),
        none: t("filters.dueDateNone"),
      } as const;
      return DATE_BUCKETS.map((bucket) => ({
        value: bucket,
        label: label[bucket],
      }));
    }
    case "USER":
      return [
        none,
        ...members.map((m) => ({
          value: m.id,
          label: fullName(m),
          icon: <Avatar avatar={m} size={18} />,
        })),
      ];
    default:
      return [
        none,
        ...field.options.map((o) => ({
          value: o.id,
          label: o.label,
          icon: <OptionVisual option={o} />,
        })),
      ];
  }
}
