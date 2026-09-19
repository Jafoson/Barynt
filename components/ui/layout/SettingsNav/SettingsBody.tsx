"use client";

import { Icon } from "@iconify/react";
import { useSearchParams } from "next/navigation";
import { Link, usePathname } from "@/i18n/navigation";
import styles from "./settingsBody.module.scss";
import { OPEN_PARAM } from "./settingsView";

interface SettingsBodyProps {
  /** Address of the settings' start page (the section list on a phone). */
  basePath: string;
  /** Text of the back link, e.g. "Settings". */
  backLabel: string;
  /** The layout's own two-column row. */
  className?: string;
  /** The nav first, then the panel — in that order. */
  children: React.ReactNode;
}

/**
 * The row of nav and panel — on a phone, one of them at a time.
 *
 * The start page's address is the list of sections; a section (also
 * "General", via `?open`) is its own full screen with a way back to the
 * list. Everything above a phone keeps both columns: `data-view` only
 * matters to the phone rules in `settingsBody.module.scss`.
 */
export function SettingsBody({
  basePath,
  backLabel,
  className,
  children,
}: SettingsBodyProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isList = pathname === basePath && !searchParams.has(OPEN_PARAM);

  return (
    <div
      className={[styles.body, className].filter(Boolean).join(" ")}
      data-view={isList ? "list" : "page"}
    >
      <Link href={basePath} className={styles.back}>
        <Icon icon="lucide:chevron-left" width={18} aria-hidden="true" />
        {backLabel}
      </Link>
      {children}
    </div>
  );
}
