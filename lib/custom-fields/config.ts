import { slugify } from "@/lib/slug";
import {
  type ConfigByType,
  type CustomFieldConfig,
  type CustomFieldType,
  DEFAULT_TEXT_LENGTH,
  FIELD_KEY_PATTERN,
  isCustomFieldType,
  MAX_FIELD_DESCRIPTION_LENGTH,
  MAX_FIELD_KEY_LENGTH,
  MAX_FIELD_NAME_LENGTH,
  MAX_OPTION_LABEL_LENGTH,
  MAX_SELECT_OPTIONS,
  MAX_TEXT_LENGTH,
  MIN_FIELD_KEY_LENGTH,
  OPTION_ID_PATTERN,
  type SelectOption,
} from "./types";

// What a definition is made of, checked and put in its normal form: the name, the key, the
// description and the `config` of its type. Pure, so the action that writes a definition, the
// API, a plugin's manifest and the tests all apply the same rules. Input is untrusted: every
// check reports and none throws.

/** A problem with a definition, saying which part it is about (`""` for the whole). */
export interface DefinitionIssue {
  path: string;
  message: string;
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  (Object.getPrototypeOf(value) === Object.prototype ||
    Object.getPrototypeOf(value) === null);

// A control character other than a tab: never part of a name, a label or a text.
// biome-ignore lint/suspicious/noControlCharactersInRegex: this is exactly what is refused
const CONTROL = /[\u0000-\u001f\u007f]/;

/** The config a type has when nothing is said: the ones a form starts from. */
export function defaultFieldConfig<T extends CustomFieldType>(
  type: T,
): ConfigByType[T];
export function defaultFieldConfig(type: CustomFieldType): CustomFieldConfig {
  switch (type) {
    case "text":
      return { maxLength: DEFAULT_TEXT_LENGTH };
    case "number":
      return { integer: false, min: null, max: null };
    case "select":
      return { options: [] };
    default:
      return {};
  }
}

// ─── Options of a `select` ──────────────────────────────────────────────────

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * An id for a new option: its label as a slug, a number after it while that is taken. The id
 * is what values store, so it never changes when the option is renamed.
 */
export function newOptionId(label: string, taken: ReadonlySet<string>): string {
  const base = slugify(label).slice(0, 28).replace(/-$/, "") || "option";
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/**
 * The options as a person or a client gives them: an option that has an `id` keeps it (values
 * refer to it), one without gets a new one. Labels are trimmed, and neither an id nor a label
 * (whatever the case) may be there twice.
 */
export function normalizeOptions(
  input: unknown,
): { ok: true; options: SelectOption[] } | { ok: false; message: string } {
  if (!Array.isArray(input)) {
    return { ok: false, message: "options must be a list" };
  }
  if (input.length === 0) {
    return { ok: false, message: "a choice needs at least one option" };
  }
  if (input.length > MAX_SELECT_OPTIONS) {
    return {
      ok: false,
      message: `at most ${MAX_SELECT_OPTIONS} options`,
    };
  }

  const kept: { id: string | null; label: string; color: string | null }[] = [];
  const ids = new Set<string>();
  const labels = new Set<string>();
  for (const raw of input) {
    if (!isPlainObject(raw)) {
      return { ok: false, message: "an option must be an object" };
    }
    const unknown = Object.keys(raw).find(
      (key) => key !== "id" && key !== "label" && key !== "color",
    );
    if (unknown) {
      return { ok: false, message: `an option has no "${unknown}"` };
    }
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    if (!label) return { ok: false, message: "every option needs a label" };
    if (label.length > MAX_OPTION_LABEL_LENGTH || CONTROL.test(label)) {
      return {
        ok: false,
        message: `an option's label is at most ${MAX_OPTION_LABEL_LENGTH} characters, on one line`,
      };
    }
    if (labels.has(label.toLowerCase())) {
      return { ok: false, message: `"${label}" is there twice` };
    }
    labels.add(label.toLowerCase());

    let id: string | null = null;
    if (raw.id !== undefined && raw.id !== null) {
      if (typeof raw.id !== "string" || !OPTION_ID_PATTERN.test(raw.id)) {
        return {
          ok: false,
          message: "an option's id is lowercase letters, digits and dashes",
        };
      }
      if (ids.has(raw.id)) {
        return { ok: false, message: `the id "${raw.id}" is there twice` };
      }
      ids.add(raw.id);
      id = raw.id;
    }

    let color: string | null = null;
    if (raw.color !== undefined && raw.color !== null) {
      if (typeof raw.color !== "string" || !HEX_COLOR.test(raw.color)) {
        return { ok: false, message: "an option's color is #rrggbb" };
      }
      color = raw.color.toLowerCase();
    }
    kept.push({ id, label, color });
  }

  const options: SelectOption[] = kept.map((option) => {
    if (option.id)
      return { id: option.id, label: option.label, color: option.color };
    const id = newOptionId(option.label, ids);
    ids.add(id);
    return { id, label: option.label, color: option.color };
  });
  return { ok: true, options };
}

// ─── The config of a type ───────────────────────────────────────────────────

export type ConfigResult =
  | { ok: true; config: CustomFieldConfig }
  | { ok: false; message: string };

function only(
  raw: Record<string, unknown>,
  allowed: readonly string[],
): string | null {
  const unknown = Object.keys(raw).find((key) => !allowed.includes(key));
  return unknown ? `"${unknown}" is not a setting of this type` : null;
}

const isBound = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

/**
 * A `config` as the type allows it, in its normal form (every part there, the defaults filled
 * in), or why not. What the type does not have is refused, not ignored: a client that sends it is
 * not the form. `undefined` and `null` are "nothing said", which is the type's defaults, except
 * for a `select` that has to say its options.
 */
export function parseFieldConfig(
  type: CustomFieldType,
  raw: unknown,
): ConfigResult {
  const said = raw ?? {};
  if (!isPlainObject(said)) {
    return { ok: false, message: "the settings must be an object" };
  }

  switch (type) {
    case "text": {
      const extra = only(said, ["maxLength"]);
      if (extra) return { ok: false, message: extra };
      const length = said.maxLength ?? DEFAULT_TEXT_LENGTH;
      // `typeof` first so the number is one to TypeScript; `Number.isInteger` never says yes to a text.
      if (
        typeof length !== "number" ||
        !Number.isInteger(length) ||
        length < 1 ||
        length > MAX_TEXT_LENGTH
      ) {
        return {
          ok: false,
          message: `the length is a whole number from 1 to ${MAX_TEXT_LENGTH}`,
        };
      }
      return { ok: true, config: { maxLength: length } };
    }
    case "number": {
      const extra = only(said, ["integer", "min", "max"]);
      if (extra) return { ok: false, message: extra };
      const integer = said.integer ?? false;
      if (typeof integer !== "boolean") {
        return { ok: false, message: "whole numbers only is yes or no" };
      }
      const min = said.min ?? null;
      const max = said.max ?? null;
      if ((min !== null && !isBound(min)) || (max !== null && !isBound(max))) {
        return { ok: false, message: "the range is made of numbers" };
      }
      if (min !== null && max !== null && min > max) {
        return {
          ok: false,
          message: "the smallest value is above the largest",
        };
      }
      if (
        integer &&
        [min, max].some(
          (bound) => bound !== null && !Number.isSafeInteger(bound),
        )
      ) {
        return {
          ok: false,
          message: "whole numbers only needs a range of whole numbers",
        };
      }
      return { ok: true, config: { integer, min, max } };
    }
    case "select": {
      const extra = only(said, ["options"]);
      if (extra) return { ok: false, message: extra };
      const result = normalizeOptions(said.options);
      return result.ok
        ? { ok: true, config: { options: result.options } }
        : result;
    }
    default: {
      const extra = only(said, []);
      if (extra) return { ok: false, message: extra };
      return { ok: true, config: {} };
    }
  }
}

/**
 * A stored `config` for reading: the normal form if it is one, else what the type starts from.
 * Never throws and never refuses: a definition that was written by an older version, or by
 * hand, must not make an issue unreadable. (A `select` whose options were lost has none, so no
 * value can be chosen, and the values it holds are still shown as they are.)
 */
export function fieldConfigOrDefault(
  type: CustomFieldType,
  stored: unknown,
): CustomFieldConfig {
  const result = parseFieldConfig(type, stored);
  return result.ok ? result.config : defaultFieldConfig(type);
}

// ─── The name, the key and the description ──────────────────────────────────

/**
 * A key for a name, the way an address is made of a title: lowercase letters, digits and dashes,
 * starting with a letter (a name that starts with a digit, or is no letters at all, gets `field-`
 * in front) and long enough to be a key.
 */
export function deriveFieldKey(name: string): string {
  const slug = slugify(name);
  let key = /^[a-z]/.test(slug) ? slug : `field-${slug || "x"}`;
  key = key.slice(0, MAX_FIELD_KEY_LENGTH).replace(/-+$/, "");
  return key.length >= MIN_FIELD_KEY_LENGTH ? key : `field-${key}`;
}

export function isFieldKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= MIN_FIELD_KEY_LENGTH &&
    value.length <= MAX_FIELD_KEY_LENGTH &&
    FIELD_KEY_PATTERN.test(value)
  );
}

export interface DefinitionInput {
  name: unknown;
  /** Left out, it is made of the name. */
  key?: unknown;
  description?: unknown;
  type: unknown;
  config?: unknown;
}

export interface Definition {
  name: string;
  key: string;
  description: string;
  type: CustomFieldType;
  config: CustomFieldConfig;
}

/**
 * A definition as it is written: every part checked, the config in the normal form of its type,
 * all the problems at once (never thrown). The place where it applies is not part of it: that is
 * the caller's, with the permission to write there.
 */
export function parseDefinition(
  input: DefinitionInput,
):
  | { ok: true; definition: Definition }
  | { ok: false; issues: DefinitionIssue[] } {
  const issues: DefinitionIssue[] = [];

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) {
    issues.push({ path: "name", message: "is required" });
  } else if (name.length > MAX_FIELD_NAME_LENGTH || CONTROL.test(name)) {
    issues.push({
      path: "name",
      message: `is at most ${MAX_FIELD_NAME_LENGTH} characters, on one line`,
    });
  }

  let key = "";
  if (input.key === undefined || input.key === null || input.key === "") {
    key = name ? deriveFieldKey(name) : "";
  } else if (isFieldKey(input.key)) {
    key = input.key;
  } else {
    issues.push({
      path: "key",
      message: `is ${MIN_FIELD_KEY_LENGTH} to ${MAX_FIELD_KEY_LENGTH} lowercase letters, digits and single dashes, starting with a letter`,
    });
  }

  const description =
    input.description === undefined || input.description === null
      ? ""
      : input.description;
  if (typeof description !== "string") {
    issues.push({ path: "description", message: "must be text" });
  } else if (
    description.trim().length > MAX_FIELD_DESCRIPTION_LENGTH ||
    CONTROL.test(description.replace(/\n/g, ""))
  ) {
    issues.push({
      path: "description",
      message: `is at most ${MAX_FIELD_DESCRIPTION_LENGTH} characters`,
    });
  }

  let type: CustomFieldType | null = null;
  let config: CustomFieldConfig | null = null;
  if (isCustomFieldType(input.type)) {
    type = input.type;
    const parsed = parseFieldConfig(type, input.config);
    if (parsed.ok) config = parsed.config;
    else issues.push({ path: "config", message: parsed.message });
  } else {
    issues.push({ path: "type", message: "is not a type of field" });
  }

  if (issues.length > 0 || type === null || config === null) {
    return { ok: false, issues };
  }
  return {
    ok: true,
    definition: {
      name,
      key,
      description: typeof description === "string" ? description.trim() : "",
      type,
      config,
    },
  };
}
