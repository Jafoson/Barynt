"use client";

import type { ChartLabels, Widget } from "@/features/dashboard/widgets";
import styles from "../widget.module.scss";

/** What every body gets besides its data. */
export interface BodyProps {
  widget: Widget;
  labels: ChartLabels;
  issueHref: (ref: string) => string;
  /** A bucket key (`YYYY-MM-DD`) as an axis label. */
  bucketLabel: (key: string) => string;
  workspaceSlug: string;
}

/** A small line chart; `null` values are skipped. */
export function Spark({
  values,
  color = "var(--spark)",
  area = false,
}: {
  values: (number | null)[];
  color?: string;
  area?: boolean;
}) {
  const known = values.filter((v): v is number => v !== null);
  if (known.length < 2) return null;
  const max = Math.max(...known);
  const min = Math.min(...known);
  const span = max - min || 1;
  const step = 100 / Math.max(1, values.length - 1);
  const points = values.flatMap((v, i) =>
    v === null ? [] : [[i * step, 36 - ((v - min) / span) * 32] as const],
  );
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  return (
    <svg
      className={styles.spark}
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {area && (
        <path
          d={`${line} L${points[points.length - 1][0]} 40 L${points[0][0]} 40Z`}
          fill={color}
          opacity={0.18}
        />
      )}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2.5}
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** Three labels under a time axis: first, middle, last. */
export function TimeAxis({
  keys,
  label,
}: {
  keys: string[];
  label: (key: string) => string;
}) {
  if (keys.length === 0) return null;
  const picks = [
    ...new Set([0, Math.floor((keys.length - 1) / 2), keys.length - 1]),
  ];
  return (
    <div className={`${styles.axis} ${styles.noShort}`}>
      {picks.map((i) => (
        <span key={keys[i]}>{label(keys[i])}</span>
      ))}
    </div>
  );
}
