import type { EstimateUnit } from "@/types";

export const ESTIMATE_UNITS: EstimateUnit[] = [
  "hours",
  "days",
  "weeks",
  "months",
  "years",
];

/**
 * Hours per unit — the classic "8-hour day, 5-day week" work convention
 * (the same default Jira's own time-tracking uses), not calendar time: a
 * "month" here is 4 working weeks, a "year" 52 of them. Not configurable
 * per workspace; revisit if that's ever asked for.
 */
const HOURS_PER_UNIT: Record<EstimateUnit, number> = {
  hours: 1,
  days: 8,
  weeks: 40,
  months: 160,
  years: 2080,
};

/** Short unit label for compact display (audit log, badges) — `2d`, `3w`. */
export const ESTIMATE_UNIT_ABBR: Record<EstimateUnit, string> = {
  hours: "h",
  days: "d",
  weeks: "w",
  months: "mo",
  years: "y",
};

/** A value in the given unit → hours, for storage in `Issue.estimateHours`. */
export function estimateToHours(value: number, unit: EstimateUnit): number {
  return value * HOURS_PER_UNIT[unit];
}

/** Hours → a value in the given unit, for redisplay in `Issue.estimateUnit`. */
export function hoursToEstimate(hours: number, unit: EstimateUnit): number {
  return hours / HOURS_PER_UNIT[unit];
}

/** Trims float noise from a converted value (e.g. `2.0000000000000004`)
 *  without padding a clean one with trailing zeros. */
export function formatEstimateValue(value: number): string {
  return Number(value.toFixed(2)).toString();
}

/**
 * `t(...)` key for a unit's display name — a lookup object rather than a
 * computed template string so next-intl's `t()` can still typecheck the
 * result as one of its known message keys (a plain `string` return type
 * wouldn't satisfy that).
 */
export const ESTIMATE_UNIT_MESSAGE_KEY = {
  hours: "fields.estimateUnitHours",
  days: "fields.estimateUnitDays",
  weeks: "fields.estimateUnitWeeks",
  months: "fields.estimateUnitMonths",
  years: "fields.estimateUnitYears",
} as const satisfies Record<EstimateUnit, string>;
