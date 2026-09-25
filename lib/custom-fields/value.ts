import {
  type CustomFieldType,
  type FieldShape,
  type FieldValue,
  MAX_URL_LENGTH,
  type NumberConfig,
  type SelectConfig,
  type TextConfig,
  VALUE_COLUMN,
  type ValueColumns,
} from "./types";

// One issue's answer to a field, turned into what the database keeps and back. Pure: it checks
// what can be checked from the value and the definition alone. That a `user` is a member of the
// workspace, and that the field applies to the issue's project, need the database and are the
// action's. Input is untrusted (a form, an API client, a plugin): every check reports, none
// throws.

// A control character, a newline included: a text and a URL are one line.
// biome-ignore lint/suspicious/noControlCharactersInRegex: this is exactly what is refused
const CONTROL = /[\u0000-\u001f\u007f]/;

export type ValueResult =
  | {
      ok: true;
      /** What to store, or `null` to clear the value (delete the row). */
      columns: ValueColumns | null;
    }
  | { ok: false; message: string };

const EMPTY_COLUMNS: ValueColumns = {
  text: null,
  number: null,
  date: null,
  userId: null,
};

/** A value's columns with only this one set. */
function columnsOf<K extends keyof ValueColumns>(
  key: K,
  value: NonNullable<ValueColumns[K]>,
): ValueColumns {
  return { ...EMPTY_COLUMNS, [key]: value };
}

/**
 * Is this a day that exists, as `YYYY-MM-DD`? A day that rolls over when it is built (the 30th of
 * February, a month 13, a year below 100) does not write back the same, so it is refused.
 */
function parseDay(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) return null;
  // Noon UTC, like an issue's due date: the day never slips with the reader's zone.
  const date = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12),
  );
  return date.toISOString().slice(0, 10) === text ? date : null;
}

/** A URL a field may hold: http or https, no user name or password, as the settings' addresses. */
function checkUrl(text: string): string | null {
  if (text.length > MAX_URL_LENGTH) {
    return `is at most ${MAX_URL_LENGTH} characters`;
  }
  try {
    const url = new URL(text);
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
 * The columns a value is stored in, or why it cannot be. `null`, `undefined` and an empty text
 * (only spaces too) are "no value": the answer is `columns: null`, which the caller turns into
 * removing the row. Everything else has to fit the field's type: a number is a number (never a
 * text that looks like one, never `NaN`), a choice is the id of one of the options, a day is a real
 * `YYYY-MM-DD`, a text and an address are one trimmed line within their limit.
 */
export function toColumns(field: FieldShape, input: unknown): ValueResult {
  if (input === undefined || input === null) return { ok: true, columns: null };
  if (typeof input === "string" && input.trim() === "") {
    return { ok: true, columns: null };
  }

  switch (field.type) {
    case "text": {
      if (typeof input !== "string") {
        return { ok: false, message: "must be text" };
      }
      const text = input.trim();
      const { maxLength } = field.config as TextConfig;
      if (CONTROL.test(text)) {
        return {
          ok: false,
          message: "must be on one line, without control characters",
        };
      }
      if (text.length > maxLength) {
        return {
          ok: false,
          message: `must be at most ${maxLength} characters`,
        };
      }
      return { ok: true, columns: columnsOf("text", text) };
    }
    case "url": {
      if (typeof input !== "string") {
        return { ok: false, message: "must be text" };
      }
      const text = input.trim();
      if (CONTROL.test(text)) {
        return {
          ok: false,
          message: "must be on one line, without control characters",
        };
      }
      const problem = checkUrl(text);
      return problem
        ? { ok: false, message: problem }
        : { ok: true, columns: columnsOf("text", text) };
    }
    case "number": {
      if (typeof input !== "number" || !Number.isFinite(input)) {
        return { ok: false, message: "must be a number" };
      }
      const { integer, min, max } = field.config as NumberConfig;
      if (integer && !Number.isSafeInteger(input)) {
        return { ok: false, message: "must be a whole number" };
      }
      if (min !== null && input < min) {
        return { ok: false, message: `must be at least ${min}` };
      }
      if (max !== null && input > max) {
        return { ok: false, message: `must be at most ${max}` };
      }
      return { ok: true, columns: columnsOf("number", input) };
    }
    case "select": {
      if (typeof input !== "string") {
        return { ok: false, message: "must be one of the options" };
      }
      const { options } = field.config as SelectConfig;
      return options.some((option) => option.id === input)
        ? { ok: true, columns: columnsOf("text", input) }
        : { ok: false, message: "must be one of the options" };
    }
    case "date": {
      if (typeof input !== "string") {
        return { ok: false, message: "must be a day as YYYY-MM-DD" };
      }
      const day = parseDay(input.trim());
      return day
        ? { ok: true, columns: columnsOf("date", day) }
        : { ok: false, message: "must be a day as YYYY-MM-DD" };
    }
    case "user": {
      if (
        typeof input !== "string" ||
        input.length > 100 ||
        CONTROL.test(input)
      ) {
        return { ok: false, message: "must be a member's id" };
      }
      return { ok: true, columns: columnsOf("userId", input.trim()) };
    }
  }
}

/**
 * A stored value as it is on the outside: the column of the field's type, a day as
 * `YYYY-MM-DD`. `null` where that column is empty, whatever the other columns hold (a row that
 * was written for another type, or by hand, is not read as this one's).
 */
export function fromColumns(
  type: CustomFieldType,
  columns: ValueColumns,
): FieldValue | null {
  const value = columns[VALUE_COLUMN[type]];
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return value ?? null;
}

/** Whether two outside values are the same answer, so a save that changes nothing can be skipped. */
export function sameValue(
  a: FieldValue | null | undefined,
  b: FieldValue | null | undefined,
): boolean {
  return (a ?? null) === (b ?? null);
}
