import { resolveText } from "./localized";
import type { PluginManifest, SettingDefinition } from "./manifest";

// The settings a plugin declares in its manifest (`contributes.settings`) and the values
// people give them. Pure, no database and no React: the host checks every value that is
// saved against the definition, the pages turn the definitions into a form, and the tests
// read the same rules. **A value is data and never code**: it is a string, a number or a
// yes/no, checked here, and what does not fit is refused when it is saved and falls back to
// the default when it is read (a plugin update can change what a setting accepts).
//
// The manifest's definitions are turned into *fields* once (`toFields`): a field is what a
// setting is for everyone who works with it, the words in one language and every bound
// spelled out, so the checks, the form and what a page hands to the browser are one shape.
//
// No secrets: a password or a token needs sealed storage (BARY-85), which a plain
// setting is not.

export type SettingValue = string | number | boolean;

/** Every value a level stores, as JSON: a bound so a form cannot fill the database. */
export const MAX_SETTINGS_BYTES = 65_536;

/** How long a `text` and a `textarea` value may be when the definition does not say. */
export const DEFAULT_TEXT_LENGTH = 200;
export const DEFAULT_TEXTAREA_LENGTH = 1000;

/** A setting as the checks and a form see it: the words in one language, nothing left implicit. */
export interface SettingField {
  id: string;
  type: SettingDefinition["type"];
  label: string;
  description: string | null;
  required: boolean;
  placeholder: string | null;
  format: "url" | "email" | null;
  /** For a text and a long text; `null` for the others. */
  maxLength: number | null;
  min: number | null;
  max: number | null;
  integer: boolean;
  options: { value: string; label: string }[];
  default: SettingValue | null;
}

/** What a form needs to show the settings of one plugin at one level. */
export interface SettingsForm {
  fields: SettingField[];
  /** The value of every field now: what is stored, else the default, else `null`. */
  values: Record<string, SettingValue | null>;
}

export interface SettingsIssue {
  /** The setting the problem is about; `""` for the whole set of values. */
  id: string;
  message: string;
}

export type SettingsResult =
  | { ok: true; values: Record<string, SettingValue> }
  | { ok: false; issues: SettingsIssue[] };

/** The settings a manifest declares, in the order it lists them. */
export function settingsOf(
  manifest: Pick<PluginManifest, "contributes">,
): SettingDefinition[] {
  return manifest.contributes.settings ?? [];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

/** The default a definition declares, or `null` when it declares none. A yes/no is never "not set". */
function declaredDefault(def: SettingDefinition): SettingValue | null {
  if (def.default !== undefined) return def.default;
  return def.type === "boolean" ? false : null;
}

/** The definitions as fields, with the words for `locale`. */
export function toFields(
  defs: readonly SettingDefinition[],
  locale: string,
): SettingField[] {
  return defs.map((def) => ({
    id: def.id,
    type: def.type,
    label: resolveText(def.label, locale),
    description: def.description ? resolveText(def.description, locale) : null,
    // A yes/no always has a value.
    required: def.type !== "boolean" && def.required === true,
    placeholder:
      (def.type === "text" || def.type === "textarea") && def.placeholder
        ? resolveText(def.placeholder, locale)
        : null,
    format: def.type === "text" ? (def.format ?? null) : null,
    maxLength:
      def.type === "text"
        ? (def.maxLength ?? DEFAULT_TEXT_LENGTH)
        : def.type === "textarea"
          ? (def.maxLength ?? DEFAULT_TEXTAREA_LENGTH)
          : null,
    min: def.type === "number" ? (def.min ?? null) : null,
    max: def.type === "number" ? (def.max ?? null) : null,
    integer: def.type === "number" ? def.integer === true : false,
    options:
      def.type === "select"
        ? def.options.map((option) => ({
            value: option.value,
            label: resolveText(option.label, locale),
          }))
        : [],
    default: declaredDefault(def),
  }));
}

/** A control character other than tab and newline. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: this is exactly what is refused
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function checkFormat(format: "url" | "email", value: string): string | null {
  if (format === "email") {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? null
      : "must be an email address";
  }
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "must be an http:// or https:// address";
    }
    if (url.username || url.password) {
      return "must not contain a user name or a password";
    }
    return null;
  } catch {
    return "must be a full web address";
  }
}

/**
 * What is wrong with `value` for the setting `field`, as one short phrase, or `null` when it
 * fits. Empty values are not looked at here: they mean "not set", see `validateSettings`.
 */
export function checkSettingValue(
  field: SettingField,
  value: unknown,
): string | null {
  switch (field.type) {
    case "boolean":
      return typeof value === "boolean" ? null : "must be yes or no";
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return "must be a number";
      }
      if (field.integer && !Number.isInteger(value)) {
        return "must be a whole number";
      }
      if (field.min !== null && value < field.min) {
        return `must be at least ${field.min}`;
      }
      if (field.max !== null && value > field.max) {
        return `must be at most ${field.max}`;
      }
      return null;
    }
    case "select":
      return typeof value === "string" &&
        field.options.some((option) => option.value === value)
        ? null
        : "must be one of the choices";
    case "text":
    case "textarea": {
      if (typeof value !== "string") return "must be text";
      if (field.maxLength !== null && value.length > field.maxLength) {
        return `must be at most ${field.maxLength} characters`;
      }
      if (field.type === "text" && /[\n\r]/.test(value)) {
        return "must be on one line";
      }
      if (CONTROL.test(value)) return "must not contain control characters";
      if (field.format) return checkFormat(field.format, value);
      return null;
    }
  }
}

/** The value a text is stored as: trimmed, so " a " and "a" are one value. */
const normalized = (field: SettingField, value: unknown): unknown =>
  (field.type === "text" || field.type === "textarea") &&
  typeof value === "string"
    ? value.trim()
    : value;

/**
 * Checks what someone wants to save and gives back what is stored: only the settings that
 * differ from their default (so a plugin update that changes a default reaches everyone who
 * never chose one). `input` is a plain object; a key that is not one of `fields` is refused, not
 * ignored (a client that sends one is not the form), and so is a value that does not fit. A
 * value that is missing, `null` or an empty text is "not set", which a required setting without
 * a default does not allow. Reports every problem, never throws.
 */
export function validateSettings(
  fields: readonly SettingField[],
  input: unknown,
): SettingsResult {
  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ id: "", message: "must be an object" }] };
  }
  const issues: SettingsIssue[] = [];
  const known = new Set(fields.map((field) => field.id));
  for (const key of Object.keys(input)) {
    if (!known.has(key)) {
      issues.push({ id: key, message: "is not a setting of this plugin" });
    }
  }

  const values: Record<string, SettingValue> = {};
  for (const field of fields) {
    const given = Object.hasOwn(input, field.id) ? input[field.id] : undefined;
    const value = normalized(field, given);
    const empty = value === undefined || value === null || value === "";
    if (empty) {
      if (field.required && field.default === null) {
        issues.push({ id: field.id, message: "is required" });
      }
      continue;
    }
    const problem = checkSettingValue(field, value);
    if (problem) {
      issues.push({ id: field.id, message: problem });
      continue;
    }
    // Only what differs from the default is kept.
    if (value !== field.default) values[field.id] = value as SettingValue;
  }

  if (
    issues.length === 0 &&
    JSON.stringify(values).length > MAX_SETTINGS_BYTES
  ) {
    issues.push({ id: "", message: "is too large" });
  }
  return issues.length > 0 ? { ok: false, issues } : { ok: true, values };
}

/**
 * The value each setting has now: what is stored when it still fits the field, otherwise
 * the default, otherwise `null` (not set). `stored` is whatever the database holds; anything
 * that is not an object counts as nothing stored. Never throws.
 */
export function resolveSettings(
  fields: readonly SettingField[],
  stored: unknown,
): Record<string, SettingValue | null> {
  const have = isPlainObject(stored) ? stored : {};
  const result: Record<string, SettingValue | null> = {};
  for (const field of fields) {
    const value = Object.hasOwn(have, field.id) ? have[field.id] : undefined;
    result[field.id] =
      value !== undefined && checkSettingValue(field, value) === null
        ? (value as SettingValue)
        : field.default;
  }
  return result;
}

/** The fields and their values now, for a form. */
export function settingsForm(
  fields: readonly SettingField[],
  stored: unknown,
): SettingsForm {
  return { fields: [...fields], values: resolveSettings(fields, stored) };
}

/**
 * Whether two sets of stored values are the same, whatever order their keys are in. Only what
 * `validateSettings` gives back is compared (flat, strings, numbers and yes/nos).
 */
export function sameSettings(a: unknown, b: unknown): boolean {
  const left = isPlainObject(a) ? a : {};
  const right = isPlainObject(b) ? b : {};
  const keys = Object.keys(left);
  return (
    keys.length === Object.keys(right).length &&
    keys.every((key) => Object.hasOwn(right, key) && left[key] === right[key])
  );
}

/** The keys whose value differs between two sets, sorted: what a change touched. */
export function changedSettings(before: unknown, after: unknown): string[] {
  const left = isPlainObject(before) ? before : {};
  const right = isPlainObject(after) ? after : {};
  return [...new Set([...Object.keys(left), ...Object.keys(right)])]
    .filter((key) => left[key] !== right[key])
    .sort();
}
