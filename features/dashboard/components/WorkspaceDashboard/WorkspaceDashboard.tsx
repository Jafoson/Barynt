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
  resetWorkspaceDashboardLayout,
  saveWorkspaceDashboardLayout,
  setWorkspaceDashboardRange,
  setWorkspaceDashboardScope,
} from "@/features/dashboard/actions";
import { CustomizeDialog } from "@/features/dashboard/components/CustomizeDialog/CustomizeDialog";
import {
  IssueList,
  ReasonBadge,
} from "@/features/dashboard/components/IssueList/IssueList";
import type { DashboardScope } from "@/features/dashboard/scope";
import type { WorkspaceDashboardView } from "@/features/dashboard/types";
import type { WidgetKey } from "@/features/dashboard/widgets";
import { widgetDef } from "@/features/dashboard/widgets";
import { PriorityIcon } from "@/features/issues/components/IssueIcons/IssueIcons";
import { useRouter } from "@/i18n/navigation";
import type { RangeKey } from "@/lib/buckets";
import { useModal } from "@/lib/context";
import { fullName } from "@/lib/utils/string";
import { WorkspaceProfileView } from "./components/WorkspaceProfileView";
import styles from "./workspaceDashboard.module.scss";

/** Like the project, just without a stored default: the route itself says which view is open. */
type WorkspaceView = "dashboard" | "profile";

interface Props extends WorkspaceDashboardView {
  view: WorkspaceView;
  /** Base address for issues: `/<workspace>/issue`. */
  issueBase: string;
  /** Addresses of the neighboring areas and the counterpart view. */
  links: {
    dashboard: string;
    overview: string;
    projects: string;
    members: string;
    teams: string;
    settings: string;
    /** The full, filterable list — the overview's activity card shows only an excerpt. */
    activity: string;
  };
  /** For the overview's activity card — already filtered by `audit.view` (`getWorkspaceActivity`). */
  activity: ActivityView;
}

const REASON_ICONS = {
  unassigned: "lucide:user-x",
  urgent: "lucide:triangle-alert",
  stale: "lucide:clock-alert",
} as const;

/**
 * A workspace's home page, in two views — the same pair as `ProjectDashboard`
 * one level down, just as two separate routes instead of a toggle on one
 * address: the sidebar here has two separate nav links, "Dashboard" and
 * "Overview", not one shared one. The toggle at the top still exists — it
 * just switches the route instead of only appending to the address
 * (`urlWith`).
 *
 * No stored `view`: unlike the project, there's no row here that would need
 * to remember "last open" — both routes have their own nav link, and
 * whoever clicks one means exactly that one.
 */
export function WorkspaceDashboard({
  workspace,
  data,
  profile,
  order,
  hidden,
  view,
  issueBase,
  links,
  activity,
}: Props) {
  const t = useTranslations();
  const format = useFormatter();
  const router = useRouter();
  const { openModal } = useModal();

  const [isPending, startTransition] = useTransition();
  const [asTable, setAsTable] = useState(false);

  /** The overview has no time period and gets the bare address; the dashboard always carries one. */
  const urlWith = (
    nextView: WorkspaceView,
    patch?: { range?: RangeKey; scope?: DashboardScope },
  ) => {
    if (nextView === "profile") return links.overview;
    const next = new URLSearchParams({
      range: patch?.range ?? data.range,
      scope: patch?.scope ?? data.scope,
    });
    return `${links.dashboard}?${next}`;
  };

  const pickRange = (range: RangeKey) => {
    startTransition(async () => {
      router.replace(urlWith("dashboard", { range }));
      await setWorkspaceDashboardRange(workspace.id, range);
    });
  };

  const pickScope = (scope: DashboardScope) => {
    startTransition(async () => {
      router.replace(urlWith("dashboard", { scope }));
      await setWorkspaceDashboardScope(workspace.id, scope);
    });
  };

  const pickView = (next: string) => {
    startTransition(() => {
      router.replace(urlWith(next as WorkspaceView));
    });
  };

  const customize = () =>
    openModal(
      ({ close }) => (
        <CustomizeDialog
          order={order}
          hidden={hidden}
          close={close}
          onSave={(o, h) => saveWorkspaceDashboardLayout(workspace.id, o, h)}
          onReset={() => resetWorkspaceDashboardLayout(workspace.id)}
        />
      ),
      { label: t("dashboard.customize") },
    );

  const issueHref = (ref: string) => `${issueBase}/${ref.toLowerCase()}`;

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
    return data.unit === "week" ? t("dashboard.weekOf", { date: day }) : day;
  };

  const points: ChartPoint[] = data.throughput.map(({ date, ...values }) => ({
    key: date,
    label: fullLabel(date),
    short: axisLabel(date),
    values,
  }));

  const flowSeries: ChartSeries[] = [
    { key: "created", label: t("dashboard.opened"), color: "var(--chart-1)" },
    { key: "closed", label: t("dashboard.closed"), color: "var(--chart-3)" },
  ];

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
    },
    {
      key: "progress",
      label: t("dashboard.statProgress"),
      value: format.number(data.stats.inProgress),
      foot: t("dashboard.statProgressFoot", { count: data.stats.inReview }),
    },
    {
      key: "closed",
      label: t("dashboard.statClosed"),
      value: format.number(data.stats.closed),
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

  const widgets: Record<WidgetKey, ReactNode> = {
    stats: (
      <div className={styles.stats}>
        {stats.map((stat) => (
          <div
            key={stat.key}
            className={styles.stat}
            data-warn={stat.warn ? "" : undefined}
          >
            <span className={styles.statLabel}>{stat.label}</span>
            <span className={styles.statValue}>{stat.value}</span>
            <span className={styles.statFoot}>{stat.foot}</span>
          </div>
        ))}
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

  // As in `ProjectDashboard`: workload is a distribution across multiple
  // people and no longer has an answer when narrowed to just yourself. Only
  // the rendering hides it; the saved layout stays untouched.
  const visibleOrder =
    data.scope === "mine" ? order.filter((key) => key !== "workload") : order;

  return (
    <>
      <PageHeader
        divider={false}
        // Name and color dot only in the dashboard view — in the overview
        // (`profile`), the hero header right below (`WorkspaceProfileView`)
        // already states them, larger and with the avatar image.
        leading={
          isDashboard ? (
            <span
              className={styles.dot}
              style={{ background: workspace.color }}
              aria-hidden="true"
            />
          ) : undefined
        }
        title={isDashboard ? workspace.name : ""}
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
        {isDashboard && (
          <div className={styles.controls}>
            <RangePicker
              value={data.range}
              onChange={pickRange}
              label={t("dashboard.range")}
              labelFor={(range) => t(`dashboard.range_${range}`)}
            />

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
          <WorkspaceProfileView
            workspace={workspace}
            workspaceSlug={workspace.slug}
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
