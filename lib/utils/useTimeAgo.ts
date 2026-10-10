"use client";

import { useFormatter, useTranslations } from "next-intl";
import { usePreferences } from "@/lib/preferences/PreferencesContext";

/**
 * Localized, relative time display for card and list views.
 *
 * Deliberately kept compact ("3d ago" / "vor 3 T."), so the value doesn't
 * wrap in narrow columns. The abbreviations are plural-invariant, so simple
 * interpolation is enough instead of ICU plurals. Anything past five weeks
 * is formatted as an absolute date in the active locale. Whoever prefers
 * dates (`dateFormat: "absolute"`) gets that from the first minute on.
 *
 * Returns a formatting function, so a component can render several
 * timestamps with a single hook call.
 */
export function useTimeAgo() {
  const t = useTranslations("time");
  const format = useFormatter();
  const { dateFormat } = usePreferences();

  return (ts: number) => {
    // A date, kept short (`01.10.26`). Cards and cells that have room for
    // the time of day as well use `Stamp` instead.
    if (dateFormat === "absolute") {
      return format.dateTime(ts, {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
      });
    }

    const seconds = Math.floor((Date.now() - ts) / 1000);
    if (seconds < 60) return t("justNow");

    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return t("minutes", { count: minutes });

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return t("hours", { count: hours });

    const days = Math.floor(hours / 24);
    if (days < 7) return t("days", { count: days });

    const weeks = Math.floor(days / 7);
    if (weeks < 5) return t("weeks", { count: weeks });

    return format.dateTime(ts, { month: "short", day: "numeric" });
  };
}
