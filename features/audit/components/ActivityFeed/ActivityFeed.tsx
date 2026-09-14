"use client";

import { Icon } from "@iconify/react";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import {
  auditActionMeta,
  TargetLabel,
} from "@/features/audit/components/AuditLog/AuditLog";
import { type AuditEntry, actorDisplayName } from "@/lib/audit/actions";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import styles from "./activityFeed.module.scss";

interface Props {
  entries: AuditEntry[];
  /** To link an issue's reference (`TargetLabel`). */
  workspaceSlug: string;
  /** Passed through to `TargetLabel` — see its doc comment. */
  hideRef?: boolean;
}

/**
 * The compact excerpt of the activity log for the overview — the full,
 * filterable table is `AuditLog` under settings. Two-line like the person
 * rows on the members card, not the single-line teams/labels row: here it
 * always also states who did it and when.
 */
export function ActivityFeed({ entries, workspaceSlug, hideRef }: Props) {
  const t = useTranslations();
  const timeAgo = useTimeAgo();
  const format = useFormatter();

  return (
    <ul className={styles.list}>
      {entries.map((entry) => {
        const actionMeta = auditActionMeta(entry.action);
        return (
          <li key={entry.id} className={styles.row}>
            <Icon icon={actionMeta.icon} width={15} className={styles.icon} />
            <span className={styles.text}>
              <span className={styles.line}>
                <span className={styles.actionName}>
                  {actionMeta.message
                    ? t(`audit.action.${actionMeta.message}`)
                    : entry.action}
                </span>
                {entry.targetLabel && (
                  <TargetLabel
                    text={entry.targetLabel}
                    action={entry.action}
                    meta={entry.meta}
                    personColor={entry.personColor}
                    workspaceSlug={workspaceSlug}
                    projectRef={entry.projectRef}
                    workspaceRef={entry.workspaceRef}
                    hideRef={hideRef}
                  />
                )}
              </span>
              <span className={styles.meta} suppressHydrationWarning>
                <Avatar
                  avatar={
                    entry.actorColor
                      ? {
                          name: actorDisplayName(entry.actorLabel),
                          color: entry.actorColor,
                          image: entry.actorAvatarUrl ?? undefined,
                        }
                      : null
                  }
                  shape="circle"
                  size={16}
                  fontSize={9}
                  placeholder
                  placeholderLabel={entry.actorLabel}
                />
                {entry.actorLabel} · {timeAgo(entry.createdAt.getTime())} ·{" "}
                <time
                  dateTime={entry.createdAt.toISOString()}
                  suppressHydrationWarning
                >
                  {format.dateTime(entry.createdAt, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </time>
              </span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
