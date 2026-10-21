"use client";

import { useFormatter, useTranslations } from "next-intl";
import type { CSSProperties } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import type { Slice, WidgetData } from "@/features/dashboard/types";
import {
  shownElement,
  shownElements,
  type Widget,
} from "@/features/dashboard/widgets";
import { Link, useRouter } from "@/i18n/navigation";
import styles from "../widget.module.scss";
import { type BodyProps, marked, Spark, TimeAxis } from "./shared";

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
    field === "statusCategory" && !slice.label && slice.key !== "_other"
      ? t(`category_${slice.key as "backlog"}`)
      : slice.key === "_other"
        ? t("other")
        : slice.key === "_none"
          ? field === "label"
            ? t("noneLabel")
            : t("noneAssignee")
          : slice.label;
}

/** A value in the widget's measure — "12", "34 SP", "6,5 h". */
function useMeasureFormat(measure: Widget["config"]["measure"]) {
  const t = useTranslations("widgets");
  const format = useFormatter();
  return (n: number, unit = true) => {
    const v = format.number(n, { maximumFractionDigits: 1 });
    return unit && measure && measure !== "count"
      ? `${v} ${t(`unit_${measure}`)}`
      : v;
  };
}

function Distribution({
  widget,
  data,
  labels,
  activeElement,
}: BodyProps & { data: Extract<Data, { type: "distribution" }> }) {
  const name = useSliceName();
  const router = useRouter();
  const t = useTranslations("widgets");
  const fmt = useMeasureFormat(widget.config.measure);
  const field = widget.config.groupBy;
  if (data.total === 0) return <Empty />;
  const pct = (n: number) => `${Math.round((n / data.total) * 100)} %`;
  // "Top N": the biggest N, the rest folded into "Weitere" — or left out.
  const topEl = shownElement(widget, "topN");
  const topN = topEl?.value;
  const slices: Slice[] =
    topN && data.slices.length > topN
      ? [
          ...data.slices.slice(0, topN),
          ...(topEl?.flag
            ? []
            : [
                {
                  key: "_other",
                  label: "",
                  color: "var(--outline)",
                  count: data.slices
                    .slice(topN)
                    .reduce((sum, slice) => sum + slice.count, 0),
                },
              ]),
        ]
      : data.slices;
  const totalEl = shownElement(widget, "total");
  const totalName = totalEl?.label?.trim() || t("total");
  const percentEl = shownElement(widget, "percent");
  /** The number beside a slice: its value, its share, or both. */
  const shown = (count: number) =>
    percentEl && percentEl.style !== "only" && labels.values
      ? `${fmt(count, false)} · ${pct(count)}`
      : percentEl
        ? pct(count)
        : fmt(count, false);
  const showValue = labels.values || !!percentEl;

  if (widget.config.chart === "table") {
    return (
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>{t(`group_${field ?? "status"}`)}</th>
              <th>{t(`measure_${widget.config.measure ?? "count"}`)}</th>
              <th>{t("share")}</th>
            </tr>
          </thead>
          <tbody>
            {slices.map((slice) => (
              <tr key={slice.key}>
                <td>
                  <i style={{ background: slice.color }} />
                  {slice.href ? (
                    <Link href={slice.href}>{name(slice, field)}</Link>
                  ) : (
                    name(slice, field)
                  )}
                </td>
                <td>{fmt(slice.count, false)}</td>
                <td>{pct(slice.count)}</td>
              </tr>
            ))}
          </tbody>
          {totalEl && (
            <tfoot {...marked(activeElement, totalEl.id)}>
              <tr>
                <td>{totalName}</td>
                <td>{fmt(data.total, false)}</td>
                <td>100 %</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    );
  }

  if (widget.config.chart === "bars") {
    const max = Math.max(1, ...slices.map((s) => s.count));
    return (
      <div className={styles.bars}>
        {totalEl && (
          <div
            className={`${styles.sumRow} ${styles.noS}`}
            {...marked(activeElement, totalEl.id)}
          >
            {totalName} <b>{fmt(data.total)}</b>
          </div>
        )}
        {slices.map((slice) => {
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
              {showValue && <span>{shown(slice.count)}</span>}
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
          {slices.map((slice) => {
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
        {totalEl && (
          <text
            x={21}
            y={23.6}
            textAnchor="middle"
            fill="currentColor"
            fontSize={8}
            fontWeight={750}
          >
            {fmt(data.total, false)}
          </text>
        )}
      </svg>
      {labels.legend && (
        <div className={`${styles.list} ${styles.noS}`}>
          {slices.map((slice) => {
            const inner = (
              <>
                <i style={{ background: slice.color }} />
                <span className={styles.name}>{name(slice, field)}</span>
                {showValue ? <span>{shown(slice.count)}</span> : <span />}
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
  widget,
  data,
  labels,
  bucketLabel,
  activeElement,
}: BodyProps & { data: Extract<Data, { type: "flow" }> }) {
  const t = useTranslations("widgets");
  const fmt = useMeasureFormat(widget.config.measure);
  const sliceName = useSliceName();
  const pair = data.timeBy === "createdClosed";
  const chart =
    widget.config.seriesChart === "stacked" && data.series.length < 2
      ? "bars"
      : (widget.config.seriesChart ?? "bars");
  const nameOf = (s: (typeof data.series)[number]) =>
    s.key === "created"
      ? t("created")
      : s.key === "closed"
        ? t("closed")
        : s.key === "all"
          ? t(`timeBy_${data.timeBy}`)
          : sliceName(
              { key: s.key, label: s.label, color: s.color, count: 0 },
              widget.config.splitBy,
            );
  const elements = shownElements(widget);
  const kinds = new Set(elements.map((e) => e.kind));
  const find = (kind: (typeof elements)[number]["kind"]) =>
    elements.find((e) => e.kind === kind);
  const n = data.dates.length;
  // "Kumulativ": every bucket carries the ones before it.
  const running = (values: number[]) => {
    let sum = 0;
    return values.map((v) => {
      sum += v;
      return sum;
    });
  };
  const shape = (values: number[]) =>
    kinds.has("cumulative") ? running(values) : values;
  const series = data.series.map((s) => ({ ...s, values: shape(s.values) }));
  const previousEl = find("previous");
  const previous = previousEl && data.previous ? shape(data.previous) : null;
  // The range before as pale columns behind the bars (not on a line chart).
  const ghost = previousEl?.style === "bars" && chart !== "line";
  const goalEl = find("goalLine");
  const goal = goalEl?.value ?? null;
  const goalName = goalEl?.label?.trim() || t("goal");
  // Its color comes from CSS (`[data-goal]`), red by default.
  const goalColor = "var(--goal)";
  const averageEl = find("average");
  const sums = data.dates.map((_, i) =>
    series.reduce((a, s) => a + s.values[i], 0),
  );
  // The average per bucket — of the stack's sums, or of the first series.
  const averaged = chart === "stacked" ? sums : (series[0]?.values ?? []);
  const average =
    kinds.has("average") && n ? averaged.reduce((a, v) => a + v, 0) / n : null;
  const max = Math.max(
    1,
    ...(chart === "stacked" ? sums : series.flatMap((s) => s.values)),
    ...(previous ?? []),
    goal ?? 0,
  );
  const showValues = labels.values && chart === "bars" && n <= 14;
  const all = data.series.every((s) => s.total === 0);
  const net = pair ? data.series[0].total - data.series[1].total : 0;
  const total = data.series.reduce((a, s) => a + s.total, 0);
  // Where a value sits, in the overlay's 0–100 box: bars fill the full
  // height and sit in the middle of their column; the line leaves 6 % on top.
  const yOf = (v: number) =>
    chart === "line" ? 100 - (v / max) * 94 : 100 - (v / max) * 100;
  const xOf = (i: number) =>
    chart === "line"
      ? n === 1
        ? 50
        : (i / (n - 1)) * 100
      : ((i + 0.5) / n) * 100;
  const overlay = ((previous && !ghost) ||
    average !== null ||
    goal !== null) && (
    <svg
      className={`${styles.overlay} ${chart === "line" ? "" : styles.overlayCols}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {previous && !ghost && (
        <polyline
          points={previous.map((v, i) => `${xOf(i)},${yOf(v)}`).join(" ")}
          fill="none"
          stroke="var(--muted)"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {average !== null && (
        <line
          x1={0}
          x2={100}
          y1={yOf(average)}
          y2={yOf(average)}
          stroke="var(--on-surface)"
          strokeWidth={1}
          strokeDasharray="2 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
      {goal !== null && (
        <line
          x1={0}
          x2={100}
          y1={yOf(goal)}
          y2={yOf(goal)}
          stroke={goalColor}
          strokeWidth={1.5}
          strokeDasharray="5 3"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );

  const legend = (id: string) => (
    <div
      key={id}
      className={`${styles.legend} ${styles.noShort}`}
      {...marked(activeElement, id)}
    >
      {data.series.map((s) => (
        <span key={s.key}>
          <i style={{ background: s.color }} />
          {nameOf(s)} <b>{fmt(s.total)}</b>
        </span>
      ))}
      {pair && (
        <span>
          {t("net")}{" "}
          <b className={net > 0 ? styles.bad : net < 0 ? styles.good : ""}>
            {net > 0 ? `+${fmt(net)}` : fmt(net)}
          </b>
        </span>
      )}
      {previous && <span>– – {t("previousRange")}</span>}
      {average !== null && !kinds.has("sumRow") && (
        <span>
          ⋯ {t("averageShort")} <b>{fmt(Math.round(average * 10) / 10)}</b>
        </span>
      )}
      {goal !== null && (
        <span className={styles.goalKey} data-goal={goalEl?.color}>
          – – {goalName} <b>{fmt(goal)}</b>
        </span>
      )}
    </div>
  );
  const legendEl = find("legend");

  return (
    <>
      {/* Legend and total row above the chart, in their order. */}
      {elements.map((e) =>
        e.kind === "sumRow" ? (
          <div
            key={e.id}
            className={styles.sumRow}
            {...marked(activeElement, e.id)}
          >
            {e.label?.trim() || t("total")} <b>{fmt(total)}</b>
            {average !== null && (
              <span className={styles.noS}>
                {" · "}
                {t("averageShort")} <b>{fmt(Math.round(average * 10) / 10)}</b>
              </span>
            )}
          </div>
        ) : e.kind === "legend" && e.style !== "bottom" ? (
          legend(e.id)
        ) : null,
      )}
      {all ? (
        <Empty />
      ) : (
        <div className={styles.plot} data-goal={goalEl?.color}>
          {chart === "line" ? (
            <svg
              className={styles.chart}
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              role="img"
              aria-label={data.series
                .map((s) => `${nameOf(s)} ${s.total}`)
                .join(", ")}
            >
              {series.map((s) => (
                <polyline
                  key={s.key}
                  points={s.values
                    .map(
                      (v, i) =>
                        `${n === 1 ? 50 : (i / (n - 1)) * 100},${100 - (v / max) * 94}`,
                    )
                    .join(" ")}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              ))}
            </svg>
          ) : (
            <div className={styles.cols}>
              {data.dates.map((date, i) =>
                chart === "stacked" ? (
                  <div
                    key={date}
                    className={styles.col}
                    title={`${bucketLabel(date)} · ${fmt(sums[i])}`}
                  >
                    {ghost && previous && (
                      <span
                        className={styles.ghost}
                        style={{ height: `${(previous[i] / max) * 100}%` }}
                      />
                    )}
                    <div
                      className={styles.stackCol}
                      style={{ height: `${(sums[i] / max) * 100}%` }}
                    >
                      {series.map((s) =>
                        s.values[i] ? (
                          <Bar
                            key={s.key}
                            value={s.values[i]}
                            max={sums[i] || 1}
                            color={s.color}
                            href={s.hrefs[i]}
                            label={`${bucketLabel(date)} · ${nameOf(s)} ${fmt(s.values[i])}`}
                            showValue={false}
                          />
                        ) : null,
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={date} className={styles.col}>
                    {ghost && previous && (
                      <span
                        className={styles.ghost}
                        style={{ height: `${(previous[i] / max) * 100}%` }}
                      />
                    )}
                    {series.map((s) => (
                      <Bar
                        key={s.key}
                        value={s.values[i]}
                        max={max}
                        color={s.color}
                        href={s.hrefs[i]}
                        label={`${bucketLabel(date)} · ${nameOf(s)} ${fmt(s.values[i])}`}
                        showValue={showValues}
                      />
                    ))}
                  </div>
                ),
              )}
            </div>
          )}
          {overlay}
          {goal !== null && goalEl?.label?.trim() && (
            <span
              className={`${styles.lineLabel} ${chart === "line" ? "" : styles.lineLabelCols}`}
              style={{ "--y": yOf(goal), "--c": goalColor } as CSSProperties}
            >
              {goalName} {fmt(goal)}
            </span>
          )}
          {average !== null && averageEl?.flag && (
            <span
              className={`${styles.lineLabel} ${chart === "line" ? "" : styles.lineLabelCols}`}
              style={
                {
                  "--y": yOf(average),
                  "--c": "var(--on-surface)",
                } as CSSProperties
              }
            >
              {t("averageShort")} {fmt(Math.round(average * 10) / 10)}
            </span>
          )}
        </div>
      )}
      {labels.axes && <TimeAxis keys={data.dates} label={bucketLabel} />}
      {legendEl?.style === "bottom" && legend(legendEl.id)}
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
  activeElement,
}: BodyProps & { data: Extract<Data, { type: "matrix" }> }) {
  const name = useSliceName();
  const t = useTranslations("widgets");
  const fmt = useMeasureFormat(widget.config.measure);
  if (data.rows.length === 0) return <Empty />;
  const elements = shownElements(widget);
  const find = (kind: (typeof elements)[number]["kind"]) =>
    elements.find((e) => e.kind === kind);
  const heatEl = find("heatmap");
  const percent = !!find("rowPercent");
  const rowTotalsEl = find("rowTotals");
  const colTotalsEl = find("colTotals");
  const rowSums = data.cells.map((row) => row.reduce((a, v) => a + v, 0));
  const colSums = data.cols.map((_, j) =>
    data.cells.reduce((a, row) => a + row[j], 0),
  );
  const extraCol = !!rowTotalsEl;
  const rowMax = data.cells.map((row) => Math.max(0, ...row));
  /** How dark a cell is: against the whole matrix, or its own row. */
  const shade = (i: number, j: number) =>
    !heatEl
      ? 0
      : heatEl.style === "row"
        ? rowMax[i]
          ? data.cells[i][j] / rowMax[i]
          : 0
        : data.max
          ? data.cells[i][j] / data.max
          : 0;
  const cell = (v: number, rowSum: number) =>
    !labels.values
      ? ""
      : percent
        ? `${rowSum ? Math.round((v / rowSum) * 100) : 0} %`
        : fmt(v, false);
  return (
    <div
      className={styles.matrix}
      style={{
        gridTemplateColumns: `minmax(3rem, 1.4fr) repeat(${data.cols.length + (extraCol ? 1 : 0)}, minmax(0, 1fr))`,
      }}
    >
      <span className={styles.mHead} />
      {data.cols.map((col) => (
        <span key={col.key} className={styles.mHead} title={name(col)}>
          {labels.axes ? name(col, widget.config.groupBy2) : ""}
        </span>
      ))}
      {rowTotalsEl && (
        <span
          className={styles.mHead}
          {...marked(activeElement, rowTotalsEl.id)}
        >
          {rowTotalsEl.label?.trim() || "Σ"}
        </span>
      )}
      {data.rows.map((row, i) => [
        <span key={`${row.key}-h`} className={styles.mRow} title={name(row)}>
          {labels.axes ? name(row, widget.config.groupBy) : ""}
        </span>,
        ...data.cols.map((col, j) => (
          <span
            key={`${row.key}-${col.key}`}
            style={
              {
                "--v": shade(i, j),
              } as CSSProperties
            }
            title={`${name(row)} × ${name(col)}: ${data.cells[i][j]}`}
          >
            {cell(data.cells[i][j], rowSums[i])}
          </span>
        )),
        ...(extraCol
          ? [
              <span key={`${row.key}-sum`} className={styles.mSum}>
                {fmt(rowSums[i], false)}
              </span>,
            ]
          : []),
      ])}
      {colTotalsEl && [
        <span
          key="sum-h"
          className={styles.mRow}
          {...marked(activeElement, colTotalsEl.id)}
        >
          {colTotalsEl.label?.trim() || t("total")}
        </span>,
        ...colSums.map((sum, j) => (
          <span key={`sum-${data.cols[j].key}`} className={styles.mSum}>
            {fmt(sum, false)}
          </span>
        )),
        ...(extraCol
          ? [
              <span key="sum-all" className={styles.mSum}>
                {fmt(
                  rowSums.reduce((a, v) => a + v, 0),
                  false,
                )}
              </span>,
            ]
          : []),
      ]}
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
