import { Link } from "@/i18n/navigation";
import styles from "./tabs.module.scss";

interface TabsProps {
  /** Where the active indicator sits. `top` hangs it off a divider above
   *  the tabs — e.g. tabs sitting in a header right under its top border. */
  indicator?: "top" | "bottom";
  /** Names the set of tabs for assistive tech. */
  label: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Material-style primary tabs: a row of links, the active one marked by a
 * short bar against the divider (`indicator`). Scrolls sideways when the
 * tabs don't fit. Domain-agnostic — callers pass `Tab`s.
 */
export function Tabs({
  indicator = "bottom",
  label,
  className,
  children,
}: TabsProps) {
  return (
    <nav
      className={[styles.tabs, className].filter(Boolean).join(" ")}
      data-indicator={indicator}
      aria-label={label}
    >
      {children}
    </nav>
  );
}

interface TabProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, "children"> {
  href: string;
  active?: boolean;
  icon?: React.ReactNode;
  /** After the label, outside the link — e.g. a menu button. Sits above the
   *  link, which otherwise covers the whole tab. */
  trailing?: React.ReactNode;
  /** Right-click on the tab's link. */
  onLinkContextMenu?: React.MouseEventHandler<HTMLAnchorElement>;
  children: React.ReactNode;
}

/** One tab: a link over the whole tab, plus an optional trailing control. */
export function Tab({
  href,
  active = false,
  icon,
  trailing,
  onLinkContextMenu,
  className,
  children,
  ...rest
}: TabProps) {
  return (
    <div
      className={[styles.tab, className].filter(Boolean).join(" ")}
      data-active={active || undefined}
      {...rest}
    >
      <Link
        href={href}
        className={styles.link}
        aria-current={active ? "page" : undefined}
        onContextMenu={onLinkContextMenu}
      >
        {icon && <span className={styles.icon}>{icon}</span>}
        <span className={styles.label}>{children}</span>
      </Link>
      {trailing && <span className={styles.trailing}>{trailing}</span>}
    </div>
  );
}
