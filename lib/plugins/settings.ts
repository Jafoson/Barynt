import { resolveText } from "./localized";
import type { PluginManifest, SettingDefinition } from "./manifest";

// The settings a plugin declares in its manifest (`contributes.settings`) and the values
// people give them. Pure, no database and no React: the host checks every value that is
// saved against the definition, the pages turn the definitions into a form, and the tests
// read the same rules. **A value is data and never code**: it is a string, a number or a
// yes/no, checked here, and what does not fit is refused when it is saved and falls back to
// the default when it is read (a plugin update can change what a setting accepts).
//
// No secrets: a password or a token needs sealed storage (BARY-85), which a plain
// setting is not.

export type SettingValue = string | number | boolean;

/** Every value a level stores, as JSON: a bound so a form cannot fill the database. */
export const MAX_SETTINGS_BYTES = 65_536;

/** How long a `text` and a `textarea` value may be when the definition does not say. */
export const DEFAULT_TEXT_LENGTH = 200;
export const DEFAULT_TEXTAREA_LENGTH = 1000;

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

/** A control character other than tab and newline. */
// biome-ignore lint/suspicious/noControlCharactersInRegex: this is exactly what is refused
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/;

function maxLengthOf(def: SettingDefinition): number {
  if (def.type === "text") return def.maxLength ?? DEFAULT_TEXT_LENGTH;
  if (def.type === "textarea") return def.maxLength ?? DEFAULT_TEXTAREA_LENGTH;
  return 0;
}

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
 * What is wrong with `value` for the setting `def`, as one short phrase, or `null` when it
 * fits. Empty values are not looked at here: they mean "not set", see `validateSettings`.
 */
export function checkSettingValue(
  def: SettingDefinition,
  value: unknown,
): string | null {
  switch (def.type) {
    case "boolean":
      return typeof value === "boolean" ? null : "must be yes or no";
    case "number": {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return "must be a number";
      }
      if (def.integer && !Number.isInteger(value)) {
        return "must be a whole number";
      }
      if (def.min !== undefined && value < def.min) {
        return `must be at least ${def.min}`;
      }
      if (def.max !== undefined && value > def.max) {
        return `must be at most ${def.max}`;
      }
      return null;
    }
    case "select":
      return typeof value === "string" &&
        def.options.some((option) => option.value === value)
        ? null
        : "must be one of the choices";
    case "text":
    case "textarea": {
      if (typeof value !== "string") return "must be text";
      if (value.length > maxLengthOf(def)) {
        return `must be at most ${maxLengthOf(def)} characters`;
      }
      if (def.type === "text" && /[\n\r]/.test(value)) {
        return "must be on one line";
      }
      if (CONTROL.test(value)) return "must not contain control characters";
      if (def.type === "text" && def.format) {
        return checkFormat(def.format, value);
      }
      return null;
    }
  }
}

/** The default a definition declares, or `null` when it declares none. */
export function defaultOf(def: SettingDefinition): SettingValue | null {
  if (def.default !== undefined) return def.default;
  // A yes/no is never "not set".
  return def.type === "boolean" ? false : null;
}

const isRequired = (def: SettingDefinition): boolean =>
  def.type !== "boolean" && def.required === true;

/** The value a text is stored as: trimmed, so " a " and "a" are one value. */
const normalized = (def: SettingDefinition, value: unknown): unknown =>
  (def.type === "text" || def.type === "textarea") && typeof value === "string"
    ? value.trim()
    : value;

/**
 * Checks what someone wants to save and gives back what is stored: only the settings that
 * differ from their default (so a plugin update that changes a default reaches everyone who
 * never chose one). `input` is a plain object; a key that is not one of `defs` is refused, not
 * ignored (a client that sends one is not the form), and so is a value that does not fit. A
 * value that is missing, `null` or an empty text is "not set", which a required setting without
 * a default does not allow. Reports every problem, never throws.
 */
export function validateSettings(
  defs: readonly SettingDefinition[],
  input: unknown,
): SettingsResult {
  if (!isPlainObject(input)) {
    return { ok: false, issues: [{ id: "", message: "must be an object" }] };
  }
  const issues: SettingsIssue[] = [];
  const known = new Set(defs.map((def) => def.id));
  for (const key of Object.keys(input)) {
    if (!known.has(key)) {
      issues.push({ id: key, message: "is not a setting of this plugin" });
    }
  }

  const values: Record<string, SettingValue> = {};
  for (const def of defs) {
    const given = Object.hasOwn(input, def.id) ? input[def.id] : undefined;
    const value = normalized(def, given);
    const empty = value === undefined || value === null || value === "";
    if (empty) {
      if (isRequired(def) && defaultOf(def) === null) {
        issues.push({ id: def.id, message: "is required" });
      }
      continue;
    }
    const problem = checkSettingValue(def, value);
    if (problem) {
      issues.push({ id: def.id, message: problem });
      continue;
    }
    // Only what differs from the default is kept.
    if (value !== defaultOf(def)) values[def.id] = value as SettingValue;
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
 * The value each setting has now: what is stored when it still fits the definition, otherwise
 * the default, otherwise `null` (not set). `stored` is whatever the database holds; anything
 * that is not an object counts as nothing stored. Never throws.
 */
export function resolveSettings(
  defs: readonly SettingDefinition[],
  stored: unknown,
): Record<string, SettingValue | null> {
  const have = isPlainObject(stored) ? stored : {};
  const result: Record<string, SettingValue | null> = {};
  for (const def of defs) {
    const value = Object.hasOwn(have, def.id) ? have[def.id] : undefined;
    result[def.id] =
      value !== undefined && checkSettingValue(def, value) === null
        ? (value as SettingValue)
        : defaultOf(def);
  }
  return result;
}

// ─── What a form needs ──────────────────────────────────────────────────────

/** A setting as a form shows it: the words in one language, no manifest types. */
export interface SettingField {
  id: string;
  type: SettingDefinition["type"];
  label: string;
  description: string | null;
  required: boolean;
  placeholder: string | null;
  format: "url" | "email" | null;
  maxLength: number | null;
  min: number | null;
  max: number | null;
  integer: boolean;
  options: { value: string; label: string }[];
  default: SettingValue | null;
}

/** The definitions as form fields, with the words for `locale`. */
export function toFields(
  defs: readonly SettingDefinition[],
  locale: string,
): SettingField[] {
  return defs.map((def) => ({
    id: def.id,
    type: def.type,
    label: resolveText(def.label, locale),
    description: def.description ? resolveText(def.description, locale) : null,
    required: isRequired(def),
    placeholder:
      (def.type === "text" || def.type === "textarea") && def.placeholder
        ? resolveText(def.placeholder, locale)
        : null,
    format: def.type === "text" ? (def.format ?? null) : null,
    maxLength:
      def.type === "text" || def.type === "textarea" ? maxLengthOf(def) : null,
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
    default: defaultOf(def),
  }));
}
