"use client";

import { Icon } from "@iconify/react";
import { useState } from "react";
import { usePreferences } from "@/lib/preferences/PreferencesContext";
import { toIso } from "@/lib/richtext/date";
import styles from "./calendar.module.scss";

/**
 * A month sheet for picking a day.
 *
 * Deliberately kept small: no ranges, no time of day, no blocked-out days — a
 * date in running text doesn't need any of that. Anyone who wants more can
 * type it directly.
 *
 * Month and weekday names come from `Intl` and thus follow the environment;
 * the component only runs in the browser, so there can be no mismatch with
 * the server.
 */

/** `Date.getDay()` value of the week's first day: Monday unless chosen otherwise. */
const MONDAY = 1;
const SUNDAY = 0;

interface CalendarProps {
  /** Initial value as an ISO date. */
  value?: string;
  onPick: (iso: string) => void;
  /** Labels for the quick-pick row; the row is omitted without them. */
  todayLabel?: string;
  tomorrowLabel?: string;
}

/** The month the sheet opens to. */
function initialMonth(value: string | undefined): Date {
  const parsed = value ? new Date(`${value}T12:00:00`) : null;
  const base = parsed && !Number.isNaN(parsed.getTime()) ? parsed : new Date();
  return new Date(base.getFullYear(), base.getMonth(), 1);
}

/**
 * The days the sheet displays: the month itself, preceded by the tail end of
 * the first week and followed by the start of the last. This keeps the grid
 * always rectangular.
 */
function weeksOf(month: Date, firstDay: number): Date[][] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  // How many days of the previous month spill into the first row.
  const lead = (first.getDay() - firstDay + 7) % 7;

  const start = new Date(first);
  start.setDate(first.getDate() - lead);

  const weeks: Date[][] = [];
  const cursor = new Date(start);

  // Six rows: this keeps the sheet's height from jumping when the month changes.
  for (let week = 0; week < 6; week++) {
    const days: Date[] = [];
    for (let day = 0; day < 7; day++) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(days);
  }
  return weeks;
}

const isoOf = (d: Date) =>
  toIso(d.getFullYear(), d.getMonth() + 1, d.getDate());

export function Calendar({
  value,
  onPick,
  todayLabel,
  tomorrowLabel,
}: CalendarProps) {
  const [month, setMonth] = useState(() => initialMonth(value));

  const today = isoOf(new Date());
  const { weekStart } = usePreferences();
  const weeks = weeksOf(month, weekStart === "sunday" ? SUNDAY : MONDAY);

  const shift = (by: number) =>
    setMonth((m) => new Date(m.getFullYear(), m.getMonth() + by, 1));

  const monthName = month.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  // Derive weekday names from any given week so they're in the same
  // language as the month name above.
  const weekdays = weeks[0].map((d) =>
    d.toLocaleDateString(undefined, { weekday: "short" }),
  );

  const quick = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    onPick(isoOf(d));
  };

  return (
    <div className={styles.calendar}>
      <div className={styles.head}>
        <button
          type="button"
          className={styles.nav}
          aria-label="←"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => shift(-1)}
        >
          <Icon icon="lucide:chevron-left" width={15} />
        </button>
        <span className={styles.month}>{monthName}</span>
        <button
          type="button"
          className={styles.nav}
          aria-label="→"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => shift(1)}
        >
          <Icon icon="lucide:chevron-right" width={15} />
        </button>
      </div>

      {/* No `role="grid"`: that would require row and cell roles, and the
          grid here is a flat CSS grid. Instead of faking structure, every
          day carries its full date as a label. */}
      <div className={styles.grid}>
        {weekdays.map((name) => (
          <span key={name} className={styles.weekday}>
            {name}
          </span>
        ))}

        {weeks.flat().map((day) => {
          const iso = isoOf(day);
          return (
            <button
              key={iso}
              type="button"
              className={styles.day}
              // Days from adjacent months stay selectable but recede visually.
              data-outside={day.getMonth() !== month.getMonth() || undefined}
              data-today={iso === today || undefined}
              data-selected={iso === value || undefined}
              // Focus must stay in the editor, otherwise the selection breaks.
              aria-label={day.toLocaleDateString(undefined, {
                weekday: "long",
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              aria-current={iso === today ? "date" : undefined}
              aria-pressed={iso === value || undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(iso)}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>

      {(todayLabel || tomorrowLabel) && (
        <div className={styles.quick}>
          {todayLabel && (
            <button
              type="button"
              className={styles.quickBtn}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => quick(0)}
            >
              {todayLabel}
            </button>
          )}
          {tomorrowLabel && (
            <button
              type="button"
              className={styles.quickBtn}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => quick(1)}
            >
              {tomorrowLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
