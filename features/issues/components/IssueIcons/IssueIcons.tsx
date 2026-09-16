"use client";

import { Icon } from "@iconify/react";
import { useFormatter } from "next-intl";
import styles from "./issueIcons.module.scss";

/**
 * The status ladder stays inside lucide's circle family so the glyphs line up
 * as a column in the board and list views. Unknown ids fall back to a plain ring.
 */
const STATUS_ICONS: Record<string, string> = {
  backlog: "lucide:circle-dashed",
  todo: "lucide:circle",
  in_progress: "lucide:circle-dot",
  in_review: "lucide:circle-ellipsis",
  done: "lucide:circle-check",
  canceled: "lucide:circle-x",
};

/** Signal bars per level — "urgent" leaves the family on purpose to stand out. */
const PRIORITY_ICONS: Record<number, string> = {
  0: "lucide:ellipsis",
  1: "lucide:signal-low",
  2: "lucide:signal-medium",
  3: "lucide:signal-high",
  4: "lucide:triangle-alert",
};

/** Neutral tone when the caller doesn't know a workspace color. */
const FALLBACK_STATUS_COLOR = "#8a9099";

// ---- Status icon: tinted with the workspace's colour for that status ----
export function StatusIcon({
  status,
  size = 15,
  color = FALLBACK_STATUS_COLOR,
}: {
  status: string;
  size?: number;
  /** Color of the status from the workspace data. */
  color?: string;
}) {
  return (
    <Icon
      icon={STATUS_ICONS[status] ?? "lucide:circle"}
      width={size}
      color={color}
      className={styles.icon}
      aria-hidden="true"
    />
  );
}

// ---- Priority icon: signal bars ----
export function PriorityIcon({
  priority,
  size = 15,
}: {
  priority: number;
  size?: number;
}) {
  const p = typeof priority === "number" ? priority : 0;
  const tone = p === 0 ? styles.none : p === 4 ? styles.urgent : styles.level;

  return (
    <Icon
      icon={PRIORITY_ICONS[p] ?? PRIORITY_ICONS[0]}
      width={size}
      className={`${styles.icon} ${tone}`}
      aria-hidden="true"
    />
  );
}

// ---- Story points badge: hash + number, same neutral tone as an id ----
export function StoryPointsBadge({
  points,
  size = 12,
}: {
  points: number;
  size?: number;
}) {
  return (
    <span className={styles.tag} title="Story points">
      <Icon
        icon="lucide:hash"
        width={size}
        className={styles.icon}
        aria-hidden="true"
      />
      {points}
    </span>
  );
}

// ---- Due date badge: calendar + short date, red once the day has passed ----
export function DueDateBadge({
  dueDate,
  size = 12,
}: {
  /** Epoch ms. */
  dueDate: number;
  size?: number;
}) {
  const format = useFormatter();
  const overdue = dueDate < Date.now();
  return (
    <span
      className={overdue ? `${styles.tag} ${styles.overdue}` : styles.tag}
      title={format.dateTime(dueDate, { dateStyle: "long" })}
    >
      <Icon
        icon="lucide:calendar"
        width={size}
        className={styles.icon}
        aria-hidden="true"
      />
      {format.dateTime(dueDate, { month: "short", day: "numeric" })}
    </span>
  );
}

// ---- Label icon: filled dot in the label's colour, same glyph as the sidebar ----
export function LabelIcon({
  color,
  size = 15,
}: {
  color: string;
  size?: number;
}) {
  return (
    <Icon
      icon="material-symbols:circle"
      width={size}
      color={color}
      className={styles.icon}
      aria-hidden="true"
    />
  );
}

// ---- Label dots: stand-in for a multi-label selection ----
/**
 * Up to three label colours side by side. Deliberately without overlap: the
 * ring that would need to separate overlapping dots would have to take the
 * background color of its container — and that changes as soon as a chip
 * enters the selected state.
 */
export function LabelDots({
  labels,
  size = 11,
}: {
  labels: { id: string; color: string }[];
  size?: number;
}) {
  return (
    <span className={styles.labelDots}>
      {labels.slice(0, 3).map((l) => (
        <LabelIcon key={l.id} color={l.color} size={size} />
      ))}
    </span>
  );
}

// ---- Type icon: geometric glyph per issue type ----
export function TypeIcon({
  type,
  size = 14,
  color = "#686d76",
}: {
  type: string;
  size?: number;
  /** Color of the issue type from the workspace data. */
  color?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    className: styles.icon,
  };

  if (type === "feature")
    return (
      <svg {...common} aria-hidden="true">
        <path d="M8 1.4 14.6 8 8 14.6 1.4 8Z" fill={color} />
      </svg>
    );
  if (type === "bug")
    return (
      <svg {...common} aria-hidden="true">
        <circle
          cx="8"
          cy="8"
          r="5.4"
          fill="none"
          stroke={color}
          strokeWidth="2"
        />
        <circle cx="8" cy="8" r="1.8" fill={color} />
      </svg>
    );
  if (type === "improvement")
    return (
      <svg {...common} aria-hidden="true">
        <path d="M8 2.2 14.2 13.4H1.8Z" fill={color} />
      </svg>
    );
  if (type === "task")
    return (
      <svg {...common} aria-hidden="true">
        <rect
          x="2.3"
          y="2.3"
          width="11.4"
          height="11.4"
          rx="3.2"
          fill={color}
        />
        <path
          d="M5.2 8 7.2 10 11 5.8"
          fill="none"
          stroke="#fff"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  // chore / fallback
  return (
    <svg {...common} aria-hidden="true">
      <rect
        x="2.6"
        y="2.6"
        width="10.8"
        height="10.8"
        rx="3"
        fill="none"
        stroke={color}
        strokeWidth="2"
      />
    </svg>
  );
}
