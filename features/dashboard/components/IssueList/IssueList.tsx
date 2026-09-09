"use client";

import { Icon } from "@iconify/react";
import type { ReactNode } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import type { DashboardIssue } from "@/features/dashboard/types";
import {
  PriorityIcon,
  StatusIcon,
} from "@/features/issues/components/IssueIcons/IssueIcons";
import { Link } from "@/i18n/navigation";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import styles from "./issueList.module.scss";

interface Props<T extends DashboardIssue> {
  issues: T[];
  /** Builds an issue's address from its reference (`NIM-142`). */
  hrefFor: (ref: string) => string;
  /**
   * A badge on the far right, before the timestamp — e.g. "Stale".
   *
   * Gets the row in its own type, not just as `DashboardIssue`: "needs
   * attention" attaches its reason to the row, and without the type
   * parameter the caller would have to look it back up from its own list.
   */
  badgeFor?: (issue: T) => ReactNode;
  emptyIcon: ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
}

/**
 * A short list of issues, the way the dashboard shows them: priority,
 * status, reference, title — and on the right, who's responsible and when
 * something last happened.
 *
 * Every row is a link to the issue. That's the list's purpose: it doesn't
 * conclusively answer a question, it shows where to read on.
 *
 * The two icons on the left stay in a fixed order and fixed width, so they
 * form two aligned columns down the rows instead of dancing around — as on
 * the board and in the list they originate from.
 */
export function IssueList<T extends DashboardIssue>({
  issues,
  hrefFor,
  badgeFor,
  emptyIcon,
  emptyTitle,
  emptyDescription,
}: Props<T>) {
  const timeAgo = useTimeAgo();

  if (issues.length === 0) {
    return (
      <EmptyState
        className={styles.empty}
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <ul className={styles.list}>
      {issues.map((issue) => {
        const badge = badgeFor?.(issue);
        return (
          <li key={issue.id}>
            <Link href={hrefFor(issue.ref)} className={styles.row}>
              <span className={styles.icons}>
                <PriorityIcon priority={issue.priority} size={14} />
                <StatusIcon
                  status={issue.status}
                  size={14}
                  color={issue.statusColor}
                />
              </span>

              <span className={styles.ref}>{issue.ref}</span>
              <span className={styles.title}>{issue.title}</span>

              {badge}

              {/* With no assignee, the spot stays empty instead of filled: a
                  placeholder avatar here would look like an actual person. */}
              {issue.assignee ? (
                <Avatar avatar={issue.assignee} size={20} />
              ) : (
                <span className={styles.noAvatar} aria-hidden="true" />
              )}

              <span className={styles.time} suppressHydrationWarning>
                {timeAgo(issue.updated)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The badge for a reason in "needs attention". */
export function ReasonBadge({ icon, label }: { icon: string; label: string }) {
  return (
    <Badge size="sm" mono={false} className={styles.reason}>
      <Icon icon={icon} width={12} />
      {label}
    </Badge>
  );
}
