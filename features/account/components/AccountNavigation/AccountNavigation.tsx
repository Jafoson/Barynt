"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { NativeSelect } from "@/components/ui/atoms/NativeSelect/NativeSelect";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { NAV_COLLAPSED_COOKIE } from "@/components/ui/layout/AppShell/navState";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import {
  SettingsBody,
  SettingsList,
  type SettingsRow,
} from "@/components/ui/layout/SettingsList/SettingsList";
import {
  type BehaviorPreferences,
  GROUP_KEYS,
  ISSUE_OPEN_MODES,
  ISSUE_PAGE_OPEN_MODES,
  PROJECT_LANDINGS,
  PROJECT_ORDERS,
  SORT_KEYS,
  START_PAGES,
} from "@/features/account/preferences";
import { useBehavior } from "../useBehavior";
import styles from "./accountNavigation.module.scss";

type Values = Pick<
  BehaviorPreferences,
  | "projectLanding"
  | "startPage"
  | "startViewId"
  | "issueOpenMode"
  | "issuePageOpenMode"
  | "defaultGrouping"
  | "defaultSort"
  | "defaultShowSubIssues"
  | "sidebarCollapsed"
  | "projectOrder"
>;

interface Props {
  values: Values;
  /** The views a start page can point at (V7). */
  viewChoices: { id: string; name: string; projectName: string }[];
}

const LANDING_LABEL = {
  board: "landingBoard",
  list: "landingList",
  dashboard: "landingDashboard",
  view: "landingView",
} as const;

const START_LABEL = {
  workspace: "startWorkspace",
  my: "startMy",
  inbox: "startInbox",
  dashboard: "startDashboard",
  view: "startView",
} as const;

const OPEN_LABEL = {
  panel: "openPanel",
  page: "openPage",
  tab: "openTab",
  browserTab: "openBrowserTab",
} as const;

const PAGE_OPEN_LABEL = {
  tab: "openTab",
  browserTab: "openBrowserTab",
  page: "openSameTab",
} as const;

const ORDER_LABEL = { name: "orderName", newest: "orderNewest" } as const;

/**
 * Where clicks lead, where you start, and how issues open.
 *
 * Everything takes effect immediately (`useBehavior`); the server reads the
 * same row on the next render.
 */
export function AccountNavigation({ values, viewChoices }: Props) {
  const t = useTranslations();
  const [current, set] = useBehavior<keyof Values>(values);

  // The sidebar's collapsed state lives in a cookie of this browser (set by
  // dragging the edge). Choosing a default here should be seen right away
  // rather than only on the next device — so it is written there too.
  const setCollapsed = (collapsed: boolean) => {
    set({ sidebarCollapsed: collapsed });
    try {
      // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is missing in older Safari
      document.cookie = `${NAV_COLLAPSED_COOKIE}=${collapsed ? "1" : "0"}; path=/; max-age=31536000; samesite=lax`;
    } catch {
      // Cookies blocked: the setting is stored all the same.
    }
  };

  const start: SettingsRow[] = [
    {
      id: "projectLanding",
      label: t("behavior.projectLanding"),
      desc:
        current.projectLanding === "view"
          ? `${t("behavior.projectLandingDesc")} ${t("behavior.landingViewHint")}`
          : t("behavior.projectLandingDesc"),
      control: (
        <SegmentedControl
          items={PROJECT_LANDINGS.map((value) => ({
            value,
            label: t(`behavior.${LANDING_LABEL[value]}`),
          }))}
          value={current.projectLanding}
          onChange={(v) =>
            set({ projectLanding: v as Values["projectLanding"] })
          }
        />
      ),
    },
    {
      id: "startPage",
      label: t("behavior.startPage"),
      desc: t("behavior.startPageDesc"),
      control: (
        <NativeSelect
          label={t("behavior.startPage")}
          items={START_PAGES.filter(
            // "A view" only with one to pick.
            (value) => value !== "view" || viewChoices.length > 0,
          ).map((value) => ({
            value,
            label: t(`behavior.${START_LABEL[value]}`),
          }))}
          value={current.startPage}
          onChange={(v) =>
            v === "view"
              ? set({
                  startPage: "view",
                  startViewId:
                    viewChoices.find((c) => c.id === current.startViewId)?.id ??
                    viewChoices[0]?.id ??
                    null,
                })
              : set({ startPage: v as Values["startPage"] })
          }
        />
      ),
    },
    // Which view, once "a view" is chosen.
    ...(current.startPage === "view"
      ? [
          {
            id: "startView",
            label: t("behavior.startViewPick"),
            desc:
              viewChoices.length === 0
                ? t("behavior.startViewNone")
                : undefined,
            control: (
              <NativeSelect
                label={t("behavior.startViewPick")}
                items={viewChoices.map((c) => ({
                  value: c.id,
                  label: `${c.name} · ${c.projectName}`,
                }))}
                value={current.startViewId ?? ""}
                onChange={(v) => set({ startViewId: v })}
              />
            ),
          } satisfies SettingsRow,
        ]
      : []),
    {
      id: "projectOrder",
      label: t("behavior.projectOrder"),
      desc: t("behavior.projectOrderDesc"),
      control: (
        <SegmentedControl
          items={PROJECT_ORDERS.map((value) => ({
            value,
            label: t(`behavior.${ORDER_LABEL[value]}`),
          }))}
          value={current.projectOrder}
          onChange={(v) => set({ projectOrder: v as Values["projectOrder"] })}
        />
      ),
    },
    {
      id: "sidebarCollapsed",
      label: t("behavior.sidebarCollapsed"),
      desc: t("behavior.sidebarCollapsedDesc"),
      control: (
        <Switch
          checked={current.sidebarCollapsed}
          onChange={setCollapsed}
          label={t("behavior.sidebarCollapsed")}
          labelHidden
        />
      ),
    },
  ];

  const issues: SettingsRow[] = [
    {
      id: "issueOpenMode",
      label: t("behavior.issueOpenMode"),
      desc: t("behavior.issueOpenModeDesc"),
      control: (
        <NativeSelect
          label={t("behavior.issueOpenMode")}
          items={ISSUE_OPEN_MODES.map((value) => ({
            value,
            label: t(`behavior.${OPEN_LABEL[value]}`),
          }))}
          value={current.issueOpenMode}
          onChange={(v) => set({ issueOpenMode: v as Values["issueOpenMode"] })}
        />
      ),
    },
    {
      id: "issuePageOpenMode",
      label: t("behavior.issuePageOpenMode"),
      desc: t("behavior.issuePageOpenModeDesc"),
      control: (
        <NativeSelect
          label={t("behavior.issuePageOpenMode")}
          items={ISSUE_PAGE_OPEN_MODES.map((value) => ({
            value,
            label: t(`behavior.${PAGE_OPEN_LABEL[value]}`),
          }))}
          value={current.issuePageOpenMode}
          onChange={(v) =>
            set({ issuePageOpenMode: v as Values["issuePageOpenMode"] })
          }
        />
      ),
    },
  ];

  const views: SettingsRow[] = [
    {
      id: "defaultGrouping",
      label: t("behavior.defaultGrouping"),
      desc: t("behavior.defaultGroupingDesc"),
      control: (
        <NativeSelect
          label={t("behavior.defaultGrouping")}
          items={GROUP_KEYS.map((value) => ({
            value,
            label: t(`fields.${value}`),
          }))}
          value={current.defaultGrouping}
          onChange={(v) =>
            set({ defaultGrouping: v as Values["defaultGrouping"] })
          }
        />
      ),
    },
    {
      id: "defaultSort",
      label: t("behavior.defaultSort"),
      desc: t("behavior.defaultSortDesc"),
      control: (
        <NativeSelect
          label={t("behavior.defaultSort")}
          items={SORT_KEYS.map((value) => ({
            value,
            label: t(`sort.${value}`),
          }))}
          value={current.defaultSort}
          onChange={(v) => set({ defaultSort: v as Values["defaultSort"] })}
        />
      ),
    },
    {
      id: "defaultShowSubIssues",
      label: t("behavior.defaultShowSubIssues"),
      desc: t("behavior.defaultShowSubIssuesDesc"),
      control: (
        <Switch
          checked={current.defaultShowSubIssues}
          onChange={(checked) => set({ defaultShowSubIssues: checked })}
          label={t("behavior.defaultShowSubIssues")}
          labelHidden
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        divider={false}
        title={t("behavior.navigationTitle")}
        description={t("behavior.navigationDesc")}
      />

      <SettingsBody>
        <SettingsList title={t("behavior.groupStart")} rows={start} />
        <SettingsList title={t("behavior.groupIssues")} rows={issues} />
        <SettingsList title={t("behavior.groupViews")} rows={views} />

        <p className={styles.note}>
          <Icon icon="lucide:info" width={14} />
          {t("behavior.navigationNote")}
        </p>
      </SettingsBody>
    </>
  );
}
