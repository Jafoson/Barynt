"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { CUSTOM_FIELD_ICONS } from "@/lib/custom-fields/icons";
import {
  CUSTOM_FIELD_TYPE_ICONS,
  type CustomFieldType,
} from "@/lib/custom-fields/types";
import styles from "./fieldIconPicker.module.scss";

interface Props {
  /** The icon that is chosen, or `null` for the icon of the field's type. */
  value: string | null;
  type: CustomFieldType;
  onChange: (icon: string | null) => void;
  disabled?: boolean;
}

/**
 * The icons a custom field can have, as a grid: first "the icon of its type" (which changes with the
 * type), then the list. One is on at a time; choosing the one that is on again takes it off, back to
 * the type's. The icon is what makes the field look like a built-in one on a card and in the panel.
 */
export function FieldIconPicker({ value, type, onChange, disabled }: Props) {
  const t = useTranslations();
  const typeIcon = CUSTOM_FIELD_TYPE_ICONS[type];

  return (
    <fieldset className={styles.picker} disabled={disabled}>
      <legend className={styles.legend}>{t("customFields.icon")}</legend>
      <div className={styles.grid}>
        <button
          type="button"
          className={styles.cell}
          aria-pressed={value === null}
          title={t("customFields.iconOfType")}
          aria-label={t("customFields.iconOfType")}
          onClick={() => onChange(null)}
        >
          <Icon icon={typeIcon} width={16} />
        </button>
        {CUSTOM_FIELD_ICONS.map((icon) => (
          <button
            key={icon}
            type="button"
            className={styles.cell}
            aria-pressed={value === icon}
            title={icon.replace("lucide:", "")}
            aria-label={icon.replace("lucide:", "")}
            onClick={() => onChange(value === icon ? null : icon)}
          >
            <Icon icon={icon} width={16} />
          </button>
        ))}
      </div>
    </fieldset>
  );
}
