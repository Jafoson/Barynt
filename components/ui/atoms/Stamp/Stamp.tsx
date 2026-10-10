"use client";

import { useFormatter } from "next-intl";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";

interface StampProps {
  /** Epoch milliseconds. */
  ts: number;
  className?: string;
}

/**
 * A point in time for a card or a table cell, in the way the person chose
 * (`dateFormat`): compact and relative ("3d ago") or as a short date
 * (`useTimeAgo`). The time of day belongs in the issue's details; here it
 * only sits in the tooltip.
 */
export function Stamp({ ts, className }: StampProps) {
  const format = useFormatter();
  const timeAgo = useTimeAgo();

  return (
    <span
      className={className}
      title={format.dateTime(ts, { dateStyle: "long", timeStyle: "short" })}
      suppressHydrationWarning
    >
      {timeAgo(ts)}
    </span>
  );
}
