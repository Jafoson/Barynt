"use client";

import { Icon } from "@iconify/react";
import { useFormatter, useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { ActivityFeed } from "@/features/audit/components/ActivityFeed/ActivityFeed";
import type {
  AttentionReason,
  DashboardIssue,
  WidgetData,
} from "@/features/dashboard/types";
import { Link } from "@/i18n/navigation";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import styles from "../widget.module.scss";
import type { BodyProps } from "./shared";

type Data = Extract<
  WidgetData,
  { type: "attention" | "issues" | "about" | "activity" | "note" }
>;

const REASON_TONE: Record<AttentionReason, "red" | "amber" | undefined> = {
  overdue: "red",
  unassigned: "amber",
  urgent: "red",
  stale: undefined,
};

/** Lists of issues, the about card, the activity feed and the note. */
export function ListBody(props: BodyProps & { data: Data }) {
  const { data } = props;
  switch (data.type) {
    case "attention":
    case "issues":
      return <Issues {...props} data={data} />;
    case "about":
      return <About data={data} />;
    case "activity":
      return <Activity {...props} data={data} />;
    case "note":
      return <Note {...props} />;
  }
}

function Issues({
  widget,
  data,
  issueHref,
}: BodyProps & { data: Extract<Data, { type: "attention" | "issues" }> }) {
  const t = useTranslations("widgets");
  const timeAgo = useTimeAgo();
  const format = useFormatter();
  const attention = data.type === "attention";

  if (data.issues.length === 0) {
    return (
      <div className={styles.empty}>
        {attention ? (
          <span>
            <Icon icon="lucide:circle-check" width={22} />
            <br />
            {t("attentionEmpty")}
          </span>
        ) : (
          t("empty")
        )}
      </div>
    );
  }

  const day = (ms: number) =>
    format.dateTime(new Date(ms), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const overdueDays = (issue: DashboardIssue) =>
    issue.dueDate
      ? Math.max(1, Math.round((Date.now() - issue.dueDate) / 86_400_000))
      : 0;

  return (
    <>
      {/* Small: just how many. */}
      <div className={`${styles.kpi} ${styles.onlyS}`}>
        <div>
          <div className={styles.big}>{data.total}</div>
          <div className={styles.sub}>
            {t("issuesCount", { count: data.total })}
          </div>
        </div>
      </div>
      <div className={`${styles.rows} ${styles.noS}`}>
        {data.issues.map((issue) => (
          <Link
            key={issue.id}
            href={issueHref(issue.ref)}
            className={styles.issue}
            title={`${issue.ref} · ${issue.title} · ${issue.statusName}`}
          >
            <span
              className={styles.dot}
              style={{ "--c": issue.statusColor } as CSSProperties}
            />
            <span className={styles.issueTitle}>
              <span className={styles.ref}>{issue.ref}</span>
              {issue.title}
            </span>
            {attention && issue.reason ? (
              <span
                className={styles.pill}
                data-tone={REASON_TONE[issue.reason]}
              >
                {issue.reason === "overdue"
                  ? t("overdueBy", { days: overdueDays(issue) })
                  : t(`reason_${issue.reason}`)}
              </span>
            ) : widget.config.sort === "dueDate" ? (
              <span className={styles.pill}>
                {issue.dueDate ? day(issue.dueDate) : "—"}
              </span>
            ) : (
              <span className={styles.pill}>{timeAgo(issue.updated)}</span>
            )}
          </Link>
        ))}
      </div>
    </>
  );
}

function About({ data }: { data: Extract<Data, { type: "about" }> }) {
  const t = useTranslations("widgets");
  const format = useFormatter();
  const about = data.about;
  if (!about) return null;
  return (
    <div className={styles.about}>
      <div className={styles.aboutHead}>
        {about.editHref && (
          <Link
            href={about.editHref}
            className={styles.aboutEdit}
            aria-label={t("editAbout")}
            title={t("editAbout")}
          >
            <Icon icon="lucide:pencil" width={14} />
          </Link>
        )}
        <Avatar
          avatar={{
            name: about.name,
            color: about.color,
            ...(about.avatarUrl ? { image: about.avatarUrl } : {}),
          }}
          size={40}
          shape="square"
        />
        <div>
          <b>{about.name}</b>
          <small>
            {about.prefix ? `${about.prefix} · ` : ""}
            {t("since", {
              date: format.dateTime(new Date(about.createdAt), {
                month: "long",
                year: "numeric",
                timeZone: "UTC",
              }),
            })}
          </small>
        </div>
      </div>
      <p className={`${styles.desc} ${styles.noShort}`}>
        {about.desc.trim() || t("noDesc")}
      </p>
      <div className={`${styles.facts} ${styles.noShort}`}>
        <div>
          <small>{t("members")}</small>
          <b>{about.memberCount}</b>
        </div>
        <div>
          <small>{t("openIssues")}</small>
          <b>{about.open}</b>
        </div>
        <div>
          <small>{about.projects === null ? t("prefix") : t("projects")}</small>
          <b>{about.projects ?? about.prefix}</b>
        </div>
      </div>
      {about.links.length > 0 && (
        <div className={`${styles.links} ${styles.onlyTall}`}>
          {about.links.map((link) => (
            <a key={link.id} href={link.url} target="_blank" rel="noreferrer">
              <Icon icon="lucide:external-link" width={11} />
              {link.label}
            </a>
          ))}
        </div>
      )}
      <div className={styles.stack}>
        {about.members.map((user) => (
          <Avatar key={user.id} avatar={user} size={26} />
        ))}
      </div>
    </div>
  );
}

function Activity({
  data,
  workspaceSlug,
}: BodyProps & { data: Extract<Data, { type: "activity" }> }) {
  const t = useTranslations("widgets");
  if (data.entries.length === 0) {
    return <div className={styles.empty}>{t("noActivity")}</div>;
  }
  return (
    <div className={styles.feed}>
      <ActivityFeed entries={data.entries} workspaceSlug={workspaceSlug} />
    </div>
  );
}

function Note({ widget }: BodyProps) {
  const t = useTranslations("widgets");
  const text = widget.config.text?.trim();
  return <p className={styles.note}>{text || t("noteEmpty")}</p>;
}
