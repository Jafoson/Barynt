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

  const since = t("since", {
    date: format.dateTime(new Date(about.createdAt), {
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }),
  });
  const facts: {
    key: "members" | "openIssues" | "teams" | "projects";
    value: number;
    icon: string;
  }[] = [
    { key: "members", value: about.memberCount, icon: "lucide:users" },
    { key: "openIssues", value: about.open, icon: "lucide:circle-dot" },
    about.projects === null
      ? { key: "teams", value: about.teams, icon: "lucide:users-round" }
      : { key: "projects", value: about.projects, icon: "lucide:folders" },
  ];
  const { done, inProgress, total } = about.progress;
  const pct = (n: number) => (total ? (n / total) * 100 : 0);
  const shown = about.members.slice(0, 7);
  const rest = about.memberCount - shown.length;

  return (
    <div className={styles.aboutBox}>
      {/* Who: avatar, name, what it is. */}
      <div className={styles.aboutHero}>
        <Avatar
          avatar={{
            name: about.name,
            color: about.color,
            ...(about.avatarUrl ? { image: about.avatarUrl } : {}),
          }}
          size={52}
          shape="square"
        />
        <div className={styles.aboutTitle}>
          <b>{about.name}</b>
          <span>
            {about.prefix && (
              <span className={styles.prefix}>{about.prefix}</span>
            )}
            {since}
          </span>
        </div>
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
      </div>

      {/* What it's for — or, for whoever may edit, the way to say so. */}
      <div className={styles.aboutText}>
        {about.desc.trim() ? (
          <p className={styles.aboutDesc}>{about.desc}</p>
        ) : about.editHref ? (
          <Link href={about.editHref} className={styles.aboutAdd}>
            <Icon icon="lucide:plus" width={13} />
            {t("addDesc")}
          </Link>
        ) : (
          <p className={styles.aboutDesc} data-empty>
            {t("noDesc")}
          </p>
        )}
        {about.links.length > 0 && (
          <div className={styles.aboutLinks}>
            {about.links.map((link) => (
              <a key={link.id} href={link.url} target="_blank" rel="noreferrer">
                <Icon icon="lucide:external-link" width={11} />
                {link.label}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* How big: the numbers, and (extra large) how far it's come. */}
      <div className={styles.aboutSide}>
        <div className={styles.aboutFacts}>
          {facts.map((fact) => (
            <div key={fact.key}>
              <Icon icon={fact.icon} width={16} />
              <b>{fact.value}</b>
              <small>{t(fact.key)}</small>
            </div>
          ))}
        </div>
        <div className={styles.aboutProgress}>
          <div className={styles.aboutProgressHead}>
            <span>{t("progressLabel")}</span>
            <b>{Math.round(pct(done))} %</b>
          </div>
          <div className={styles.aboutBar}>
            <i data-part="done" style={{ width: `${pct(done)}%` }} />
            <i data-part="started" style={{ width: `${pct(inProgress)}%` }} />
          </div>
          <div className={styles.legend}>
            <span>
              <i data-part="done" />
              {t("doneSeries")} <b>{done}</b>
            </span>
            <span>
              <i data-part="started" />
              {t("inProgress")} <b>{inProgress}</b>
            </span>
            <span>
              <i data-part="open" />
              {t("openPart")} <b>{total - done - inProgress}</b>
            </span>
          </div>
        </div>
      </div>

      {/* Who's in. */}
      <div className={styles.aboutPeople}>
        <span className={styles.aboutStack}>
          {shown.map((user) => (
            <Avatar key={user.id} avatar={user} size={30} />
          ))}
          {rest > 0 && <span className={styles.more2}>+{rest}</span>}
        </span>
        <span className={styles.aboutPeopleText}>
          {t("memberCount", { count: about.memberCount })}
        </span>
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
