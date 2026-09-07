"use client";

import { Icon } from "@iconify/react";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { useState, useTransition } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { BarList, type BarRow } from "@/components/ui/charts/BarList/BarList";
import { ChartCard } from "@/components/ui/charts/ChartCard/ChartCard";
import {
  type ChartPoint,
  type ChartSeries,
  ColumnChart,
} from "@/components/ui/charts/ColumnChart/ColumnChart";
import { RangePicker } from "@/components/ui/charts/RangePicker/RangePicker";
import { ScopePicker } from "@/components/ui/charts/ScopePicker/ScopePicker";
import { StackedBar } from "@/components/ui/charts/StackedBar/StackedBar";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import type { ActivityView } from "@/features/audit/queries";
import {
  resetDashboardLayout,
  saveDashboardLayout,
  setDashboardRange,
  setDashboardScope,
  setDashboardView,
} from "@/features/dashboard/actions";
import { CustomizeDialog } from "@/features/dashboard/components/CustomizeDialog/CustomizeDialog";
import {
  IssueList,
  ReasonBadge,
} from "@/features/dashboard/components/IssueList/IssueList";
import type { DashboardScope } from "@/features/dashboard/scope";
import type { ProjectDashboardView } from "@/features/dashboard/types";
import {
  DEFAULT_PROJECT_VIEW,
  type ProjectView,
} from "@/features/dashboard/view";
import type { WidgetKey } from "@/features/dashboard/widgets";
import { widgetDef } from "@/features/dashboard/widgets";
import { PriorityIcon } from "@/features/issues/components/IssueIcons/IssueIcons";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import type { RangeKey } from "@/lib/buckets";
import { useModal } from "@/lib/context";
import { fullName } from "@/lib/utils/string";
import { ProjectProfileView } from "./components/ProjectProfileView";
import styles from "./projectDashboard.module.scss";

interface Props extends ProjectDashboardView {
  /** Which view is open — from `?view=` in the address. */
  view: ProjectView;
  /** Base address for issues: `/<workspace>/issue`. */
  issueBase: string;
  /** For the label dialog in the overview — `LabelModal` needs it directly. */
  workspaceId: string;
  /** Addresses of this project's neighboring areas. */
  links: {
    board: string;
    list: string;
    members: string;
    settings: string;
    /** Team management lives one level up — teams belong to the workspace. */
    teams: string;
    /** The full, filterable list — the overview's activity card shows only an excerpt. */
    activity: string;
  };
  /** For the overview's activity card — already filtered by `audit.view` (`getProjectActivity`). */
  activity: ActivityView;
}

/** The icons for the three reasons in "needs attention". */
const REASON_ICONS = {
  unassigned: "lucide:user-x",
  urgent: "lucide:triangle-alert",
  stale: "lucide:clock-alert",
} as const;

/**
 * A project's home page — in two views.
 *
 * ── Overview or dashboard ──
 *
 * Each answers a different question. The **overview** says what the project
 * is: purpose, prefix, leadership, who has access. That still holds next
 * month too, so it has no time period at all — it's the default. The
 * **dashboard** says how it's currently doing: numbers, trends, what's
 * falling behind. All of that changes hourly and depends on the chosen
 * period.
 *
 * Which of the two is open is remembered by the page
 * (`DashboardPreference.view`): the project row in the sidebar leads here
 * with no `?view=`, and whoever last looked at the numbers doesn't want to
 * call them up again on the next click.
 *
 * They sit side by side as a toggle rather than as two routes, even though
 * settings does it the other way around: there, switching *replaces* the
 * whole area including navigation, here everything stays put and only the
 * cards swap. The data for both comes from a single call anyway
 * (`getProjectDashboard`), so switching costs no server round trip — and
 * `?view=` in the address still makes it shareable and survives a reload.
 *
 * ── The structure ──
 *
 * A row of controls at the top, below it everything they affect — the
 * period applies to every number on this page, not per card. A dashboard
 * where two cards show different weeks isn't an overview, it's a source of
 * errors. In the overview, that row doesn't even appear: period, table view,
 * and "customize" have no business there, and a control with no effect is
 * worse than none at all.
 *
 * The period lives in the address (`?range=30d`) instead of this
 * component's state: that makes it shareable, it survives a reload, and the
 * numbers come fresh from the server. It's additionally recorded on the
 * account — the address carries the period of *this* particular visit, the
 * preference the one the dashboard opens with next time.
 *
 * ── The layout ──
 *
 * Which widgets appear in which order is decided by each person individually
 * (`features/dashboard/widgets.ts`). This component doesn't know that
 * decision, it just reads it: `order` arrives fully resolved from the
 * server, and the loop below renders whatever's in it. An `if` per widget
 * would have hardcoded that same order a second time — and specifically the
 * one written in the source, not the one someone configured.
 */
export function ProjectDashboard({
  project,
  data,
  profile,
  order,
  hidden,
  view,
  issueBase,
  workspaceId,
  links,
  activity,
}: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const { openModal } = useModal();

  const [isPending, startTransition] = useTransition();
  const [asTable, setAsTable] = useState(false);

  /**
   * The overview is the default and has no time period at all — it gets the
   * bare address, with no `?view=` and no `?range=`. Everything else
   * carries both values, including the one that isn't currently changing:
   * otherwise switching views would lose the configured period, and anyone
   * going from the dashboard back to the overview and back to the dashboard
   * would land on the default again.
   */
  const urlWith = (patch: {
    view?: ProjectView;
    range?: RangeKey;
    scope?: DashboardScope;
  }) => {
    const nextView = patch.view ?? view;
    if (nextView === DEFAULT_PROJECT_VIEW) return pathname;

    const next = new URLSearchParams({
      view: nextView,
      range: patch.range ?? data.range,
      scope: patch.scope ?? data.scope,
    });
    return `${pathname}?${next}`;
  };

  const pickRange = (range: RangeKey) => {
    startTransition(async () => {
      // `replace` and not `push`: switching a period isn't a new stop you'd
      // want to click back through.
      router.replace(urlWith({ range }));
      // And, on the side, remember what this dashboard should open with
      // going forward. Anyone who sets "12 months" once rarely means only
      // this one visit.
      await setDashboardRange(project.id, range);
    });
  };

  const pickScope = (scope: DashboardScope) => {
    startTransition(async () => {
      router.replace(urlWith({ scope }));
      await setDashboardScope(project.id, scope);
    });
  };

  const pickView = (next: string) => {
    startTransition(async () => {
      // `replace`: these are two views of the same project, not two stops.
      // The data is already in the client — the switch happens instantly,
      // the address just catches up.
      router.replace(urlWith({ view: next as ProjectView }));
      // And remember where you were: the project row in the sidebar leads
      // back here with no `?view=` and should then open the same view.
      await setDashboardView(project.id, next);
    });
  };

  const customize = () =>
    openModal(
      ({ close }) => (
        <CustomizeDialog
          order={order}
          hidden={hidden}
          close={close}
          onSave={(o, h) => saveDashboardLayout(project.id, o, h)}
          onReset={() => resetDashboardLayout(project.id)}
        />
      ),
      { label: t("dashboard.customize") },
    );

  const issueHref = (ref: string) => `${issueBase}/${ref.toLowerCase()}`;

  // ── Labeling the axis ──
  //
  // Days carry day and month, months carry the month name. The tooltip shows
  // the full date; on the axis it would be a wall of digits.
  const axisLabel = (iso: string) => {
    const date = new Date(`${iso}T00:00:00`);
    if (data.unit === "month") return format.dateTime(date, { month: "short" });
    return format.dateTime(date, { day: "numeric", month: "numeric" });
  };

  const fullLabel = (iso: string) => {
    const date = new Date(`${iso}T00:00:00`);
    if (data.unit === "month")
      return format.dateTime(date, { month: "long", year: "numeric" });
    const day = format.dateTime(date, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
    // A week is a period, not a day — the label says so.
    return data.unit === "week" ? t("dashboard.weekOf", { date: day }) : day;
  };

  const points: ChartPoint[] = data.throughput.map(({ date, ...values }) => ({
    key: date,
    label: fullLabel(date),
    short: axisLabel(date),
    values,
  }));

  // Created first, closed above it: read as "how much comes in, how much
  // goes out", and it appears in the tooltip in this same order.
  const flowSeries: ChartSeries[] = [
    {
      key: "created",
      label: t("dashboard.opened"),
      color: "var(--chart-1)",
    },
    {
      key: "closed",
      label: t("dashboard.closed"),
      color: "var(--chart-3)",
    },
  ];

  // ── The key figures ──
  //
  // Stock first, movement after, and at the end the time that connects both.
  // Each carries a second line stating what the number refers to — a number
  // with no reference point isn't information.
  const stats = [
    {
      key: "open",
      label: t("dashboard.statOpen"),
      value: format.number(data.stats.open),
      foot: t("dashboard.statOpenFoot", {
        percent:
          data.stats.total === 0
            ? 0
            : Math.round((data.stats.open / data.stats.total) * 100),
        total: data.stats.total,
      }),
      href: links.list,
    },
    {
      key: "progress",
      label: t("dashboard.statProgress"),
      value: format.number(data.stats.inProgress),
      foot: t("dashboard.statProgressFoot", { count: data.stats.inReview }),
      href: links.list,
    },
    {
      key: "closed",
      label: t("dashboard.statClosed"),
      value: format.number(data.stats.closed),
      // The net change is the actual information: five closed issues are
      // progress if three were added, and none at all if it was eight.
      foot: t("dashboard.statClosedFoot", {
        created: data.stats.created,
        net: `${data.stats.created - data.stats.closed >= 0 ? "+" : ""}${
          data.stats.created - data.stats.closed
        }`,
      }),
    },
    {
      key: "urgent",
      label: t("dashboard.statUrgent"),
      value: format.number(data.stats.urgent),
      foot:
        data.stats.urgentUnassigned > 0
          ? t("dashboard.statUrgentOpen", {
              count: data.stats.urgentUnassigned,
            })
          : t("dashboard.statUrgentAssigned"),
      // Red only when it has something to say. A tile that always glows
      // glows for nothing.
      warn: data.stats.urgent > 0,
    },
    {
      key: "cycle",
      label: t("dashboard.statCycle"),
      value:
        data.stats.cycleDays === null
          ? "—"
          : t("dashboard.days", {
              days: format.number(data.stats.cycleDays, {
                minimumFractionDigits: 1,
                maximumFractionDigits: 1,
              }),
            }),
      foot: t("dashboard.statCycleFoot"),
    },
  ];

  // The name comes from the workspace's metadata and not from the
  // translation catalog — exactly as the board and list next to it display
  // it. A dashboard that writes "Dringend" while the column next to it says
  // "Urgent" would look like two different apps.
  const priorityRows: BarRow[] = data.priorities.map((priority) => ({
    id: String(priority.id),
    label: priority.name,
    value: priority.count,
    leading: <PriorityIcon priority={priority.id} size={14} />,
  }));

  const workloadRows: BarRow[] = data.workload.map((row) => ({
    id: row.user?.id ?? "unassigned",
    label: row.user ? fullName(row.user) : t("fields.unassigned"),
    value: row.open,
    meta:
      row.inProgress > 0
        ? t("dashboard.workloadMeta", { count: row.inProgress })
        : undefined,
    leading: (
      <Avatar
        avatar={row.user}
        size={22}
        placeholder={!row.user}
        placeholderLabel={t("fields.unassigned")}
      />
    ),
  }));

  // ── One widget per key ──
  //
  // An object, not a `switch` statement: this way it's visible at a glance
  // that every key from the registry has a counterpart here, and a
  // forgotten one fails the type check instead of silently rendering
  // nothing.
  const widgets: Record<WidgetKey, ReactNode> = {
    stats: (
      <div className={styles.stats}>
        {stats.map((stat) => {
          const inner = (
            <>
              <span className={styles.statLabel}>{stat.label}</span>
              <span className={styles.statValue}>{stat.value}</span>
              <span className={styles.statFoot}>{stat.foot}</span>
            </>
          );
          return stat.href ? (
            <Link key={stat.key} href={stat.href} className={styles.stat}>
              {inner}
            </Link>
          ) : (
            <div
              key={stat.key}
              className={styles.stat}
              data-warn={stat.warn ? "" : undefined}
            >
              {inner}
            </div>
          );
        })}
      </div>
    ),

    status: (
      <ChartCard
        title={t("dashboard.statusTitle")}
        hint={t("dashboard.statusHint")}
        total={format.number(data.stats.total)}
      >
        <StackedBar
          segments={data.statuses.map((status) => ({
            id: status.id,
            label: status.short,
            value: status.count,
            color: status.color,
          }))}
          label={t("dashboard.statusTitle")}
          valueLabel={t("dashboard.issues")}
          asTable={asTable}
        />
      </ChartCard>
    ),

    throughput: (
      <ChartCard
        title={t("dashboard.flowTitle")}
        hint={t("dashboard.flowHint")}
        series={flowSeries}
        total={format.number(data.stats.closed)}
      >
        <ColumnChart
          series={flowSeries}
          points={points}
          label={t("dashboard.flowTitle")}
          valueLabel={t("dashboard.period")}
          asTable={asTable}
        />
      </ChartCard>
    ),

    priority: (
      <ChartCard
        title={t("dashboard.priorityTitle")}
        hint={t("dashboard.priorityHint")}
        total={format.number(data.stats.open)}
      >
        <BarList
          rows={priorityRows}
          label={t("dashboard.priorityTitle")}
          valueLabel={t("dashboard.issues")}
          asTable={asTable}
        />
      </ChartCard>
    ),

    workload: (
      <ChartCard
        title={t("dashboard.workloadTitle")}
        hint={t("dashboard.workloadHint")}
        total={format.number(data.stats.open)}
      >
        {workloadRows.length === 0 ? (
          <p className={styles.none}>{t("dashboard.workloadEmpty")}</p>
        ) : (
          <BarList
            rows={workloadRows}
            label={t("dashboard.workloadTitle")}
            valueLabel={t("dashboard.issues")}
            asTable={asTable}
          />
        )}
      </ChartCard>
    ),

    attention: (
      <ChartCard
        title={t("dashboard.attentionTitle")}
        hint={t("dashboard.attentionHint")}
        total={format.number(data.attention.length)}
      >
        <IssueList
          issues={data.attention}
          hrefFor={issueHref}
          badgeFor={(issue) => (
            <ReasonBadge
              icon={REASON_ICONS[issue.reason]}
              label={t(`dashboard.reason_${issue.reason}`)}
            />
          )}
          emptyIcon={<Icon icon="lucide:check-check" width={26} />}
          emptyTitle={t("dashboard.attentionEmpty")}
          emptyDescription={t("dashboard.attentionEmptyHint")}
        />
      </ChartCard>
    ),
  };

  const isDashboard = view === "dashboard";

  // Workload is a question of distribution across multiple people —
  // narrowed to just yourself, it no longer has an answer. Only the
  // rendering hides it; the saved layout stays untouched: switch back to
  // "all" and the widget reappears exactly where it was.
  const visibleOrder =
    data.scope === "mine" ? order.filter((key) => key !== "workload") : order;

  return (
    <>
      <PageHeader
        divider={false}
        // Name and color dot only in the dashboard view — in the overview
        // (`profile`), the hero header right below (`ProjectProfileView`)
        // already states them, larger and with the avatar image.
        leading={
          isDashboard ? (
            <span
              className={styles.dot}
              style={{ background: project.color }}
              aria-hidden="true"
            />
          ) : undefined
        }
        title={isDashboard ? project.name : ""}
        // No description line — in either view. What the page shows is
        // already stated by the toggle next to it, and in the overview the
        // header card below states it even more precisely. What matters is
        // only that *both* views keep this consistent: a header that's two
        // lines tall in one and one line tall in the other would jump on
        // switching and drag everything below it along. `PageHeader` adjusts
        // its own padding for this (`:has(.description)`).
        // The toggle sits at the very top, level with the project name: it
        // switches the whole page and therefore belongs above everything it
        // switches — not in the row of controls below, which only applies
        // to one of the two views.
        actions={
          <SegmentedControl
            variant="surface"
            value={view}
            onChange={pickView}
            items={[
              {
                value: "profile",
                label: t("dashboard.viewProfile"),
                icon: <Icon icon="lucide:info" width={15} />,
              },
              {
                value: "dashboard",
                label: t("dashboard.viewDashboard"),
                icon: <Icon icon="lucide:layout-dashboard" width={15} />,
              },
            ]}
          />
        }
      />

      <div className={styles.body} data-view={view}>
        {/* A single row, above everything it affects — and only where it
            has an effect. The overview has no period, no table view, and
            nothing to customize. */}
        {isDashboard && (
          <div className={styles.controls}>
            <RangePicker
              value={data.range}
              onChange={pickRange}
              label={t("dashboard.range")}
              labelFor={(range) => t(`dashboard.range_${range}`)}
            />

            {/* Only someone with `dashboard.view.all` may choose between
                their own numbers and the whole project's — for everyone
                else `data.scope` is fixed to "mine" anyway
                (`getProjectDashboard`). */}
            {profile.canViewAllStats && (
              <ScopePicker
                value={data.scope}
                onChange={pickScope}
                label={t("dashboard.scope")}
                labelFor={(scope) => t(`dashboard.scope_${scope}`)}
              />
            )}

            <div className={styles.tools}>
              <Chip
                type="filter"
                icon={<Icon icon="lucide:table-2" width={14} />}
                selected={asTable}
                onClick={() => setAsTable((value) => !value)}
              >
                {t("dashboard.asTable")}
              </Chip>

              <Button
                variant="elevated"
                icon={<Icon icon="lucide:sliders-horizontal" width={15} />}
                onClick={customize}
              >
                {t("dashboard.customize")}
              </Button>
            </div>
          </div>
        )}

        {isDashboard && data.scope === "mine" && (
          <p className={styles.scopeHint}>
            <Icon icon="lucide:user" width={14} />
            {t("dashboard.scopeMineHint")}
          </p>
        )}

        {/* While new numbers are loading, the old view stays in place and
            recedes. A skeleton here would be a layout jump and a flash on
            every click. */}
        {isDashboard ? (
          <div className={styles.grid} data-loading={isPending || undefined}>
            {visibleOrder.map((key) => (
              <div
                key={key}
                className={styles.cell}
                data-span={widgetDef(key).span}
              >
                {widgets[key]}
              </div>
            ))}
          </div>
        ) : (
          <ProjectProfileView
            project={project}
            workspaceId={workspaceId}
            profile={profile}
            stats={data.stats}
            links={links}
            activity={activity}
          />
        )}
      </div>
    </>
  );
}
