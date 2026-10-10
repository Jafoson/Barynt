// Date and time values of custom fields.
//
// Three modes (`CustomFieldDateMode`): a calendar day, an instant, a time of
// day. Only the instant needs a time zone. It is stored in UTC and shown and
// entered in the zone the person has chosen (`timeZone` preference, the
// browser's own when unset). These helpers do the conversion with `Intl` —
// no date library, and they run on the server and in the browser alike.

export const DATE_MODES = ["DATE", "DATETIME", "TIME"] as const;
export type DateMode = (typeof DATE_MODES)[number];

export function isDateMode(value: unknown): value is DateMode {
  return (
    typeof value === "string" &&
    (DATE_MODES as readonly string[]).includes(value)
  );
}

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const LOCAL_RE = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d)$/;

export function isTimeOfDay(value: string): boolean {
  return TIME_RE.test(value);
}

/**
 * The offset of `timeZone` from UTC at the given instant, in minutes
 * (Berlin in summer: +120). `Intl` has no direct call for it, so the zone's
 * wall clock is read back as if it were UTC and compared with the instant.
 */
function offsetMinutes(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(instant));
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  return Math.round((asUtc - Math.floor(instant / 1000) * 1000) / 60000);
}

/**
 * `"2026-10-12T14:30"` as typed in `timeZone` → the instant as
 * `"2026-10-12T12:30:00.000Z"`. `null` for anything that is not a valid
 * local date-time. A wall-clock time that does not exist (the hour skipped
 * when clocks go forward) resolves to a valid instant next to the gap.
 */
export function zonedLocalToUtc(
  local: string,
  timeZone: string,
): string | null {
  const m = LOCAL_RE.exec(local);
  if (!m) return null;
  const [y, mo, d, h, mi] = m.slice(1).map(Number);
  const check = new Date(Date.UTC(y, mo - 1, d, h, mi));
  if (
    check.getUTCFullYear() !== y ||
    check.getUTCMonth() !== mo - 1 ||
    check.getUTCDate() !== d
  ) {
    return null;
  }

  const wall = Date.UTC(y, mo - 1, d, h, mi);
  // Two passes: the offset at the guess may differ from the offset at the
  // result when a transition lies in between.
  let instant = wall - offsetMinutes(wall, timeZone) * 60000;
  instant = wall - offsetMinutes(instant, timeZone) * 60000;
  return new Date(instant).toISOString();
}

/** The instant as it reads on the wall in `timeZone`: `"2026-10-12T14:30"`. */
export function utcToZonedLocal(iso: string, timeZone: string): string | null {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  const shifted = new Date(t + offsetMinutes(t, timeZone) * 60000);
  return shifted.toISOString().slice(0, 16);
}

/**
 * An instant as the API and the editor hand it over, reduced to the stored
 * form: UTC, minute precision. `null` if it isn't an ISO instant with a zone.
 */
export function normalizeInstant(value: string): string | null {
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(
      value,
    )
  )
    return null;
  const t = Date.parse(value);
  if (Number.isNaN(t)) return null;
  return new Date(Math.floor(t / 60000) * 60000).toISOString();
}

export interface FieldDateFormatOptions {
  mode: DateMode;
  /** `short` | `medium` | `long` | `iso`. */
  dateFormat: "short" | "medium" | "long" | "iso";
  /** `24h` | `12h`. */
  timeFormat: "24h" | "12h";
  /** The viewer's zone; matters for an instant only. */
  timeZone: string;
  locale: string;
}

function dayText(
  day: string,
  { dateFormat, locale }: Pick<FieldDateFormatOptions, "dateFormat" | "locale">,
): string {
  if (dateFormat === "iso") return day;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: dateFormat,
    timeZone: "UTC",
  }).format(new Date(`${day}T12:00:00Z`));
}

function timeText(
  hhmm: string,
  { timeFormat, locale }: Pick<FieldDateFormatOptions, "timeFormat" | "locale">,
): string {
  if (timeFormat === "24h") return hhmm;
  const [h, m] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "UTC",
  }).format(new Date(Date.UTC(1970, 0, 1, h, m)));
}

/**
 * A stored date value as the person wants to read it. `value` is in the form
 * of `mode` (see `CustomFieldDateMode`); a value that doesn't fit the mode is
 * returned as it is rather than hidden.
 */
export function formatFieldDate(
  value: string,
  options: FieldDateFormatOptions,
): string {
  if (options.mode === "TIME") {
    return isTimeOfDay(value) ? timeText(value, options) : value;
  }
  if (options.mode === "DATETIME") {
    const local = utcToZonedLocal(value, options.timeZone);
    if (!local) return value;
    const [day, hhmm] = local.split("T");
    return `${dayText(day, options)}${options.dateFormat === "iso" ? " " : ", "}${timeText(hhmm, options)}`;
  }
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? dayText(value, options) : value;
}
