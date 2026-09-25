"use client";

import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/atoms/Input/Input";
import { Select } from "@/components/ui/atoms/Select/Select";
import { Textarea } from "@/components/ui/atoms/Textarea/Textarea";
import type { SettingField } from "@/lib/plugins/settings";
import {
  defaultText,
  type FieldState,
  type FormState,
  mustFill,
} from "./formState";
import styles from "./pluginSettings.module.scss";

interface Props {
  fields: readonly SettingField[];
  state: FormState;
  /** One line under a field, by setting id. */
  errors: Record<string, string>;
  disabled: boolean;
  /** Makes the ids of the controls unique on a page. */
  idPrefix: string;
  onChange: (id: string, value: FieldState) => void;
}

/**
 * The controls of a plugin's settings, one per field: a line of text, several lines, a
 * number, a choice, a yes/no. Only what the manifest declared is drawn, and the browser's own
 * limits (length, range, address, email) are set from the same field the server checks, so a
 * value that cannot be saved mostly cannot be typed. Rendering only: the state and the save are
 * `PluginSettingsModal`'s.
 */
export function SettingsFields({
  fields,
  state,
  errors,
  disabled,
  idPrefix,
  onChange,
}: Props) {
  const t = useTranslations("pluginSettings");

  /** What a field says under its label: what it is for, that it must be filled, what it is when left empty. */
  const hintOf = (field: SettingField): string | undefined => {
    const fallback = defaultText(field);
    const parts = [
      field.description,
      mustFill(field) ? t("required") : null,
      fallback !== null ? t("default", { value: fallback }) : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(" · ") : undefined;
  };

  return (
    <div className={styles.fields}>
      {fields.map((field) => {
        const id = `${idPrefix}-${field.id}`;
        const value = state[field.id];
        const text = typeof value === "string" ? value : "";
        // Own lines only: a setting may be called `constructor`.
        const error = Object.hasOwn(errors, field.id)
          ? errors[field.id]
          : undefined;
        const hint = hintOf(field);
        const required = mustFill(field);

        switch (field.type) {
          case "boolean":
            return (
              <div key={field.id} className={styles.check}>
                <label className={styles.checkLabel} htmlFor={id}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={value === true}
                    disabled={disabled}
                    onChange={(e) => onChange(field.id, e.target.checked)}
                  />
                  <span>{field.label}</span>
                </label>
                {field.description && (
                  <span className={styles.checkHint}>{field.description}</span>
                )}
                {error && (
                  <span className={styles.checkError} role="alert">
                    {error}
                  </span>
                )}
              </div>
            );

          case "textarea":
            return (
              <Textarea
                key={field.id}
                id={id}
                label={field.label}
                hint={hint}
                error={error}
                value={text}
                rows={4}
                maxLength={field.maxLength ?? undefined}
                placeholder={field.placeholder ?? undefined}
                required={required}
                disabled={disabled}
                onChange={(e) => onChange(field.id, e.target.value)}
              />
            );

          case "select":
            return (
              <Select
                key={field.id}
                id={id}
                label={field.label}
                hint={hint}
                error={error}
                value={text}
                required={required}
                disabled={disabled}
                onChange={(e) => onChange(field.id, e.target.value)}
              >
                {/* A choice left empty means the default; without one it is "not set", or has to be made. */}
                {field.default === null && (
                  <option value="" disabled={required}>
                    {required ? t("choose") : t("notSet")}
                  </option>
                )}
                {field.options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            );

          case "number":
            return (
              <Input
                key={field.id}
                id={id}
                variant="number"
                label={field.label}
                hint={hint}
                error={error}
                value={text}
                min={field.min ?? undefined}
                max={field.max ?? undefined}
                step={field.integer ? 1 : "any"}
                aria-invalid={error ? true : undefined}
                required={required}
                disabled={disabled}
                onChange={(e) => onChange(field.id, e.target.value)}
              />
            );

          // A single line of text: the last type, so that every path returns.
          default:
            return (
              <Input
                key={field.id}
                id={id}
                variant={field.format ?? "text"}
                label={field.label}
                hint={hint}
                error={error}
                value={text}
                maxLength={field.maxLength ?? undefined}
                placeholder={field.placeholder ?? undefined}
                aria-invalid={error ? true : undefined}
                required={required}
                disabled={disabled}
                autoComplete="off"
                onChange={(e) => onChange(field.id, e.target.value)}
              />
            );
        }
      })}
    </div>
  );
}
