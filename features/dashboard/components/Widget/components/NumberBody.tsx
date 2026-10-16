"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { WidgetData } from "@/features/dashboard/types";
import { METRIC_MORE_IS_GOOD } from "@/features/dashboard/widgets";
import styles from "../widget.module.scss";
import { type BodyProps, Spark } from "./shared";

type Data = Extract<WidgetData, { type: "kpi" | "progress" }>;

/** A number with its trend, or how far a set of issues is done. */
export function NumberBody({ widget, data }: BodyProps & { data: Data }) {
  const t = useTranslations("widgets");
  const format = useFormatter();
  const num = (n: number) => format.number(n, { maximumFractionDigits: 1 });

  if (data.type === "progress") {
    const share = data.total ? Math.round((data.done / data.total) * 100) : 0;
    const working = data.total ? (data.inProgress / data.total) * 100 : 0;
    return (
      <div className={styles.progress}>
        <div className={styles.big}>
          {share}
          <small>%</small>
        </div>
        <div className={styles.progressBar} role="presentation">
          <i style={{ width: `${share}%` }} />
          <i style={{ width: `${working}%` }} />
        </div>
        <div className={styles.sub}>
          {t("progressOf", { done: data.done, total: data.total })}
          <span className={styles.noS}>
            {" · "}
            {t("progressWorking", { count: data.inProgress })}
          </span>
        </div>
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

  return (
    <div className={styles.kpi}>
      <div>
        <div className={styles.big}>
          {data.value === null ? "–" : num(data.value)}
          {isDays && data.value !== null && <small>{t("daysUnit")}</small>}
        </div>
        <div className={styles.sub}>
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
      </div>
      {data.spark && (
        <span className={`${styles.grow} ${styles.noS}`}>
          <Spark values={data.spark} area={isDays} />
        </span>
      )}
    </div>
  );
}
