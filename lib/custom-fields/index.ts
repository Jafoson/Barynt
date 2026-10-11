// Custom fields: the value types and the one place that decides whether a
// value fits a field.
//
// No dependencies, no `server-only`, no Prisma — runs in server actions, the
// REST API, the MCP tools, the seed and the tests alike. The database stores
// a value as `Json` and cannot tell a number from a string, so everything
// that writes a field value goes through `validateFieldValue` first.

import { type DateMode, isTimeOfDay, normalizeInstant } from "./datetime";
import { isCustomFieldIcon } from "./icons";

export { DATE_MODES, type DateMode, isDateMode } from "./datetime";
export { CUSTOM_FIELD_ICONS, isCustomFieldIcon } from "./icons";

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

/** Which numbers a NUMBER field takes. */
export const NUMBER_MODES = ["FREE", "INTEGER", "DECIMAL"] as const;
export type NumberMode = (typeof NUMBER_MODES)[number];

export function isNumberMode(value: unknown): value is NumberMode {
  return (
    typeof value === "string" &&
    (NUMBER_MODES as readonly string[]).includes(value)
  );
}

/** Decimal places a DECIMAL field can be set to. */
export const NUMBER_DECIMALS_RANGE = { min: 1, max: 6, default: 2 } as const;

/** Rounds `n` to `places` decimals. */
export function roundTo(n: number, places: number): number {
  return Number(n.toFixed(places));
}

/** What a choice of a field may carry besides its name. */
export const OPTION_VISUALS = ["icon", "image", "color"] as const;
export type OptionVisualKind = (typeof OPTION_VISUALS)[number];

export function isOptionVisual(value: unknown): value is OptionVisualKind {
  return (
    typeof value === "string" &&
    (OPTION_VISUALS as readonly string[]).includes(value)
  );
}

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

/**
 * The choices reduced to what the field allows them to carry: an icon, an
 * image or a colour that is not allowed is dropped. Run on every save, so
 * turning a kind off cleans up after itself.
 */
export function limitOptionVisuals(
  options: FieldOption[],
  allowed: readonly string[],
): FieldOption[] {
  return options.map((o) => ({
    ...o,
    icon: allowed.includes("icon") ? (o.icon ?? null) : null,
    image: allowed.includes("image") ? (o.image ?? null) : null,
    color: allowed.includes("color") ? (o.color ?? null) : null,
  }));
}

/** A choice of a SELECT or MULTI_SELECT field. The id is what gets stored. */
export interface FieldOption {
  id: string;
  label: string;
  color: string | null;
  /** One of `CUSTOM_FIELD_ICONS`. Shown in front of the choice. */
  icon?: string | null;
  /**
   * An uploaded image, as the object key in storage (`fieldoptions/…`). It
   * wins over `icon`. Never leaves the server as it is: pages get `imageUrl`.
   */
  image?: string | null;
  /** The image as a (presigned) URL — filled in when definitions are loaded. */
  imageUrl?: string | null;
}

/** What a field value looks like once validated. `null` means "no value". */
export type FieldValue = string | number | boolean | string[];

/**
 * A field as the issue UI needs it: what to show and how to edit. Safe for
 * the client — no workspace or audit data.
 */
export interface FieldDefinition {
  id: string;
  key: string;
  name: string;
  description: string;
  type: CustomFieldType;
  options: FieldOption[];
  /** One of `CUSTOM_FIELD_ICONS`, or none. */
  icon: string | null;
  /** Only meaningful for DATE. */
  dateMode: DateMode;
  /** SELECT and MULTI_SELECT: may people add a choice while filling in. */
  allowCustomOptions: boolean;
  /** SELECT and MULTI_SELECT: what a choice may carry besides its name. */
  optionVisuals: OptionVisualKind[];
  /** NUMBER only. */
  numberMode: NumberMode;
  /** NUMBER with DECIMAL: places after the point. */
  numberDecimals: number | null;
  /** NUMBER: text after the value ("%", "$"). */
  numberUnit: string | null;
  /** URL: only https links are accepted. */
  linkHttpsOnly: boolean;
  /** URL: the sites a link may point to; empty = any site. */
  linkHosts: string[];
  /** URL: show the site's icon next to the link. */
  linkFavicon: boolean;
  /** URL: without a title of their own, take the page's title. */
  linkFetchTitle: boolean;
  /** `null` = a workspace field, which applies in every project. */
  projectId: string | null;
  /** The projects whose settings turn this field off (`cf:<id>` entries). */
  hiddenInProjects: string[];
}

/**
 * Narrows a stored `Json` value to something the UI can render. A row that
 * was written by an older version, or by hand, must not crash a page: what
 * isn't one of the known shapes becomes "no value".
 */
export function narrowFieldValue(raw: unknown): FieldValue | null {
  if (typeof raw === "string" || typeof raw === "boolean") return raw;
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (Array.isArray(raw) && raw.every((v) => typeof v === "string")) {
    return raw.length > 0 ? (raw as string[]) : null;
  }
  return null;
}

export const FIELD_LIMITS = {
  /** TEXT and URL. */
  text: 2000,
  name: 60,
  description: 300,
  options: 50,
  optionLabel: 60,
  /** NUMBER stays within what a JSON double stores exactly enough for display. */
  numberAbs: 1e15,
  /** Longest object key an option image may have. */
  imageKey: 200,
  /** Largest option image, in bytes. A small picture next to a label. */
  imageBytes: 1024 * 1024,
  /** Longest text after a number. */
  numberUnit: 8,
  /** Sites a link field may be limited to, and the length of one. */
  linkHosts: 20,
  linkHost: 100,
  /** A title chosen for a link. */
  linkTitle: 200,
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
    const { id, label, color, icon, image } = raw as Record<string, unknown>;
    if (typeof id !== "string" || id === "") continue;
    if (typeof label !== "string" || label === "") continue;
    out.push({
      id,
      label,
      color: typeof color === "string" ? color : null,
      icon: typeof icon === "string" && icon !== "" ? icon : null,
      image: typeof image === "string" && image !== "" ? image : null,
    });
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

/**
 * A link's own title travels beside its value, in the same map, under this
 * key (`{ [fieldId]: url, [titleKey(fieldId)]: "Title" }`) — in a patch, a
 * draft and the issue the page gets. Field ids never contain a `#`.
 */
export const titleKey = (fieldId: string): string => `${fieldId}#title`;

/** The field a `titleKey` belongs to, or `null` for any other key. */
export function fieldIdOfTitleKey(key: string): string | null {
  return key.endsWith("#title") ? key.slice(0, -"#title".length) : null;
}

/**
 * "example.com" is as good a link as "https://example.com": a text without
 * a scheme gets `https://`. Anything else is left as it is.
 */
export function withScheme(text: string): string {
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
}

/** The host a site setting can be compared with: lower case, no "www.". */
export function normalizeHost(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/:\d+$/, "")
    .replace(/^www\./, "");
}

/**
 * Whether `host` is one of `hosts` or below one of them ("docs.example.com"
 * is allowed by "example.com"). An empty list allows every site.
 */
export function hostAllowed(host: string, hosts: readonly string[]): boolean {
  if (hosts.length === 0) return true;
  const h = normalizeHost(host);
  return hosts.some((allowed) => h === allowed || h.endsWith(`.${allowed}`));
}

/**
 * The link as it is stored, or why it is not accepted: `invalid` (not a
 * link at all), `scheme` (http where only https is allowed) or `host` (a
 * site the field does not allow).
 */
export function checkLink(
  text: string,
  rules: { httpsOnly?: boolean; hosts?: readonly string[] },
):
  | { ok: true; value: string }
  | { ok: false; reason: "invalid" | "scheme" | "host" } {
  const candidate = withScheme(text.trim());
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, reason: "invalid" };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, reason: "invalid" };
  }
  if (!url.hostname.includes(".") && url.hostname !== "localhost") {
    return { ok: false, reason: "invalid" };
  }
  if (rules.httpsOnly && url.protocol !== "https:") {
    return { ok: false, reason: "scheme" };
  }
  if (!hostAllowed(url.hostname, rules.hosts ?? [])) {
    return { ok: false, reason: "host" };
  }
  return { ok: true, value: candidate };
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
  field: {
    type: CustomFieldType;
    options?: unknown;
    dateMode?: DateMode;
    numberMode?: NumberMode;
    numberDecimals?: number | null;
    linkHttpsOnly?: boolean;
    linkHosts?: string[];
  },
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
      const link = checkLink(text, {
        httpsOnly: field.linkHttpsOnly,
        hosts: field.linkHosts,
      });
      if (!link.ok) {
        return bad(
          link.reason === "scheme"
            ? "only https links are allowed"
            : link.reason === "host"
              ? "this site is not allowed"
              : "expected an http or https link",
        );
      }
      if (link.value.length > FIELD_LIMITS.text) return bad("link is too long");
      return good(link.value);
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
      if (field.numberMode === "INTEGER" && !Number.isInteger(n))
        return bad("expected a whole number");
      if (field.numberMode === "DECIMAL") {
        // The field fixes the places; what is typed is rounded to them.
        const places = field.numberDecimals ?? NUMBER_DECIMALS_RANGE.default;
        return good(roundTo(n, places));
      }
      return good(n);
    }

    case "DATE": {
      if (typeof input !== "string") return bad("expected a date");
      const text = input.trim();
      if (text === "") return good(null);
      const mode = field.dateMode ?? "DATE";
      if (mode === "TIME") {
        if (!isTimeOfDay(text)) return bad("expected a time as HH:mm");
        return good(text);
      }
      if (mode === "DATETIME") {
        const instant = normalizeInstant(text);
        if (!instant) return bad("expected a date and time with a zone");
        return good(instant);
      }
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
  if (options.some((o) => o.color && !COLOR_RE.test(o.color)))
    return { ok: false, error: "a choice has an invalid colour" };
  if (options.some((o) => o.icon && !isCustomFieldIcon(o.icon)))
    return { ok: false, error: "a choice has an icon that is not in the list" };
  if (options.some((o) => (o.image?.length ?? 0) > FIELD_LIMITS.imageKey))
    return { ok: false, error: "a choice has an invalid image" };
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
