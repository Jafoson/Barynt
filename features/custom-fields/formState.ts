import type { DefinitionIssue } from "@/lib/custom-fields/config";
import {
  CUSTOM_FIELD_TYPES,
  type CustomFieldType,
  DEFAULT_TEXT_LENGTH,
  type NumberConfig,
  type SelectConfig,
  type SelectOption,
  type TextConfig,
} from "@/lib/custom-fields/types";
import type { CustomFieldRow } from "./types";

// What a field's form holds while someone types, and what it hands to the action. Pure: no React, so
// the conversions are tested on their own. A number is kept as the text of its box (a half-typed
// number is not one yet); an empty box means "no limit", never zero. Every option carries a local
// `uid` for its row (the label is not unique while it is being typed), and the `id` it already has,
// which is what values store and which must survive a rename.

export interface OptionForm {
  /** Only for the list: a key that does not change while the label is typed. */
  uid: string;
  /** The id the option already has; `null` for one that was just added (the server makes it). */
  id: string | null;
  label: string;
  color: string | null;
}

export interface FieldForm {
  name: string;
  /** Empty = made of the name. Only asked for on a new field. */
  key: string;
  type: CustomFieldType;
  description: string;
  /** One of the icons of the list, or `null` for the icon of the type. */
  icon: string | null;
  maxLength: string;
  integer: boolean;
  min: string;
  max: string;
  options: OptionForm[];
}

let nextUid = 0;
/** A key for an option's row in the list. */
export function optionUid(): string {
  nextUid += 1;
  return `option-${nextUid}`;
}

const numberText = (value: number | null): string =>
  value === null ? "" : String(value);

/** The form for a new field, or for changing one that exists. */
export function initialForm(field?: CustomFieldRow): FieldForm {
  const empty: FieldForm = {
    name: "",
    key: "",
    type: "text",
    description: "",
    icon: null,
    maxLength: String(DEFAULT_TEXT_LENGTH),
    integer: false,
    min: "",
    max: "",
    options: [],
  };
  if (!field) return empty;

  const form: FieldForm = {
    ...empty,
    name: field.name,
    key: field.key,
    type: field.type,
    description: field.description,
    icon: field.icon,
  };
  if (field.type === "text") {
    form.maxLength = String((field.config as TextConfig).maxLength);
  } else if (field.type === "number") {
    const config = field.config as NumberConfig;
    form.integer = config.integer;
    form.min = numberText(config.min);
    form.max = numberText(config.max);
  } else if (field.type === "select") {
    form.options = (field.config as SelectConfig).options.map(
      (option: SelectOption) => ({
        uid: optionUid(),
        id: option.id,
        label: option.label,
        color: option.color,
      }),
    );
  }
  return form;
}

/** A box's text as a number: empty is `null` (no limit), and text that is not a number stays one the server refuses. */
function boundOf(text: string): number | null {
  const trimmed = text.trim();
  return trimmed === "" ? null : Number(trimmed);
}

/** The `config` the action is given, for the type the form is of. */
export function configOf(form: FieldForm): Record<string, unknown> {
  switch (form.type) {
    case "text": {
      const length = boundOf(form.maxLength);
      // An empty box means what the type starts from.
      return length === null ? {} : { maxLength: length };
    }
    case "number":
      return {
        integer: form.integer,
        min: boundOf(form.min),
        max: boundOf(form.max),
      };
    case "select":
      return {
        options: form.options.map((option) => ({
          ...(option.id ? { id: option.id } : {}),
          label: option.label,
          color: option.color,
        })),
      };
    default:
      return {};
  }
}

/** What a new field is created with. */
export function toCreateInput(form: FieldForm) {
  return {
    name: form.name,
    key: form.key.trim() === "" ? undefined : form.key.trim(),
    description: form.description,
    icon: form.icon,
    type: form.type,
    config: configOf(form),
  };
}

/** What changing a field hands over: the key and the type are not part of it. */
export function toChangeInput(form: FieldForm) {
  return {
    name: form.name,
    description: form.description,
    icon: form.icon,
    config: configOf(form),
  };
}

/** Whether the form differs from what it started as, so Save can stay off. */
export function isDirty(start: FieldForm, now: FieldForm): boolean {
  return (
    JSON.stringify(withoutUids(start)) !== JSON.stringify(withoutUids(now))
  );
}

function withoutUids(form: FieldForm) {
  return {
    ...form,
    options: form.options.map(({ uid: _uid, ...option }) => option),
  };
}

/** The types the picker offers, in order. */
export const TYPE_CHOICES: readonly CustomFieldType[] = CUSTOM_FIELD_TYPES;

/** The problems by part of the form: the first of each, and a part that is none of the form's goes under the config. */
export function groupIssues(
  issues: readonly DefinitionIssue[] | undefined,
): Record<string, string> {
  const byPart: Record<string, string> = {};
  for (const issue of issues ?? []) {
    if (!Object.hasOwn(byPart, issue.path)) {
      byPart[issue.path] =
        issue.message.charAt(0).toUpperCase() + issue.message.slice(1);
    }
  }
  return byPart;
}
