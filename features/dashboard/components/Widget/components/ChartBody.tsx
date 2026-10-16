"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import type { Slice, WidgetData } from "@/features/dashboard/types";
import { Link, useRouter } from "@/i18n/navigation";
import styles from "../widget.module.scss";
import { type BodyProps, Spark, TimeAxis } from "./shared";

type Data = Extract<
  WidgetData,
  {
    type:
      | "distribution"
      | "flow"
      | "burnup"
      | "cycle"
      | "age"
      | "matrix"
      | "workload";
  }
>;

/** The chart kinds. Colors come from the data where it has its own
 *  (statuses, priorities, labels); time series use the chart tokens. */
export function ChartBody(props: BodyProps & { data: Data }) {
  const { data } = props;
  switch (data.type) {
    case "distribution":
      return <Distribution {...props} data={data} />;
    case "flow":
      return <Flow {...props} data={data} />;
    case "burnup":
      return <Burnup {...props} data={data} />;
    case "cycle":
      return <Cycle {...props} data={data} />;
    case "age":
      return <Age {...props} data={data} />;
    case "matrix":
      return <Matrix {...props} data={data} />;
    case "workload":
      return <Workload {...props} data={data} />;
  }
}

function Empty() {
  const t = useTranslations("widgets");
  return <div className={styles.empty}>{t("empty")}</div>;
}

/** "_none" / "_other" get their words here, everything else its name. */
function useSliceName() {
  const t = useTranslations("widgets");
  return (slice: Slice, field?: string) =>
    slice.key === "_other"
      ? t("other")
      : slice.key === "_none"
        ? field === "label"
          ? t("noneLabel")
          : t("noneAssignee")
        : slice.label;
}

function Distribution({
  widget,
  data,
  labels,
}: BodyProps & { data: Extract<Data, { type: "distribution" }> }) {
  const name = useSliceName();
  const router = useRouter();
  const field = widget.config.groupBy;
  if (data.total === 0) return <Empty />;

  if (widget.config.chart === "bars") {
    const max = Math.max(1, ...data.slices.map((s) => s.count));
    return (
      <div className={styles.bars}>
        {data.slices.map((slice) => {
          const inner = (
            <>
              {labels.axes && (
                <span className={styles.name}>{name(slice, field)}</span>
              )}
              <span className={styles.track}>
                <i
                  style={{
                    width: `${(slice.count / max) * 100}%`,
                    background: slice.color,
                  }}
                />
              </span>
              {labels.values && <span>{slice.count}</span>}
            </>
          );
          return slice.href ? (
            <Link
              key={slice.key}
              href={slice.href}
              className={`${styles.bar} ${styles.sliceLink}`}
              title={`${name(slice, field)}: ${slice.count}`}
            >
              {inner}
            </Link>
          ) : (
            <div key={slice.key} className={styles.bar}>
              {inner}
            </div>
          );
        })}
      </div>
    );
  }

  // The ring: one circle per slice, offset by everything before it.
  const circumference = 100;
  let offset = 0;
  return (
    <div className={styles.ringRow}>
      <svg viewBox="0 0 42 42" role="img" aria-label={String(data.total)}>
        <g transform="rotate(-90 21 21)" fill="none" strokeWidth={6}>
          <circle cx={21} cy={21} r={15.915} stroke="var(--track)" />
          {data.slices.map((slice) => {
            const part = (slice.count / data.total) * circumference;
            const el = (
              // biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut — the legend beside it holds the same links for keyboard and screen readers
              <circle
                key={slice.key}
                cx={21}
                cy={21}
                r={15.915}
                stroke={slice.color}
                strokeDasharray={`${part} ${circumference - part}`}
                strokeDashoffset={-offset}
                className={slice.href ? styles.segment : undefined}
                onClick={
                  slice.href ? () => router.push(slice.href ?? "") : undefined
                }
              >
                <title>{`${name(slice, field)}: ${slice.count}`}</title>
              </circle>
            );
            offset += part;
            return el;
          })}
        </g>
        <text
          x={21}
          y={23.6}
          textAnchor="middle"
          fill="currentColor"
          fontSize={8}
          fontWeight={750}
        >
          {data.total}
        </text>
      </svg>
      {labels.legend && (
        <div className={`${styles.list} ${styles.noS}`}>
          {data.slices.map((slice) => {
            const inner = (
              <>
                <i style={{ background: slice.color }} />
                <span className={styles.name}>{name(slice, field)}</span>
                {labels.values ? <span>{slice.count}</span> : <span />}
              </>
            );
            return slice.href ? (
              <Link
                key={slice.key}
                href={slice.href}
                className={`${styles.listRow} ${styles.sliceLink}`}
              >
                {inner}
              </Link>
            ) : (
              <div key={slice.key} className={styles.listRow}>
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Flow({
  data,
  labels,
  bucketLabel,
}: BodyProps & { data: Extract<Data, { type: "flow" }> }) {
  const t = useTranslations("widgets");
  const max = Math.max(1, ...data.points.flatMap((p) => [p.created, p.closed]));
  const net = data.created - data.closed;
  const showValues = labels.values && data.points.length <= 14;
  return (
    <>
      {labels.legend && (
        <div className={`${styles.legend} ${styles.noShort}`}>
          <span>
            <i style={{ background: "var(--chart-1)" }} />
            {t("created")} <b>{data.created}</b>
          </span>
          <span>
            <i style={{ background: "var(--chart-3)" }} />
            {t("closed")} <b>{data.closed}</b>
          </span>
          <span>
            {t("net")}{" "}
            <b className={net > 0 ? styles.bad : net < 0 ? styles.good : ""}>
              {net > 0 ? `+${net}` : net}
            </b>
          </span>
        </div>
      )}
      <div className={styles.cols}>
        {data.points.map((p) => (
          <div
            key={p.date}
            className={styles.col}
            title={`${bucketLabel(p.date)} · ${t("created")} ${p.created} · ${t("closed")} ${p.closed}`}
          >
            <Bar
              value={p.created}
              max={max}
              color="var(--chart-1)"
              href={p.createdHref}
              label={`${bucketLabel(p.date)} · ${t("created")} ${p.created}`}
              showValue={showValues}
            />
            <Bar
              value={p.closed}
              max={max}
              color="var(--chart-3)"
              href={p.closedHref}
              label={`${bucketLabel(p.date)} · ${t("closed")} ${p.closed}`}
              showValue={showValues}
            />
          </div>
        ))}
      </div>
      {labels.axes && (
        <TimeAxis keys={data.points.map((p) => p.date)} label={bucketLabel} />
      )}
    </>
  );
}

/** One column of a bar pair — a link to its issues when it has any. */
function Bar({
  value,
  max,
  color,
  href,
  label,
  showValue,
}: {
  value: number;
  max: number;
  color: string;
  href: string | null | undefined;
  label: string;
  showValue: boolean;
}) {
  const style = { height: `${(value / max) * 100}%`, background: color };
  const number = showValue && value > 0 && (
    <em className={`${styles.value} ${styles.noShort}`}>{value}</em>
  );
  return href ? (
    <Link
      href={href}
      className={styles.barLink}
      style={style}
      title={label}
      aria-label={label}
    >
      {number}
    </Link>
  ) : (
    <i style={style}>{number}</i>
  );
}

function Burnup({
  data,
  labels,
  bucketLabel,
}: BodyProps & { data: Extract<Data, { type: "burnup" }> }) {
  const t = useTranslations("widgets");
  const n = data.points.length;
  const max = Math.max(1, ...data.points.map((p) => p.total));
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
  const y = (v: number) => 100 - (v / max) * 96;
  const line = (pick: (p: (typeof data.points)[number]) => number) =>
    data.points
      .map((p, i) => `${i ? "L" : "M"}${x(i)} ${y(pick(p))}`)
      .join(" ");
  const done = line((p) => p.done);
  const total = line((p) => p.total);
  const back = (path: string) =>
    path
      .split(" L")
      .reverse()
      .map((seg) => seg.replace("M", ""))
      .join(" L");
  const last = data.points[n - 1];

  return (
    <>
      <svg
        className={styles.chart}
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        role="img"
        aria-label={
          last ? `${t("doneSeries")} ${last.done} / ${last.total}` : ""
        }
      >
        <path
          d={`${done} L100 100 L0 100Z`}
          fill="var(--chart-3)"
          opacity={0.85}
        />
        <path
          d={`${total} L${back(done)}Z`}
          fill="var(--chart-1)"
          opacity={0.28}
        />
        <path
          d={total}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="4 4"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {labels.axes && (
        <TimeAxis keys={data.points.map((p) => p.date)} label={bucketLabel} />
      )}
      {labels.legend && (
        <div className={`${styles.legend} ${styles.noShort}`}>
          <span>
            <i style={{ background: "var(--chart-3)" }} />
            {t("doneSeries")} {labels.values && last && <b>{last.done}</b>}
          </span>
          <span>
            <i
              style={{
                background:
                  "color-mix(in srgb, var(--chart-1) 45%, transparent)",
              }}
            />
            {t("openPart")}{" "}
            {labels.values && last && <b>{last.total - last.done}</b>}
          </span>
          <span>– – {t("scope")}</span>
        </div>
      )}
    </>
  );
}

function Cycle({
  data,
  labels,
  issueHref,
}: BodyProps & { data: Extract<Data, { type: "cycle" }> }) {
  const t = useTranslations("widgets");
  const format = useFormatter();
  const num = (n: number) => format.number(n, { maximumFractionDigits: 1 });
  if (data.points.length === 0) return <Empty />;

  const delta =
    data.avg !== null && data.previous !== null
      ? Math.round((data.avg - data.previous) * 10) / 10
      : null;
  // A round top for the day axis, with room above P95; dots beyond it sit
  // on the top edge.
  const raw = Math.max(1, (data.p95 ?? 1) * 1.2);
  const step =
    raw <= 5 ? 1 : raw <= 15 ? 5 : raw <= 40 ? 10 : raw <= 90 ? 30 : 60;
  const top = Math.ceil(raw / step) * step;
  const y = (days: number) => Math.min(100, (days / top) * 100);
  const times = data.points.map((p) => p.closed);
  const from = Math.min(...times);
  const to = Math.max(...times);
  const span = Math.max(1, to - from);
  const x = (ms: number) => ((ms - from) / span) * 100;
  const tone = (days: number) =>
    data.p95 !== null && days > data.p95
      ? "red"
      : data.p75 !== null && days > data.p75
        ? "amber"
        : undefined;
  const day = (ms: number) =>
    format.dateTime(new Date(ms), {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });
  const marks = [
    {
      key: "p50",
      label: t("medianShort"),
      value: data.p50,
      color: "var(--teal)",
    },
    { key: "p75", label: "P75", value: data.p75, color: "var(--amber)" },
    { key: "p95", label: "P95", value: data.p95, color: "var(--red)" },
  ].filter(
    (m): m is { key: string; label: string; value: number; color: string } =>
      m.value !== null,
  );
  const trend = delta !== null && delta !== 0 && (
    <span className={`${styles.trend} ${delta < 0 ? styles.good : styles.bad}`}>
      {delta > 0 ? "▲" : "▼"} {num(Math.abs(delta))}
    </span>
  );

  return (
    <>
      {/* Small and medium: the number and how it moved. */}
      <div className={`${styles.kpi} ${styles.onlyShort}`}>
        <div>
          <div className={styles.big}>
            {data.avg === null ? "–" : num(data.avg)}
            <small>{t("daysUnit")}</small>
          </div>
          <div className={styles.sub}>
            {trend} {data.p50 !== null && t("median", { days: num(data.p50) })}
          </div>
        </div>
        <span className={`${styles.grow} ${styles.noS}`}>
          <Spark values={data.spark} area />
        </span>
      </div>

      {/* Large: the average up top, then every closed issue as a dot over
          time — the band is the usual range (median to P75), red and amber
          dots took longer than 95 % and 75 % of the rest. */}
      <div className={`${styles.cycleLarge} ${styles.noShort}`}>
        <div className={styles.cycleStats}>
          <div>
            <div className={styles.cycleBig}>
              {data.avg === null ? "–" : num(data.avg)}
              <small>{t("daysUnit")}</small>
              {trend}
            </div>
            <div className={styles.sub}>
              {t("cycleSub", { count: data.points.length })}
            </div>
          </div>
          {labels.legend && (
            <div className={styles.cycleLegend}>
              {marks.map((m) => (
                <span key={m.key} style={{ "--c": m.color } as CSSProperties}>
                  <i />
                  {m.label} <b>{t("days", { days: num(m.value) })}</b>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className={styles.cyclePlot}>
          {labels.axes && (
            <div className={styles.yAxis}>
              {[top, top / 2, 0].map((v) => (
                <span key={v}>{t("days", { days: num(v) })}</span>
              ))}
            </div>
          )}
          <div className={styles.scatter}>
            <span className={styles.grid} style={{ bottom: "50%" }} />
            {data.p50 !== null && data.p75 !== null && (
              <span
                className={styles.band}
                style={{
                  bottom: `${y(data.p50)}%`,
                  height: `${y(data.p75) - y(data.p50)}%`,
                }}
              />
            )}
            {marks.map((m) => (
              <span
                key={m.key}
                className={styles.mark}
                style={
                  { bottom: `${y(m.value)}%`, "--c": m.color } as CSSProperties
                }
              >
                {labels.values && !labels.legend && (
                  <em>
                    {m.label} {t("days", { days: num(m.value) })}
                  </em>
                )}
              </span>
            ))}
            {/* The dots joined in time order — the trend reads at a glance. */}
            <svg
              className={styles.scatterLine}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <polyline
                points={[...data.points]
                  .sort((a, b) => a.closed - b.closed)
                  .map((p) => `${x(p.closed)},${100 - y(p.days)}`)
                  .join(" ")}
                fill="none"
                stroke="var(--accent)"
                strokeWidth={1.5}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            </svg>
            {data.points.map((p) => (
              <Link
                key={p.id}
                href={issueHref(p.ref)}
                className={styles.dotPoint}
                data-tone={tone(p.days)}
                style={{ left: `${x(p.closed)}%`, bottom: `${y(p.days)}%` }}
                title={`${p.ref} · ${p.title} · ${t("days", { days: num(p.days) })} · ${day(p.closed)}`}
              />
            ))}
          </div>
        </div>
        {labels.axes && (
          <div className={`${styles.axis} ${styles.xAxis}`}>
            <span>{day(from)}</span>
            <span>{day(to)}</span>
          </div>
        )}
      </div>
    </>
  );
}

const AGE_KEYS = ["age_0", "age_1", "age_2", "age_3", "age_4"] as const;

function Age({
  data,
  labels,
}: BodyProps & { data: Extract<Data, { type: "age" }> }) {
  const t = useTranslations("widgets");
  const max = Math.max(1, ...data.buckets);
  if (data.buckets.every((b) => b === 0)) return <Empty />;
  return (
    <>
      <div className={`${styles.cols} ${styles.ageCols}`}>
        {data.buckets.map((count, i) => (
          <div
            key={AGE_KEYS[i]}
            className={styles.col}
            title={`${t(AGE_KEYS[i])}: ${count}`}
          >
            <i style={{ height: `${(count / max) * 100}%` }} data-step={i}>
              {labels.values && count > 0 && (
                <em className={styles.value}>{count}</em>
              )}
            </i>
          </div>
        ))}
      </div>
      {labels.axes && (
        <div className={styles.axis}>
          {AGE_KEYS.map((key) => (
            <span key={key}>{t(key)}</span>
          ))}
        </div>
      )}
    </>
  );
}

function Matrix({
  widget,
  data,
  labels,
}: BodyProps & { data: Extract<Data, { type: "matrix" }> }) {
  const name = useSliceName();
  if (data.rows.length === 0) return <Empty />;
  return (
    <div
      className={styles.matrix}
      style={{
        gridTemplateColumns: `minmax(3rem, 1.4fr) repeat(${data.cols.length}, minmax(0, 1fr))`,
      }}
    >
      <span className={styles.mHead} />
      {data.cols.map((col) => (
        <span key={col.key} className={styles.mHead} title={name(col)}>
          {labels.axes ? name(col, widget.config.groupBy2) : ""}
        </span>
      ))}
      {data.rows.map((row, i) => [
        <span key={`${row.key}-h`} className={styles.mRow} title={name(row)}>
          {labels.axes ? name(row, widget.config.groupBy) : ""}
        </span>,
        ...data.cols.map((col, j) => (
          <span
            key={`${row.key}-${col.key}`}
            style={
              {
                "--v": data.max ? data.cells[i][j] / data.max : 0,
              } as CSSProperties
            }
            title={`${name(row)} × ${name(col)}: ${data.cells[i][j]}`}
          >
            {labels.values ? data.cells[i][j] : ""}
          </span>
        )),
      ])}
    </div>
  );
}

function Workload({
  data,
  labels,
}: BodyProps & { data: Extract<Data, { type: "workload" }> }) {
  const t = useTranslations("widgets");
  if (data.rows.length === 0) return <Empty />;
  const max = Math.max(1, ...data.rows.map((r) => r.open));
  return (
    <>
      <div className={styles.bars}>
        {data.rows.slice(0, 10).map((row) => {
          const inner = (
            <>
              <span className={styles.who}>
                <Avatar avatar={row.user} size={20} />
                {labels.axes && (
                  <span>
                    {row.user
                      ? row.user.firstName || row.user.lastName
                      : t("noneAssignee")}
                  </span>
                )}
              </span>
              <span className={styles.track}>
                <i
                  style={{
                    width: `${(row.inProgress / max) * 100}%`,
                    background: "var(--amber)",
                  }}
                />
                <i
                  style={{
                    width: `${((row.open - row.inProgress) / max) * 100}%`,
                    background:
                      "color-mix(in srgb, var(--on-surface) 35%, transparent)",
                  }}
                />
              </span>
              {labels.values && <span>{row.open}</span>}
            </>
          );
          const name = row.user
            ? `${row.user.firstName} ${row.user.lastName}`.trim()
            : t("noneAssignee");
          return row.href ? (
            <Link
              key={row.user?.id ?? "_none"}
              href={row.href}
              className={`${styles.bar} ${styles.sliceLink}`}
              title={t("openIssuesOf", { name })}
            >
              {inner}
            </Link>
          ) : (
            <div key={row.user?.id ?? "_none"} className={styles.bar}>
              {inner}
            </div>
          );
        })}
      </div>
      {labels.legend && (
        <div className={`${styles.legend} ${styles.noShort}`}>
          <span>
            <i style={{ background: "var(--amber)" }} />
            {t("inProgress")}
          </span>
          <span>
            <i
              style={{
                background:
                  "color-mix(in srgb, var(--on-surface) 35%, transparent)",
              }}
            />
            {t("openPart")}
          </span>
        </div>
      )}
    </>
  );
}
