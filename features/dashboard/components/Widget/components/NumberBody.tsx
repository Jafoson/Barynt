"use client";

import { Icon } from "@iconify/react";
import { useFormatter, useTranslations } from "next-intl";
import type { CSSProperties, ReactNode } from "react";
import type { DashboardIssue, WidgetData } from "@/features/dashboard/types";
import {
  METRIC_MORE_IS_GOOD,
  shownElement,
  shownElements,
  type WidgetElement,
} from "@/features/dashboard/widgets";
import { Link } from "@/i18n/navigation";
import styles from "../widget.module.scss";
import { type BodyProps, marked, Spark } from "./shared";

type Data = Extract<WidgetData, { type: "kpi" | "progress" }>;

const DAY = 86_400_000;

/**
 * A number with its trend, or how far a set of issues is done — the main
 * part — plus the elements the widget has (BARY-170), each with its own
 * settings: a goal, a second number, a mini list, a link; for progress a
 * deadline and a forecast.
 */
export function NumberBody({
  widget,
  data,
  activeElement,
}: BodyProps & { data: Data }) {
  const t = useTranslations("widgets");
  const format = useFormatter();
  const num = (n: number) => format.number(n, { maximumFractionDigits: 1 });
  const unit =
    widget.config.measure && widget.config.measure !== "count"
      ? t(`unit_${widget.config.measure}`)
      : null;
  const elements = shownElements(widget);
  const has = (kind: WidgetElement["kind"]) =>
    elements.some((e) => e.kind === kind);
  const mark = (e: WidgetElement) => marked(activeElement, e.id);
  const day = (ms: number) =>
    format.dateTime(new Date(ms), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

  /** "davon dringend 6" — as a number, a share of `main`, or both. */
  const second = (e: WidgetElement, main: number | null) => {
    if (!data.second) return null;
    const value = data.second.value;
    const share =
      main && main > 0 ? `${Math.round((value / main) * 100)} %` : null;
    const shown =
      e.style === "percent" && share ? (
        share
      ) : (
        <>
          {num(value)}
          {unit && <small> {unit}</small>}
          {e.style === "both" && share && <small> · {share}</small>}
        </>
      );
    const name =
      e.label?.trim() ||
      t("filterCount", { count: e.filter?.rules.length ?? 0 });
    const inner = (
      <>
        <span className={styles.secondLabel}>{t("secondOf", { name })}</span>
        <b>{shown}</b>
      </>
    );
    const className = `${styles.extra} ${styles.noShort}`;
    return data.second.href ? (
      <Link
        key={e.id}
        href={data.second.href}
        className={className}
        {...mark(e)}
      >
        {inner}
      </Link>
    ) : (
      <div key={e.id} className={className} {...mark(e)}>
        {inner}
      </div>
    );
  };

  if (data.type === "progress") {
    const share = data.total ? Math.round((data.done / data.total) * 100) : 0;
    const working = data.total ? (data.inProgress / data.total) * 100 : 0;
    const today = Date.now();
    // The elements under the bar, each its own line, in their order.
    const blocks = elements.map((e) => {
      if (e.kind === "deadline" && e.date) {
        const at = new Date(`${e.date}T12:00:00Z`).getTime();
        const left = Math.ceil((at - today) / DAY);
        return (
          <div
            key={e.id}
            className={`${styles.sub} ${styles.noShort}`}
            {...mark(e)}
          >
            <Icon
              icon="lucide:calendar"
              width={12}
              className={styles.subIcon}
            />
            {e.label?.trim() && <b>{e.label.trim()} · </b>}
            {day(at)} ·{" "}
            {left >= 0
              ? t("daysLeft", { days: left })
              : t("daysLate", { days: -left })}
          </div>
        );
      }
      if (e.kind === "forecast" && data.forecastDays != null) {
        return (
          <div
            key={e.id}
            className={`${styles.sub} ${styles.noShort}`}
            {...mark(e)}
          >
            <Icon
              icon="lucide:telescope"
              width={12}
              className={styles.subIcon}
            />
            {t("forecast", { date: day(today + data.forecastDays * DAY) })}
          </div>
        );
      }
      if (e.kind === "second") return second(e, data.total);
      return null;
    });
    const breakdown = shownElement(widget, "breakdown");
    return (
      <div className={styles.progress}>
        <div className={styles.big}>
          {share}
          <small>%</small>
        </div>
        <div className={styles.progressBar} role="presentation">
          <i style={{ width: `${share}%` }} />
          {breakdown && <i style={{ width: `${working}%` }} />}
        </div>
        <div className={styles.sub}>
          {t("progressOf", { done: num(data.done), total: num(data.total) })}
          {breakdown && (
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
  const goalEl = shownElement(widget, "goal");
  const goal = goalEl?.value;
  const reached =
    goal && data.value !== null ? Math.min(1, data.value / goal) : null;
  const ring = reached !== null && goalEl?.style !== "bar";

  // Under the number, each element is a block of its own, in its order.
  const blocks = elements.map((e): ReactNode => {
    switch (e.kind) {
      case "trend": {
        // "Farben umkehren": a rise counts as bad where it'd be good.
        const moreIsGood = METRIC_MORE_IS_GOOD[metric] !== !!e.flag;
        const good = delta !== null && delta !== 0 && delta > 0 === moreIsGood;
        const pct =
          e.style === "pct" && delta !== null && data.previous
            ? `${num(Math.abs((delta / data.previous) * 100))} %`
            : null;
        return (
          <div key={e.id} className={styles.sub} {...mark(e)}>
            {delta !== null && delta !== 0 ? (
              <>
                <span className={good ? styles.good : styles.bad}>
                  {delta > 0 ? "▲" : "▼"} {pct ?? num(Math.abs(delta))}
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
      }
      case "spark": {
        const style = e.style ?? (isDays ? "area" : "line");
        return data.spark ? (
          <span
            key={e.id}
            className={`${styles.sparkBlock} ${styles.noS}`}
            {...mark(e)}
          >
            <Spark
              values={data.spark}
              area={style === "area"}
              bars={style === "bars"}
            />
          </span>
        ) : null;
      }
      case "second":
        return second(e, data.value);
      case "miniList":
        return data.list?.length ? (
          <MiniList
            key={e.id}
            issues={data.list}
            active={activeElement === e.id}
          />
        ) : null;
      case "link":
        return data.href ? (
          <Link
            key={e.id}
            href={data.href}
            className={`${styles.elLink} ${styles.noShort}`}
            {...mark(e)}
          >
            {e.label?.trim() || t("seeAll")}
            <Icon icon="lucide:arrow-right" width={13} />
          </Link>
        ) : null;
      default:
        return null;
    }
  });

  return (
    <div className={styles.kpiStack}>
      <div className={styles.kpiMain} {...(goalEl ? mark(goalEl) : {})}>
        {ring && (
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
      {reached !== null && !ring && (
        <span
          className={styles.goalBar}
          style={{ "--p": reached } as CSSProperties}
          aria-hidden="true"
        />
      )}
      {!has("trend") && (
        <div className={styles.sub}>{t(`metricHint_${metric}`)}</div>
      )}
      {blocks}
    </div>
  );
}

function MiniList({
  issues,
  active,
}: {
  issues: DashboardIssue[];
  active: boolean;
}) {
  return (
    <div
      className={`${styles.miniList} ${styles.noShort}`}
      data-active={active || undefined}
    >
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
