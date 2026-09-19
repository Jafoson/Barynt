"use client";

import { Icon } from "@iconify/react";
import { Avatar, type AvatarShape } from "@/components/ui/atoms/Avatar/Avatar";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import styles from "@/components/ui/atoms/Button/button.module.scss";
import { Link, usePathname } from "@/i18n/navigation";
import { isNavActive } from "@/lib/nav";
import navStyles from "./navLink.module.scss";

export interface NavLinkProps {
  href: string;
  icon?: string;
  label: string;
  activeHref?: string;
  badge?: number;
  color?: string;
  /** Uploaded image instead of the color dot, e.g. a workspace avatar. */
  image?: string;
  /** Shape of the color dot/image when using `color`. Default: circle. */
  shape?: AvatarShape;
  onClick?: () => void;
  /** Left out of the sidebar menu on a phone (the board, which a phone doesn't have). */
  hideOnPhone?: boolean;
}

/**
 * A row in a navigation — the shared building block of the sidebar and the
 * settings menus alongside it.
 *
 * Appearance and size come from the button (`components/ui/atoms/Button`),
 * and it's marked active via `isNavActive`, following the same rule as
 * everywhere else. Two levels of the same navigation shouldn't feel
 * different — that's why this row lives here and not in the sidebar.
 */

export function NavLink({
  href,
  icon,
  label,
  activeHref,
  badge,
  color,
  image,
  shape,
  onClick,
  hideOnPhone,
}: NavLinkProps) {
  const pathname = usePathname();

  function isActive() {
    return isNavActive(pathname, href, activeHref);
  }
  function LeadingIcon() {
    // Without its own icon, the entry represents a named entity (project,
    // workspace, ...) rather than a route — the same image-or-initials logic
    // used everywhere else entities show up (`Avatar`), instead of an
    // undifferentiated color dot.
    if (!icon && color) {
      return (
        <Avatar
          avatar={{ name: label, color, image }}
          shape={shape ?? "circle"}
          size={17}
        />
      );
    }
    if (!icon) {
      return <Icon width={17} icon="material-symbols:circle" color={color} />;
    }
    return (
      <Icon icon={icon} width={17} color={color ? color : "currentColor"} />
    );
  }

  return (
    <Link
      href={href}
      className={`${styles.btn} ${styles.ghost} ${styles.md} ${styles.full} ${styles.hasIcon} ${styles["textAlign-left"]} ${styles.link} ${navStyles.row}${hideOnPhone ? ` ${navStyles.phoneHidden}` : ""}`}
      // The full name: the row only truncates it visually, and in the
      // sidebar's icon rail the text isn't shown at all.
      title={label}
      data-active={isActive() ? "true" : undefined}
      onClick={onClick}
    >
      <LeadingIcon />
      <span className={navStyles.label}>{label}</span>
      {badge && (
        <Badge className={navStyles.badge} style={{ marginLeft: "auto" }}>
          {badge}
        </Badge>
      )}
    </Link>
  );
}
