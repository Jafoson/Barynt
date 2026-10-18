"use client";

import { Icon } from "@iconify/react";
import { useFormatter, useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";
import type { DashboardIssue, WidgetData } from "@/features/dashboard/types";
import {
  elementOf,
  elementsOf,
  METRIC_MORE_IS_GOOD,
} from "@/features/dashboard/widgets";
import { Link } from "@/i18n/navigation";
import styles from "../widget.module.scss";
import { type BodyProps, Spark } from "./shared";

type Data = Extract<WidgetData, { type: "kpi" | "progress" }>;

/**
 * A number with its trend, or how far a set of issues is done — the main
 * part — plus the elements the widget has (BARY-170): a goal, a second
 * number, a mini list, a link; for progress a breakdown, a deadline and a
 * forecast.
 */
export function NumberBody({ widget, data }: BodyProps & { data: Data }) {
  const t = useTranslations("widgets");
  const format = useFormatter();
  const num = (n: number) => format.number(n, { maximumFractionDigits: 1 });
  const unit =
    widget.config.measure && widget.config.measure !== "count"
      ? t(`unit_${widget.config.measure}`)
      : null;
  const elements = elementsOf(widget);
  const has = (kind: (typeof elements)[number]["kind"]) =>
    elements.some((e) => e.kind === kind);

  /** The elements below the main part, in their order. */
  const extras = (): ReactNode[] =>
    elements.flatMap((e) => {
      if (e.kind === "second" && data.second) {
        return [
          <Extra key={e.id} href={data.second.href}>
            <span className={styles.secondLabel}>
              {t("secondOf", { name: filterSummary(e.filter, t) })}
            </span>
            <b>
              {num(data.second.value)}
              {unit && <small> {unit}</small>}
            </b>
          </Extra>,
        ];
      }
      if (e.kind === "miniList" && data.type === "kpi" && data.list?.length) {
        return [<MiniList key={e.id} issues={data.list} />];
      }
      if (e.kind === "link" && data.href) {
        return [
          <Link key={e.id} href={data.href} className={styles.elLink}>
            {t("seeAll")}
            <Icon icon="lucide:arrow-right" width={13} />
          </Link>,
        ];
      }
      return [];
    });

  if (data.type === "progress") {
    const share = data.total ? Math.round((data.done / data.total) * 100) : 0;
    const working = data.total ? (data.inProgress / data.total) * 100 : 0;
    const deadline = elementOf(widget, "deadline")?.date;
    const daysLeft = deadline
      ? Math.ceil(
          (new Date(`${deadline}T12:00:00Z`).getTime() - Date.now()) /
            86_400_000,
        )
      : null;
    const forecast =
      has("forecast") && data.forecastDays != null
        ? format.dateTime(
            new Date(Date.now() + data.forecastDays * 86_400_000),
            { day: "numeric", month: "short", timeZone: "UTC" },
          )
        : null;
    return (
      <div className={styles.progress}>
        <div className={styles.big}>
          {share}
          <small>%</small>
        </div>
        <div className={styles.progressBar} role="presentation">
          <i style={{ width: `${share}%` }} />
          {has("breakdown") && <i style={{ width: `${working}%` }} />}
        </div>
        <div className={styles.sub}>
          {t("progressOf", { done: num(data.done), total: num(data.total) })}
          {has("breakdown") && (
            <span className={styles.noS}>
              {" · "}
              {t("progressWorking", { count: data.inProgress })}
            </span>
          )}
        </div>
        {(daysLeft !== null || forecast) && (
          <div className={`${styles.sub} ${styles.noShort}`}>
            {daysLeft !== null &&
              (daysLeft >= 0
                ? t("daysLeft", { days: daysLeft })
                : t("daysLate", { days: -daysLeft }))}
            {daysLeft !== null && forecast && " · "}
            {forecast && t("forecast", { date: forecast })}
          </div>
        )}
        {extras()}
      </div>
    );
  }

  const metric = widget.config.metric ?? "open";
  const isDays = metric === "cycleTime";
  const delta =
    data.value !== null && data.previous !== null
      ? Math.round((data.value - data.previous) * 10) / 10
      : null;
  const good =
    delta !== null && delta !== 0
      ? delta > 0 === METRIC_MORE_IS_GOOD[metric]
      : null;
  const goal = elementOf(widget, "goal")?.value;
  const reached =
    goal && data.value !== null ? Math.min(1, data.value / goal) : null;

  return (
    <div className={styles.kpiStack}>
      <div className={styles.kpi}>
        <div className={styles.kpiMain}>
          {reached !== null && (
            <span
              className={styles.goalRing}
              style={{ "--p": reached } as CSSProperties}
              aria-hidden="true"
            />
          )}
          <div>
            <div className={styles.big}>
              {data.value === null ? "–" : num(data.value)}
              {isDays && data.value !== null && <small>{t("daysUnit")}</small>}
              {!isDays && unit && <small>{unit}</small>}
              {goal !== undefined && <small> / {num(goal)}</small>}
            </div>
            <div className={styles.sub}>
              {has("trend") && delta !== null && delta !== 0 ? (
                <>
                  <span className={good ? styles.good : styles.bad}>
                    {delta > 0 ? "▲" : "▼"} {num(Math.abs(delta))}
                  </span>{" "}
                  {t("vsBefore")}
                </>
              ) : has("trend") && delta === 0 ? (
                t("unchanged")
              ) : (
                t(`metricHint_${metric}`)
              )}
            </div>
          </div>
        </div>
        {has("spark") && data.spark && (
          <span className={`${styles.grow} ${styles.noS}`}>
            <Spark values={data.spark} area={isDays} />
          </span>
        )}
      </div>
      {extras()}
    </div>
  );
}

/** A small tile under the number — a link when it has one. */
function Extra({
  href,
  children,
}: {
  href: string | null;
  children: ReactNode;
}) {
  return href ? (
    <Link href={href} className={`${styles.extra} ${styles.noShort}`}>
      {children}
    </Link>
  ) : (
    <div className={`${styles.extra} ${styles.noShort}`}>{children}</div>
  );
}

function MiniList({ issues }: { issues: DashboardIssue[] }) {
  return (
    <div className={`${styles.miniList} ${styles.noShort}`}>
      {issues.map((issue) => (
        <span key={issue.id} title={issue.title}>
          <i style={{ "--c": issue.statusColor } as CSSProperties} />
          <span className={styles.ref}>{issue.ref}</span>
          <span className={styles.issueTitle}>{issue.title}</span>
        </span>
      ))}
    </div>
  );
}

/** "Priorität ≥ Hoch"-ish: how many conditions the second number adds. */
function filterSummary(
  filter: { rules: unknown[] } | undefined,
  t: ReturnType<typeof useTranslations<"widgets">>,
): string {
  return t("filterCount", { count: filter?.rules.length ?? 0 });
}
