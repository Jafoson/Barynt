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

  const second =
    data.second &&
    ((key: string, filter: { rules: unknown[] } | undefined) => (
      <Extra key={key} href={data.second?.href ?? null}>
        <span className={styles.secondLabel}>
          {t("secondOf", { name: filterSummary(filter, t) })}
        </span>
        <b>
          {num(data.second?.value ?? 0)}
          {unit && <small> {unit}</small>}
        </b>
      </Extra>
    ));

  if (data.type === "progress") {
    const share = data.total ? Math.round((data.done / data.total) * 100) : 0;
    const working = data.total ? (data.inProgress / data.total) * 100 : 0;
    const today = Date.now();
    const day = (ms: number) =>
      format.dateTime(new Date(ms), {
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      });
    // The elements under the bar, each its own line, in their order.
    const blocks = elements.map((e) => {
      if (e.kind === "deadline" && e.date) {
        const left = Math.ceil(
          (new Date(`${e.date}T12:00:00Z`).getTime() - today) / 86_400_000,
        );
        return (
          <div key={e.id} className={`${styles.sub} ${styles.noShort}`}>
            <Icon
              icon="lucide:calendar"
              width={12}
              className={styles.subIcon}
            />
            {day(new Date(`${e.date}T12:00:00Z`).getTime())} ·{" "}
            {left >= 0
              ? t("daysLeft", { days: left })
              : t("daysLate", { days: -left })}
          </div>
        );
      }
      if (e.kind === "forecast" && data.forecastDays != null) {
        return (
          <div key={e.id} className={`${styles.sub} ${styles.noShort}`}>
            <Icon
              icon="lucide:telescope"
              width={12}
              className={styles.subIcon}
            />
            {t("forecast", {
              date: day(today + data.forecastDays * 86_400_000),
            })}
          </div>
        );
      }
      if (e.kind === "second" && second) return second(e.id, e.filter);
      return null;
    });
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
        {blocks}
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

  // Under the number, each element is a block of its own, in its order.
  const blocks = elements.map((e) => {
    switch (e.kind) {
      case "trend":
        return (
          <div key={e.id} className={styles.sub}>
            {delta !== null && delta !== 0 ? (
              <>
                <span className={good ? styles.good : styles.bad}>
                  {delta > 0 ? "▲" : "▼"} {num(Math.abs(delta))}
                </span>{" "}
                {t("vsBefore")}
              </>
            ) : delta === 0 ? (
              t("unchanged")
            ) : (
              t(`metricHint_${metric}`)
            )}
          </div>
        );
      case "spark":
        return data.spark ? (
          <span key={e.id} className={`${styles.sparkBlock} ${styles.noS}`}>
            <Spark values={data.spark} area={isDays} />
          </span>
        ) : null;
      case "second":
        return second ? second(e.id, e.filter) : null;
      case "miniList":
        return data.list?.length ? (
          <MiniList key={e.id} issues={data.list} />
        ) : null;
      case "link":
        return data.href ? (
          <Link
            key={e.id}
            href={data.href}
            className={`${styles.elLink} ${styles.noShort}`}
          >
            {t("seeAll")}
            <Icon icon="lucide:arrow-right" width={13} />
          </Link>
        ) : null;
      default:
        return null;
    }
  });

  return (
    <div className={styles.kpiStack}>
      <div className={styles.kpiMain}>
        {reached !== null && (
          <span
            className={styles.goalRing}
            style={{ "--p": reached } as CSSProperties}
            aria-hidden="true"
          />
        )}
        <div className={styles.big}>
          {data.value === null ? "–" : num(data.value)}
          {isDays && data.value !== null && <small>{t("daysUnit")}</small>}
          {!isDays && unit && <small>{unit}</small>}
          {goal !== undefined && <small> / {num(goal)}</small>}
        </div>
      </div>
      {!has("trend") && (
        <div className={styles.sub}>{t(`metricHint_${metric}`)}</div>
      )}
      {blocks}
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
