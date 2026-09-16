"use client";

import { Icon } from "@iconify/react";
import { useFormatter, useTranslations } from "next-intl";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import type { IssueComposerData } from "@/features/issues/types";
import { fullName } from "@/lib/utils/string";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import type { Issue } from "@/types";
import styles from "../issueDetail.module.scss";
import type { IssueDetailLayout } from "../types";

interface IssueMetaProps {
  issue: Issue;
  data: IssueComposerData;
  layout: IssueDetailLayout;
}

/** Labeled row: name on the left, value on the right. */
function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.row}>
      <span className={styles.rowLabel}>{label}</span>
      <div className={styles.rowValue}>{children}</div>
    </div>
  );
}

/**
 * The issue's origin and timestamps. Display only — the project and
 * reporter are fixed, and the server writes the timestamps.
 *
 * In the main column, this block therefore gets its own section header and
 * sits at the bottom, after everything you can actually interact with. In
 * the attributes sidebar it closes things out without a heading — the
 * divider above it already separates it.
 */
export function IssueMeta({ issue, data, layout }: IssueMetaProps) {
  const { members, projects } = data;
  const t = useTranslations();
  const format = useFormatter();
  const timeAgo = useTimeAgo();

  const project = projects.find((p) => p.id === issue.project);
  const reporter = members.find((m) => m.id === issue.reporter) ?? null;

  const rows = (
    <>
      <Row label={t("fields.project")}>
        <span className={styles.value}>
          <span className="dot" style={{ background: project?.color }} />
          <span className={styles.valueText}>{project?.name ?? "—"}</span>
        </span>
      </Row>

      <Row label={t("fields.creator")}>
        <span className={styles.value}>
          <Avatar avatar={reporter} size={20} placeholder />
          <span className={styles.valueText}>
            {reporter ? fullName(reporter) : "—"}
          </span>
          {issue.source !== "APP" && (
            <Badge
              className={styles.sourceBadge}
              title={t("fields.createdVia", { source: issue.source })}
            >
              {issue.source}
            </Badge>
          )}
        </span>
      </Row>

      <Row label={t("fields.created")}>
        <span className={`${styles.value} ${styles.valueMuted}`}>
          {format.dateTime(issue.created, {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </span>
      </Row>

      <Row label={t("fields.updated")}>
        <span
          className={`${styles.value} ${styles.valueMuted}`}
          title={format.dateTime(issue.updated, {
            dateStyle: "long",
            timeStyle: "short",
          })}
          suppressHydrationWarning
        >
          {timeAgo(issue.updated)}
        </span>
      </Row>
    </>
  );

  if (layout === "aside") return rows;

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <Icon icon="lucide:info" width={15} aria-hidden="true" />
        <h3 className={styles.sectionTitle}>{t("fields.details")}</h3>
      </header>
      <div className={styles.rowGrid}>{rows}</div>
    </section>
  );
}
