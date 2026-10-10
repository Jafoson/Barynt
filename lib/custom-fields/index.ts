// Custom fields: the value types and the one place that decides whether a
// value fits a field.
//
// No dependencies, no `server-only`, no Prisma — runs in server actions, the
// REST API, the MCP tools, the seed and the tests alike. The database stores
// a value as `Json` and cannot tell a number from a string, so everything
// that writes a field value goes through `validateFieldValue` first.

export const CUSTOM_FIELD_TYPES = [
  "TEXT",
  "NUMBER",
  "DATE",
  "SELECT",
  "MULTI_SELECT",
  "CHECKBOX",
  "URL",
  "USER",
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export function isCustomFieldType(value: unknown): value is CustomFieldType {
  return (
    typeof value === "string" &&
    (CUSTOM_FIELD_TYPES as readonly string[]).includes(value)
  );
}

/** A choice of a SELECT or MULTI_SELECT field. The id is what gets stored. */
export interface FieldOption {
  id: string;
  label: string;
  color: string | null;
}

/** What a field value looks like once validated. `null` means "no value". */
export type FieldValue = string | number | boolean | string[];

export const FIELD_LIMITS = {
  /** TEXT and URL. */
  text: 2000,
  name: 60,
  description: 300,
  options: 50,
  optionLabel: 60,
  /** NUMBER stays within what a JSON double stores exactly enough for display. */
  numberAbs: 1e15,
  /** Active (non-archived) fields a workspace may define. */
  fieldsPerWorkspace: 100,
} as const;

/** Types whose value is a choice from `options`. */
export function usesOptions(type: CustomFieldType): boolean {
  return type === "SELECT" || type === "MULTI_SELECT";
}

/**
 * Narrows the `options` column to a usable list. Anything that doesn't look
 * like an option is dropped, so a hand-edited row can't crash a page.
 */
export function toOptions(json: unknown): FieldOption[] {
  if (!Array.isArray(json)) return [];
  const out: FieldOption[] = [];
  for (const raw of json) {
    if (typeof raw !== "object" || raw === null) continue;
    const { id, label, color } = raw as Record<string, unknown>;
    if (typeof id !== "string" || id === "") continue;
    if (typeof label !== "string" || label === "") continue;
    out.push({ id, label, color: typeof color === "string" ? color : null });
  }
  return out;
}

export type ValidateResult =
  | { ok: true; value: FieldValue | null }
  | { ok: false; error: string };

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** `YYYY-MM-DD` that is a real calendar day (no 2026-02-30). */
export function isCalendarDate(value: string): boolean {
  const m = DATE_RE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return (
    date.getUTCFullYear() === y &&
    date.getUTCMonth() === mo - 1 &&
    date.getUTCDate() === d
  );
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

const bad = (error: string): ValidateResult => ({ ok: false, error });
const good = (value: FieldValue | null): ValidateResult => ({
  ok: true,
  value,
});

/**
 * Checks and normalizes one input for a field.
 *
 * Empty input (`null`, `undefined`, an empty or blank string, an empty list)
 * clears the field and comes back as `value: null` — except CHECKBOX, where
 * `false` is a value of its own and `null` is "not answered yet".
 *
 * USER only checks the shape: whether that person belongs to the workspace is
 * a database question and is answered by whoever writes the value.
 */
export function validateFieldValue(
  field: { type: CustomFieldType; options?: unknown },
  input: unknown,
): ValidateResult {
  if (input === null || input === undefined) return good(null);

  switch (field.type) {
    case "TEXT": {
      if (typeof input !== "string") return bad("expected text");
      const text = input.trim();
      if (text === "") return good(null);
      if (text.length > FIELD_LIMITS.text) return bad("text is too long");
      return good(text);
    }

    case "URL": {
      if (typeof input !== "string") return bad("expected a link");
      const text = input.trim();
      if (text === "") return good(null);
      if (text.length > FIELD_LIMITS.text) return bad("link is too long");
      if (!isHttpUrl(text)) return bad("expected an http or https link");
      return good(text);
    }

    case "NUMBER": {
      let n: number;
      if (typeof input === "number") n = input;
      else if (typeof input === "string") {
        if (input.trim() === "") return good(null);
        n = Number(input.trim().replace(",", "."));
      } else return bad("expected a number");
      if (!Number.isFinite(n)) return bad("expected a number");
      if (Math.abs(n) > FIELD_LIMITS.numberAbs)
        return bad("number is too large");
      return good(n);
    }

    case "DATE": {
      if (typeof input !== "string") return bad("expected a date");
      const text = input.trim();
      if (text === "") return good(null);
      if (!isCalendarDate(text)) return bad("expected a date as YYYY-MM-DD");
      return good(text);
    }

    case "CHECKBOX": {
      if (typeof input !== "boolean") return bad("expected true or false");
      return good(input);
    }

    case "SELECT": {
      if (typeof input !== "string") return bad("expected one choice");
      if (input === "") return good(null);
      const ids = new Set(toOptions(field.options).map((o) => o.id));
      if (!ids.has(input)) return bad("unknown choice");
      return good(input);
    }

    case "MULTI_SELECT": {
      if (!Array.isArray(input)) return bad("expected a list of choices");
      if (input.length === 0) return good(null);
      const ids = new Set(toOptions(field.options).map((o) => o.id));
      const seen = new Set<string>();
      for (const item of input) {
        if (typeof item !== "string") return bad("expected a list of choices");
        if (!ids.has(item)) return bad("unknown choice");
        seen.add(item);
      }
      return good([...seen]);
    }

    case "USER": {
      if (typeof input !== "string") return bad("expected a person");
      const id = input.trim();
      if (id === "") return good(null);
      return good(id);
    }
  }
}

/**
 * Checks the options of a SELECT/MULTI_SELECT definition: a non-empty list
 * within the limits, unique ids, non-empty labels. Other types carry none.
 */
export function validateOptions(
  type: CustomFieldType,
  input: unknown,
): { ok: true; options: FieldOption[] } | { ok: false; error: string } {
  if (!usesOptions(type)) return { ok: true, options: [] };
  if (!Array.isArray(input) || input.length === 0)
    return { ok: false, error: "add at least one choice" };
  if (input.length > FIELD_LIMITS.options)
    return { ok: false, error: "too many choices" };

  const options = toOptions(input).map((o) => ({
    ...o,
    label: o.label.trim(),
  }));
  if (options.length !== input.length)
    return { ok: false, error: "every choice needs an id and a label" };
  if (
    options.some(
      (o) => o.label === "" || o.label.length > FIELD_LIMITS.optionLabel,
    )
  )
    return { ok: false, error: "a choice label is empty or too long" };
  if (new Set(options.map((o) => o.id)).size !== options.length)
    return { ok: false, error: "choice ids must be unique" };
  return { ok: true, options };
}

/**
 * The stable external name derived from a display name: lower-case ASCII,
 * words joined by `_` (`Customer ID` → `customer_id`). Umlauts are folded
 * (`Größe` → `groesse`) so a German workspace gets a readable key.
 */
export function fieldKeyFromName(name: string): string {
  const folded = name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "");
  const key = folded.replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return key === "" ? "field" : key.slice(0, 40);
}

/** Keys the API reserves for the issue's own properties. */
export const RESERVED_FIELD_KEYS: readonly string[] = [
  "id",
  "key",
  "title",
  "description",
  "status",
  "priority",
  "type",
  "labels",
  "assignee",
  "reporter",
  "parent",
  "project",
  "created",
  "updated",
  "due_date",
  "story_points",
  "estimate",
];

/** A key free of clashes with the issue's own properties. */
export function isReservedFieldKey(key: string): boolean {
  return RESERVED_FIELD_KEYS.includes(key);
}
