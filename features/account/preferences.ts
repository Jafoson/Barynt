// The values of the behavior settings — one list per setting, shared by the
// settings page (what to offer), the action (what to accept) and the places
// that act on them. No imports from the app: runs on the server, in the
// browser and in tests alike.

import { GROUP_KEYS } from "@/features/issues/group";
import { SORT_KEYS } from "@/features/issues/sort";

/** Where a click on a project's name in the sidebar leads. */
export const PROJECT_LANDINGS = ["board", "list", "dashboard"] as const;
export type ProjectLanding = (typeof PROJECT_LANDINGS)[number];

/** Where you land after signing in. `workspace` is the workspace's start page. */
export const START_PAGES = ["workspace", "my", "inbox", "dashboard"] as const;
export type StartPage = (typeof START_PAGES)[number];

/**
 * What a click on an issue does.
 *
 * `panel` — the side panel over the current view; `page` — the full page in
 * the same tab; `tab` — the full page in a new Barynt tab (the tab bar);
 * `browserTab` — the full page in a new browser tab.
 */
export const ISSUE_OPEN_MODES = ["panel", "page", "tab", "browserTab"] as const;
export type IssueOpenMode = (typeof ISSUE_OPEN_MODES)[number];

/**
 * What "open the full page" in the issue detail does: a new Barynt tab, a
 * new browser tab, or the same tab.
 */
export const ISSUE_PAGE_OPEN_MODES = ["tab", "browserTab", "page"] as const;
export type IssuePageOpenMode = (typeof ISSUE_PAGE_OPEN_MODES)[number];

export const PROJECT_ORDERS = ["name", "newest"] as const;
export type ProjectOrder = (typeof PROJECT_ORDERS)[number];

export const DATE_FORMATS = ["relative", "absolute"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const WEEK_STARTS = ["monday", "sunday"] as const;
export type WeekStart = (typeof WEEK_STARTS)[number];

export { GROUP_KEYS, SORT_KEYS };

/** `Intl` knows every zone it supports — nothing to keep in sync here. */
export function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** Own shortcuts: default spec → own spec, as stored. */
export type ShortcutOverrides = Record<string, string>;

/** Whatever came out of the JSON column, reduced to a clean map. */
export function toShortcutOverrides(value: unknown): ShortcutOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: ShortcutOverrides = {};
  for (const [from, to] of Object.entries(value)) {
    if (typeof to === "string" && to) out[from] = to;
  }
  return out;
}

/** The settings that change how the app acts rather than how it looks. */
export interface BehaviorPreferences {
  projectLanding: ProjectLanding;
  startPage: StartPage;
  issueOpenMode: IssueOpenMode;
  issuePageOpenMode: IssuePageOpenMode;
  defaultGrouping: (typeof GROUP_KEYS)[number];
  defaultSort: (typeof SORT_KEYS)[number];
  defaultShowSubIssues: boolean;
  sidebarCollapsed: boolean;
  projectOrder: ProjectOrder;
  dateFormat: DateFormat;
  weekStart: WeekStart;
  /** `null` = the browser's own zone. */
  timeZone: string | null;
  shortcutOverrides: ShortcutOverrides;
  confirmDestructive: boolean;
}

export const DEFAULT_BEHAVIOR: BehaviorPreferences = {
  projectLanding: "board",
  startPage: "workspace",
  issueOpenMode: "panel",
  issuePageOpenMode: "tab",
  defaultGrouping: "status",
  defaultSort: "manual",
  defaultShowSubIssues: false,
  sidebarCollapsed: false,
  projectOrder: "name",
  dateFormat: "relative",
  weekStart: "monday",
  timeZone: null,
  shortcutOverrides: {},
  confirmDestructive: true,
};

const oneOf = <T extends string>(
  list: readonly T[],
  value: unknown,
  fallback: T,
): T =>
  typeof value === "string" && (list as readonly string[]).includes(value)
    ? (value as T)
    : fallback;

/**
 * A database row, reduced to known values. A value written by a newer or
 * older build (a renamed option) falls back to the default instead of
 * reaching a `switch` that doesn't know it.
 */
export function toBehavior(
  row: Partial<Record<keyof BehaviorPreferences, unknown>>,
): BehaviorPreferences {
  const d = DEFAULT_BEHAVIOR;
  return {
    projectLanding: oneOf(
      PROJECT_LANDINGS,
      row.projectLanding,
      d.projectLanding,
    ),
    startPage: oneOf(START_PAGES, row.startPage, d.startPage),
    issueOpenMode: oneOf(ISSUE_OPEN_MODES, row.issueOpenMode, d.issueOpenMode),
    issuePageOpenMode: oneOf(
      ISSUE_PAGE_OPEN_MODES,
      row.issuePageOpenMode,
      d.issuePageOpenMode,
    ),
    defaultGrouping: oneOf(GROUP_KEYS, row.defaultGrouping, d.defaultGrouping),
    defaultSort: oneOf(SORT_KEYS, row.defaultSort, d.defaultSort),
    defaultShowSubIssues:
      typeof row.defaultShowSubIssues === "boolean"
        ? row.defaultShowSubIssues
        : d.defaultShowSubIssues,
    sidebarCollapsed:
      typeof row.sidebarCollapsed === "boolean"
        ? row.sidebarCollapsed
        : d.sidebarCollapsed,
    projectOrder: oneOf(PROJECT_ORDERS, row.projectOrder, d.projectOrder),
    dateFormat: oneOf(DATE_FORMATS, row.dateFormat, d.dateFormat),
    weekStart: oneOf(WEEK_STARTS, row.weekStart, d.weekStart),
    timeZone:
      typeof row.timeZone === "string" && isTimeZone(row.timeZone)
        ? row.timeZone
        : null,
    shortcutOverrides: toShortcutOverrides(row.shortcutOverrides),
    confirmDestructive:
      typeof row.confirmDestructive === "boolean"
        ? row.confirmDestructive
        : d.confirmDestructive,
  };
}
