import { Icon } from "@iconify/react";
import { Link } from "@/i18n/navigation";
import type { SettingsScopeKey, VisibleSettingsScopeEntry } from "@/lib/nav";
import styles from "./settingsHeader.module.scss";

interface Props {
  /**
   * Already built and filtered by the layout — `settingsScopeItems()` plus
   * `visibleSettingsScope()` in `lib/nav.ts`. Only what's missing due to
   * permissions OR a missing address: the layout omits this component
   * entirely once only one segment would remain (see there).
   */
  items: VisibleSettingsScopeEntry[];
  /** The scope currently active. */
  active: SettingsScopeKey;
  /** Names the switcher for screen readers, e.g. "Settings scope". */
  label: string;
}

/**
 * The topmost row of the settings: the switcher between Personal, Project,
 * and Workspace.
 *
 * It spans across both columns below it — above the scope nav and above the
 * scope itself. That's not cosmetic, it's the hierarchy: the switcher
 * changes both columns at once, so it can't belong to either one. In the nav
 * (208px), there also wasn't room left for a full word for "Personal"; here
 * there's space for both the icon and the label.
 *
 * The row itself sets no bottom edge. The line below it comes from the top
 * edges of the two columns (`SettingsNav`, `PageHeader`) — that way it runs
 * across the full width and stays one line instead of two.
 *
 * With four choices the words no longer fit a phone: there the open one keeps its word and
 * the others are their icon (`settingsHeader.module.scss`), still named for a screen reader.
 *
 * Deliberately built from links rather than buttons: each scope has its own
 * address, and a link can be opened in a new tab. That means the row needs
 * no `"use client"` — which scope is active is known by the layout that
 * renders it, not by the browser.
 */
export function SettingsHeader({ items, active, label }: Props) {
  return (
    <header className={styles.bar}>
      <nav className={styles.scope} aria-label={label}>
        {items.map((item) => {
          const content = (
            <>
              <Icon className={styles.icon} icon={item.icon} width={15} />
              <span className={styles.label}>{item.label}</span>
            </>
          );

          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={styles.segment}
              data-active={isActive || undefined}
              aria-current={isActive ? "page" : undefined}
            >
              {content}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
