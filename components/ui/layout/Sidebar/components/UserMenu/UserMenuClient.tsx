"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState } from "react";
import {
  Avatar,
  type PersonAvatarData,
} from "@/components/ui/atoms/Avatar/Avatar";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import buttonStyles from "@/components/ui/atoms/Button/button.module.scss";
import { Popover } from "@/components/ui/atoms/Popover/Popover";
import { NavLink } from "@/components/ui/layout/NavLink/NavLink";
import { logout } from "@/features/auth/actions";
import { Link } from "@/i18n/navigation";
import { fullName } from "@/lib/utils/string";
import styles from "./UserMenu.module.scss";

interface UserMenuClientProps {
  me: PersonAvatarData;
  /**
   * Path to the account settings. `null` when there's no workspace they
   * could live under — then the entry is omitted.
   */
  settingsHref: string | null;
  /** Path to the inbox. `null` for the same reason as `settingsHref`. */
  inboxHref: string | null;
  /**
   * Path into platform administration. `null` without `platform.access` —
   * then the entry is omitted entirely rather than just grayed out (see
   * `UserMenu`).
   */
  adminHref: string | null;
  /** Unread notifications in the active workspace. */
  unreadCount: number;
  /** The running app version (`package.json`). */
  version: string;
  /** The repository the version line links to. */
  githubUrl: string;
}

/**
 * The user's own menu at the bottom of the sidebar.
 *
 * Entries that lead onward come first — settings, then (for the few who
 * have it) platform administration — followed by sign out. A line between
 * the two groups: one leads onward, the other leads out, and having both
 * directly stacked would be an invitation to misclick.
 */
function UserMenuClient({
  me,
  settingsHref,
  inboxHref,
  adminHref,
  unreadCount,
  version,
  githubUrl,
}: UserMenuClientProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");

  return (
    <>
      <div className={styles.wrapper} ref={ref}>
        <Button
          onClick={() => setOpen(!open)}
          variant="elevated"
          full
          textAlign="left"
          icon={<Avatar avatar={me} size={28} />}
          className={styles.trigger}
          style={{ height: "48px", borderRadius: "var(--radius)" }}
        >
          <span className={styles.title}>
            {fullName(me) || (me.handle ? `@${me.handle}` : "")}
          </span>
        </Button>

        {inboxHref && (
          <span className={styles.bellSlot}>
            <Link
              href={inboxHref}
              aria-label={t("inbox")}
              className={[
                buttonStyles.btn,
                buttonStyles.ghost,
                buttonStyles.md,
                buttonStyles.iconOnly,
              ].join(" ")}
            >
              <Icon icon="lucide:bell" height={20} />
            </Link>
            {unreadCount > 0 && (
              <Badge size="sm" active className={styles.bellBadge}>
                <span>{unreadCount > 99 ? "99+" : unreadCount}</span>
              </Badge>
            )}
          </span>
        )}
        <Popover
          open={open}
          onClose={() => setOpen(false)}
          anchorRef={ref}
          side="bottom"
          width={210}
        >
          {(settingsHref || adminHref) && (
            <>
              {/* The same row as in the sidebar and the settings navs — a
                menu entry that leads elsewhere is a link and should behave
                like one too (middle-click, "open in new tab"). */}
              {settingsHref && (
                <NavLink
                  href={settingsHref}
                  activeHref={`${settingsHref}/*`}
                  icon="lucide:settings"
                  label={t("settings")}
                  onClick={() => setOpen(false)}
                />
              )}
              {adminHref && (
                <NavLink
                  href={adminHref}
                  activeHref={`${adminHref}/*`}
                  icon="lucide:shield"
                  label={t("admin")}
                  onClick={() => setOpen(false)}
                />
              )}
              <hr className={styles.divider} />
            </>
          )}
          <Button
            variant="ghost"
            size="lg"
            full
            icon={<Icon icon="lucide:log-out" height={16} />}
            textAlign="left"
            onClick={() => {
              logout();
              setOpen(false);
            }}
          >
            {t("signOut")}
          </Button>
        </Popover>
      </div>
      <a
        className={styles.about}
        href={githubUrl}
        target="_blank"
        rel="noopener noreferrer"
        title={t("openOnGithub")}
      >
        <Icon icon="lucide:github" height={12} />
        <span>Barynt v{version}</span>
      </a>
    </>
  );
}

export default UserMenuClient;
