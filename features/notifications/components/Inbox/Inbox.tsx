"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import type { NotificationEvent } from "@/features/account/types";
import { StatusIcon } from "@/features/issues/components/IssueIcons/IssueIcons";
import { useIssueOpen } from "@/features/issues/issue-links";
import {
  markAllNotificationsRead,
  markNotificationRead,
} from "@/features/notifications/actions";
import type {
  NotificationFilter,
  NotificationRow,
} from "@/features/notifications/types";
import { Link, useRouter } from "@/i18n/navigation";
import { projectPath, workspacePath } from "@/lib/nav";
import { timeAgo } from "@/lib/utils/date";
import type { Status } from "@/types";
import styles from "./inbox.module.scss";

interface Props {
  notifications: NotificationRow[];
  workspaceId: string;
  filter: NotificationFilter;
  statuses: Status[];
}

const EVENT_ICON: Record<NotificationEvent, string> = {
  assigned: "lucide:user-check",
  mentioned: "lucide:at-sign",
  comment: "lucide:message-circle",
  commentReply: "lucide:reply",
  status: "lucide:refresh-cw",
  invite: "lucide:user-plus",
  role: "lucide:shield",
  issueShared: "lucide:link",
};

export function Inbox({ notifications, workspaceId, filter, statuses }: Props) {
  const t = useTranslations();
  const router = useRouter();
  const issueOpen = useIssueOpen(workspaceId);
  const [, startTransition] = useTransition();

  const hasUnread = notifications.some((n) => !n.read);

  const pickScope = (next: string) => {
    startTransition(() => {
      const query = next === "all" ? "" : `?scope=${next}`;
      router.replace(`${workspacePath(workspaceId, "inbox")}${query}`);
    });
  };

  const markAllRead = () => {
    startTransition(() => {
      markAllNotificationsRead(workspaceId);
    });
  };

  const markRead = (id: string) => {
    startTransition(() => {
      markNotificationRead(id);
    });
  };

  const sentence = (n: NotificationRow) => {
    const actor = n.actorLabel;
    const issue = n.issue?.title ?? "";
    switch (n.type) {
      case "assigned":
        return t("inbox.event.assigned", { actor, issue });
      case "mentioned":
        return t("inbox.event.mentioned", { actor, issue });
      case "comment":
        return t("inbox.event.comment", { actor, issue });
      case "commentReply":
        return t("inbox.event.commentReply", { actor, issue });
      case "status": {
        const label = statuses.find((s) => s.id === n.text)?.name ?? n.text;
        return t("inbox.event.status", { actor, issue, status: label });
      }
      case "invite":
        return n.project
          ? t("inbox.event.inviteProject", { actor, project: n.project.name })
          : t("inbox.event.inviteWorkspace", { actor });
      case "role":
        return n.project
          ? t("inbox.event.roleProject", {
              actor,
              project: n.project.name,
              role: n.text,
            })
          : t("inbox.event.roleWorkspace", { actor, role: n.text });
      case "issueShared":
        return t("inbox.event.issueShared", { actor, issue });
    }
  };

  const target = (n: NotificationRow) =>
    n.project
      ? projectPath(workspaceId, n.project.slug, "members")
      : workspacePath(workspaceId, "members");

  if (notifications.length === 0) {
    return (
      <div className={styles.root}>
        <PageHeader
          divider={false}
          title={t("nav.inbox")}
          actions={
            <SegmentedControl
              variant="surface"
              value={filter}
              onChange={pickScope}
              items={[
                { value: "all", label: t("inbox.scope.all") },
                { value: "workspace", label: t("inbox.scope.workspace") },
                { value: "project", label: t("inbox.scope.project") },
              ]}
            />
          }
        />
        <div className={styles.empty}>
          <Icon icon="lucide:inbox" width={36} style={{ opacity: 0.3 }} />
          <p>{t("empty.allCaughtUp")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <PageHeader
        divider={false}
        title={t("nav.inbox")}
        actions={
          <>
            {hasUnread && (
              <Button variant="text" size="sm" onClick={markAllRead}>
                {t("inbox.markAllRead")}
              </Button>
            )}
            <SegmentedControl
              variant="surface"
              value={filter}
              onChange={pickScope}
              items={[
                { value: "all", label: t("inbox.scope.all") },
                { value: "workspace", label: t("inbox.scope.workspace") },
                { value: "project", label: t("inbox.scope.project") },
              ]}
            />
          </>
        }
      />

      <div className={styles.list}>
        {notifications.map((n) => {
          const rowClass = [styles.item, !n.read && styles.unread]
            .filter(Boolean)
            .join(" ");
          const meta = n.issue ? (
            <span className={styles.meta}>
              <StatusIcon
                status={n.issue.status}
                size={12}
                color={statuses.find((s) => s.id === n.issue?.status)?.color}
              />
              <span className={`mono ${styles.identifier}`}>
                {n.issue.identifier}
              </span>
            </span>
          ) : n.project ? (
            <span className={styles.meta}>{n.project.name}</span>
          ) : null;

          const content = (
            <>
              <span className={styles.iconWrap}>
                <Icon icon={EVENT_ICON[n.type]} width={16} />
              </span>
              <div className={styles.content}>
                <p className={styles.sentence}>{sentence(n)}</p>
                {meta}
              </div>
              <span className={styles.time} suppressHydrationWarning>
                {timeAgo(n.createdAt)}
              </span>
            </>
          );

          if (n.issue) {
            const linkProps = issueOpen.linkProps(n.issue.identifier);
            return (
              <Link
                key={n.id}
                className={rowClass}
                {...linkProps}
                scroll={false}
                onClick={(event) => {
                  if (!n.read) markRead(n.id);
                  linkProps.onClick(event);
                }}
              >
                {content}
              </Link>
            );
          }

          return (
            <Link
              key={n.id}
              className={rowClass}
              href={target(n)}
              onClick={() => {
                if (!n.read) markRead(n.id);
              }}
            >
              {content}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
