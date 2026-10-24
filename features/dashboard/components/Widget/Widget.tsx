"use client";

import { Icon } from "@iconify/react";
import { useFormatter, useTranslations } from "next-intl";
import type { WidgetData } from "@/features/dashboard/types";
import {
  accentOf,
  blockWidget,
  labelsOf,
  WIDGETS,
  type Widget as WidgetModel,
} from "@/features/dashboard/widgets";
import { Link } from "@/i18n/navigation";
import type { BucketUnit } from "@/lib/buckets";
import { BlocksBody } from "./components/BlocksBody";
import { ChartBody } from "./components/ChartBody";
import { EmbedBody } from "./components/EmbedBody";
import { ListBody } from "./components/ListBody";
import { NumberBody } from "./components/NumberBody";
import type { BodyProps } from "./components/shared";
import { TeamBody } from "./components/TeamBody";
import styles from "./widget.module.scss";

interface Props {
  widget: WidgetModel;
  /** `undefined` while loading (a widget just added in edit mode). */
  data: WidgetData | undefined;
  unit: BucketUnit;
  /** `/<workspace>/issue` — rows link to `<base>/<ref>`. */
  issueBase: string;
  workspaceSlug: string;
  /** The element being edited in the builder — drawn marked. */
  activeElement?: string;
}

/** The title a widget shows: its own, else what it counts or groups by. */
export function useWidgetTitle() {
  const t = useTranslations("widgets");
  const titleOf = (widget: WidgetModel): string => {
    const own = widget.config.title?.trim();
    if (own) return own;
    // What it adds up, when it isn't simply issues: "Offen · Story Points".
    const measure =
      widget.config.measure && widget.config.measure !== "count"
        ? ` · ${t(`measure_${widget.config.measure}`)}`
        : "";
    if (widget.type === "kpi")
      return t(`metric_${widget.config.metric ?? "open"}`) + measure;
    if (widget.type === "flow") {
      const by = widget.config.timeBy ?? "createdClosed";
      if (by === "createdClosed") return t("type_flow") + measure;
      const split = widget.config.splitBy
        ? ` ${t("byField", { field: t(`group_${widget.config.splitBy}`) })}`
        : "";
      return t(`timeBy_${by}`) + split + measure;
    }
    if (widget.type === "progress") return t("type_progress") + measure;
    // Flow metrics (BARY-171): what's measured is the name.
    if (widget.type === "cycle" && widget.config.cycleBy === "cycle")
      return t("cycleTitle");
    if (widget.type === "burnup" && widget.config.burn === "down")
      return t("burn_down");
    // A custom widget without a name: its first block's.
    if (widget.type === "blocks") {
      const first = widget.config.blocks?.[0];
      return first ? titleOf(blockWidget(widget, first)) : t("type_blocks");
    }
    if (widget.type === "issues") {
      const sort = widget.config.sort;
      // "urgency"/"oldest" belong to other widgets — never set here.
      return t(
        `issuesTitle_${sort && sort !== "urgency" && sort !== "oldest" ? sort : "updated"}`,
      );
    }
    if (widget.type === "distribution")
      return t(`group_${widget.config.groupBy ?? "status"}`) + measure;
    // An embed without a name of its own: the site it shows.
    if (widget.type === "embed" && widget.config.url) {
      try {
        return new URL(widget.config.url).hostname.replace(/^www\./, "");
      } catch {
        return t("type_embed");
      }
    }
    if (widget.type === "matrix")
      return t("matrixTitle", {
        rows: t(`group_${widget.config.groupBy ?? "assignee"}`),
        cols: t(`group_${widget.config.groupBy2 ?? "status"}`),
      });
    return t(`type_${widget.type}`);
  };
  return titleOf;
}

/** The header's icon — a custom widget shows its first block's. */
function iconOf(widget: WidgetModel): string {
  const first =
    widget.type === "blocks" ? widget.config.blocks?.[0]?.type : undefined;
  return WIDGETS[first ?? widget.type].icon;
}

/**
 * One widget: the frame (background, accent, header) and its body. Which
 * body is decided by the kind; how much of it shows, by the widget's own
 * size (container queries in `widget.module.scss`).
 */
export function Widget({
  widget,
  data,
  unit,
  issueBase,
  workspaceSlug,
  activeElement,
}: Props) {
  const t = useTranslations("widgets");
  const format = useFormatter();
  const titleOf = useWidgetTitle();
  const _def = WIDGETS[widget.type];
  const filters = widget.config.filter?.rules.length ?? 0;

  /** A bucket's start (`YYYY-MM-DD`, local) as a short label, pinned to UTC
   *  noon so server and browser print the same day. */
  const bucketLabel = (key: string) => {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(Date.UTC(y, m - 1, d, 12));
    return unit === "month"
      ? format.dateTime(date, { month: "short", timeZone: "UTC" })
      : format.dateTime(date, {
          day: "numeric",
          month: "short",
          timeZone: "UTC",
        });
  };

  const body: BodyProps = {
    widget,
    labels: labelsOf(widget),
    issueHref: (ref) => `${issueBase}/${ref}`,
    bucketLabel,
    workspaceSlug,
    activeElement,
  };

  return (
    <article
      className={styles.widget}
      data-accent={accentOf(widget)}
      data-bg={widget.config.background ?? "plain"}
      aria-label={titleOf(widget)}
    >
      <header className={styles.head}>
        <Icon icon={iconOf(widget)} width={14} />
        <span className={styles.title}>{titleOf(widget)}</span>
        {filters > 0 && (
          <span
            className={styles.filterMark}
            title={t("filterCount", { count: filters })}
          >
            <Icon icon="lucide:filter" width={9} />
          </span>
        )}
        <Meta widget={widget} data={data} />
      </header>

      {data === undefined ? (
        <div className={styles.empty}>
          <Icon icon="lucide:loader-circle" width={18} />
        </div>
      ) : data.type === "embed" ? (
        <EmbedBody widget={widget} data={data} title={titleOf(widget)} />
      ) : data.type === "blocks" ? (
        <BlocksBody {...body} data={data} />
      ) : data.type === "kpi" || data.type === "progress" ? (
        <NumberBody {...body} data={data} />
      ) : data.type === "members" ||
        data.type === "teams" ||
        data.type === "labels" ||
        data.type === "projects" ||
        data.type === "links" ||
        data.type === "shortcuts" ? (
        <TeamBody data={data} widget={widget} />
      ) : data.type === "attention" ||
        data.type === "issues" ||
        data.type === "about" ||
        data.type === "activity" ||
        data.type === "note" ? (
        <ListBody {...body} data={data} />
      ) : (
        <ChartBody {...body} data={data} />
      )}
      {/* A number opens the board filtered to what it counts — the whole
          widget is the link (in edit mode the dashboard's cover sits above). */}
      {(data?.type === "kpi" || data?.type === "progress") && data.href && (
        <Link
          href={data.href}
          className={styles.widgetLink}
          aria-label={t("openBoard", { name: titleOf(widget) })}
          title={t("openBoard", { name: titleOf(widget) })}
        />
      )}
    </article>
  );
}

/** The quiet note on the header's right — a total where it helps. */
function Meta({
  widget,
  data,
}: {
  widget: WidgetModel;
  data: WidgetData | undefined;
}) {
  const t = useTranslations("widgets");
  if (!data) return null;
  const text =
    data.type === "distribution" || data.type === "issues"
      ? String(data.total)
      : data.type === "attention"
        ? data.total > 0
          ? String(data.total)
          : null
        : data.type === "age" && data.avg !== null
          ? t("avgDays", { days: data.avg })
          : data.type === "cycle" && widget.size !== "S" && data.avg !== null
            ? t("avgDays", { days: data.avg })
            : null;
  return text ? (
    <span className={`${styles.meta} ${styles.noS}`}>{text}</span>
  ) : null;
}
