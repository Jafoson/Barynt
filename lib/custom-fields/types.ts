// ─── Custom fields: what they are (BARY-79) ─────────────────────────────────
//
// Dependency-free: no database, no `server-only`, no React, the same reasoning as
// `features/projects/detail-fields.ts`. The server needs the list of types to validate what
// is written, the UI needs it to offer the choice and to draw a value, the API and the MCP
// tools need it to describe the fields. Four readers, one source of truth.
//
// A **definition** says what a field is (a name, a type, what the type allows) and where it
// applies (the whole workspace, or one project). A **value** is one issue's answer to a
// definition. The types are a `const` tuple like the dashboard's widgets, not a database
// enum: adding a type is a change in code and a migration of nothing.

export const CUSTOM_FIELD_TYPES = [
  "text",
  "number",
  "select",
  "date",
  "user",
  "url",
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

/** Is this a type that exists? Filters what comes from the database or a client. */
export function isCustomFieldType(value: unknown): value is CustomFieldType {
  return (
    typeof value === "string" &&
    (CUSTOM_FIELD_TYPES as readonly string[]).includes(value)
  );
}

/** Icon of each type, in the picker and next to a field's name. */
export const CUSTOM_FIELD_TYPE_ICONS: Record<CustomFieldType, string> = {
  text: "lucide:type",
  number: "lucide:hash",
  select: "lucide:list",
  date: "lucide:calendar",
  user: "lucide:user-round",
  url: "lucide:link",
};

// ─── Limits ─────────────────────────────────────────────────────────────────
//
// Every one of them is a bound on what a person (or a plugin, or an API client) can put in the
// database, checked where the value is written.

/** How many definitions a workspace can have, its projects' included. */
export const MAX_CUSTOM_FIELDS_PER_WORKSPACE = 100;
export const MAX_FIELD_NAME_LENGTH = 60;
export const MAX_FIELD_DESCRIPTION_LENGTH = 200;
/** A field's key: what the API and a plugin's manifest call it. */
export const FIELD_KEY_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
export const MIN_FIELD_KEY_LENGTH = 2;
export const MAX_FIELD_KEY_LENGTH = 40;
export const MAX_SELECT_OPTIONS = 50;
export const MAX_OPTION_LABEL_LENGTH = 60;
/** What an option is called inside the database, stable when its label is changed. */
export const OPTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** How long a `text` value may be when the definition does not say (and at most). */
export const DEFAULT_TEXT_LENGTH = 200;
export const MAX_TEXT_LENGTH = 1000;
/** A `url` value. */
export const MAX_URL_LENGTH = 2000;

// ─── What a type allows (a definition's `config`) ───────────────────────────

export interface SelectOption {
  /** Stable: what a value stores. Renaming the option changes its label, never its id. */
  id: string;
  label: string;
  /** `#rrggbb`, or `null` for none. */
  color: string | null;
}

export interface TextConfig {
  maxLength: number;
}
export interface NumberConfig {
  integer: boolean;
  min: number | null;
  max: number | null;
}
export interface SelectConfig {
  options: SelectOption[];
}
/** The types that allow nothing more than themselves. */
export type PlainConfig = Record<string, never>;

export interface ConfigByType {
  text: TextConfig;
  number: NumberConfig;
  select: SelectConfig;
  date: PlainConfig;
  user: PlainConfig;
  url: PlainConfig;
}

export type CustomFieldConfig = ConfigByType[CustomFieldType];

// ─── A value ────────────────────────────────────────────────────────────────

/**
 * What a value is, on the outside (the UI, the API, a plugin): a text and a `url` are their
 * string, a number is a number, a `select` is the option's id, a `date` is `YYYY-MM-DD`, a
 * `user` is the user's id. "No value" is `null`, never an empty string or zero.
 */
export type FieldValue = string | number;

/**
 * What a value is inside the database: one typed column for each kind, so a filter is an
 * indexed comparison rather than a look into JSON. Exactly the column of the field's type is
 * set (`VALUE_COLUMN`), the others are `null`.
 */
export interface ValueColumns {
  text: string | null;
  number: number | null;
  /** A day, stamped at noon UTC like an issue's due date, so it never slips to another day. */
  date: Date | null;
  userId: string | null;
}

/** Which column holds a type's value. */
export const VALUE_COLUMN: Record<CustomFieldType, keyof ValueColumns> = {
  text: "text",
  url: "text",
  select: "text",
  number: "number",
  date: "date",
  user: "userId",
};

/** What the checks need to know of a field: its type and what the type allows. */
export interface FieldShape {
  type: CustomFieldType;
  config: CustomFieldConfig;
}
