// Single source of truth for the app's navigation routes — one place that
// knows every URL, icon and label, grouped by area. Both the Sidebar
// (NavGroups) and the TabBar (tabMeta) read from these tables instead of
// each hardcoding their own copy, so a route/icon/label only changes here.
//
// `section` is the URL path segment used to both build hrefs (Sidebar) and
// match the current pathname back to an entry (TabBar): a workspace route
// looks like `/<workspaceId>/<section>`, an admin route `/admin/<section>`,
// a project route `/<workspaceId>/project/<projectSlug>/<section>`.
// `labelKey` is the key under the "nav" i18n namespace (messages/*.json).

import type { Permission } from "@/lib/rbac";

export type NavLabelKey =
  | "myIssues"
  | "dashboard"
  | "inbox"
  | "board"
  | "issues"
  | "members"
  | "teams"
  | "settings"
  | "projects"
  | "general"
  | "roles"
  | "labels"
  | "fields"
  | "workspaces"
  | "account"
  | "appearance"
  | "notifications"
  | "security"
  | "apiKeys"
  | "mcp"
  | "webhooks"
  | "connections"
  | "shortcuts"
  | "admin"
  | "overview"
  | "users"
  | "audit"
  | "activity"
  | "mailTemplates"
  | "plugins"
  | "pluginStores"
  | "invitations"
  | "adminSettings";

export interface NavEntry {
  section: string;
  icon: string;
  labelKey: NavLabelKey;
  /**
   * Permission(s) without which the entry doesn't appear. If omitted, it's
   * open to everyone allowed to enter the area at all. Multiple permissions
   * are an OR — the entry appears as soon as one of them applies (e.g.
   * "Settings": visible to whoever can change anything there, no matter
   * what).
   *
   * This is checked via `navEntryAllowed()`. Visibility is still not a
   * safeguard — just courtesy, so no entry leads to a 403 page on click.
   * The actual check lives in the query behind it
   * (`features/admin/queries.ts`, `features/workspaces/queries.ts`, …),
   * freshly on every call.
   */
  permission?: Permission | Permission[];
}

/** May a nav entry be offered? No permission required = always yes. */
export function navEntryAllowed(
  has: (permission: Permission) => boolean,
  entry: Pick<NavEntry, "permission">,
): boolean {
  if (!entry.permission) return true;
  const required = Array.isArray(entry.permission)
    ? entry.permission
    : [entry.permission];
  return required.some(has);
}

/**
 * The workspace's home page, in two views — `/<workspaceId>` (empty
 * section) and `/<workspaceId>/dashboard`. Unlike the project
 * (`PROJECT_OVERVIEW_NAV`, which lives under `/overview` because the root
 * there is already the board), the workspace has no root competing for the
 * spot — the overview gets it directly for that reason. Both views are
 * their own nav link in the sidebar: there's no single row meaning both
 * that would have to remember which one was open last.
 */
export const WORKSPACE_OVERVIEW_NAV: NavEntry = {
  section: "",
  icon: "lucide:info",
  labelKey: "overview",
};

export const WORKSPACE_DASHBOARD_NAV: NavEntry = {
  section: "dashboard",
  icon: "lucide:layout-dashboard",
  labelKey: "dashboard",
};

/** Sidebar "Global" group — always visible, not tied to workspace settings. */
export const GLOBAL_NAV: NavEntry[] = [
  { section: "my", icon: "lucide:user", labelKey: "myIssues" },
  { section: "projects", icon: "lucide:folders", labelKey: "projects" },
];

/**
 * Whoever holds one of these permissions can change something in the
 * settings of the respective scope — otherwise they'd just be read-only
 * views. The same rule decides both the tab in the sidebar
 * (`WORKSPACE_NAV`/`PROJECT_NAV`) AND the segment in the switcher
 * (`SettingsHeader`, see the three `settings/layout.tsx`) — one source for
 * both, instead of maintaining the list twice.
 */
export const WORKSPACE_SETTINGS_PERMISSIONS: Permission[] = [
  "role.manage",
  "label.create",
  "workspace.update",
];
export const PROJECT_SETTINGS_PERMISSIONS: Permission[] = [
  "role.manage",
  "label.create",
  "project.update",
  "plugin.enable",
];

/**
 * Sidebar "Workspace" group — workspace administration.
 *
 * Roles no longer live here: that's a setup question and belongs in the
 * settings (`WORKSPACE_SETTINGS_NAV`). Members and teams stay, because
 * people look them up in everyday use — both are also reachable from the
 * settings, the same view in a different frame.
 */
export const WORKSPACE_NAV: NavEntry[] = [
  {
    section: "members",
    icon: "lucide:users",
    labelKey: "members",
    permission: "member.view",
  },
  // Teams get no gate: without team.view.all you see your own instead of
  // all of them (`getWorkspaceTeamsView`) — the tab stays visible, only the
  // content is filtered.
  { section: "teams", icon: "lucide:users-round", labelKey: "teams" },
  {
    section: "settings",
    icon: "lucide:settings",
    labelKey: "settings",
    permission: WORKSPACE_SETTINGS_PERMISSIONS,
  },
];

/** Real route with its own tab metadata, but not (yet) linked from the Sidebar. */
export const INBOX_NAV: NavEntry = {
  section: "inbox",
  icon: "lucide:inbox",
  labelKey: "inbox",
};

/**
 * The roles page still exists under `/<workspaceId>/roles` — it's just no
 * longer in the sidebar. The entry stays so that an open tab or a shared
 * link keeps its name and its icon.
 */
export const ROLES_NAV: NavEntry = {
  section: "roles",
  icon: "lucide:shield-check",
  labelKey: "roles",
};

/**
 * Your own account settings — `/<workspaceId>/account/…`.
 *
 * They live in no sidebar: they're reached via your own menu in the bottom
 * left, where your own name sits. The entry exists anyway, because an open
 * tab and a shared link need a name and an icon — the same role as
 * `ROLES_NAV`.
 *
 * The section hangs under the workspace even though nothing in it belongs
 * to the workspace: outside the workspace shell, the app has no sidebar, no
 * tab bar, and no way back. Which workspace is in the address is
 * meaningless for the content.
 */
export const ACCOUNT_NAV: NavEntry = {
  section: "account",
  icon: "lucide:circle-user",
  labelKey: "account",
};

/** All sections that live directly under `/<workspaceId>/…` — used by the TabBar to resolve any workspace-scoped tab. */
export const WORKSPACE_SECTIONS: NavEntry[] = [
  WORKSPACE_OVERVIEW_NAV,
  WORKSPACE_DASHBOARD_NAV,
  ...GLOBAL_NAV,
  ...WORKSPACE_NAV,
  INBOX_NAV,
  ROLES_NAV,
  ACCOUNT_NAV,
];

/**
 * The sections of platform administration — `/admin` (empty section =
 * overview) or `/admin/<section>`.
 *
 * The order follows the order of access, inside out: first the state of
 * the platform, then the accounts, then the projects that belong to them,
 * then the roles that govern all of that — and last the log of what was
 * done here.
 *
 * What's in this list is the shell of the system: accounts, master data,
 * permissions, log. Content — issues, comments, attachments — deliberately
 * doesn't live in it and isn't reachable from here either. Whoever needs to
 * look inside goes through the emergency access
 * (`features/admin/actions.ts`).
 */
export const ADMIN_NAV: NavEntry[] = [
  { section: "", icon: "lucide:layout-dashboard", labelKey: "overview" },
  {
    section: "users",
    icon: "lucide:users",
    labelKey: "users",
    permission: "user.manage",
  },
  {
    // No dedicated read permission: the tenant list shows nothing the
    // dashboard doesn't already show. What you're allowed to *do* with a
    // workspace is decided by `workspace.suspend` and `workspace.delete` in
    // the view.
    section: "workspaces",
    icon: "lucide:building-2",
    labelKey: "workspaces",
  },
  {
    section: "projects",
    icon: "lucide:folders",
    labelKey: "projects",
    permission: "project.metadata.view",
  },
  {
    section: "roles",
    icon: "lucide:shield-check",
    labelKey: "roles",
    permission: "role.manage",
  },
  {
    section: "audit",
    icon: "lucide:scroll-text",
    labelKey: "audit",
    permission: "audit.view",
  },
  {
    section: "mail-templates",
    icon: "lucide:mail",
    labelKey: "mailTemplates",
    permission: "mail.template.manage",
  },
  {
    // What is installed, and whether its code may run. Managing plugins is a
    // platform matter, like the stores.
    section: "plugins",
    icon: "lucide:puzzle",
    labelKey: "plugins",
    permission: "plugin.manage",
  },
  {
    // Which plugin stores are on. It decides which code the platform can be
    // asked to approve, so it needs `plugin.manage`, not the general settings.
    section: "plugin-stores",
    icon: "lucide:package",
    labelKey: "pluginStores",
    permission: "plugin.manage",
  },
  {
    section: "settings",
    icon: "lucide:settings",
    labelKey: "adminSettings",
    permission: "system.settings.manage",
  },
];

/**
 * Per-project sub-nav — `/<workspaceId>/project/<slug>` (empty section = board)
 * or `/<workspaceId>/project/<slug>/<section>`.
 *
 * Members live here and not in the settings: whoever works in the project
 * looks them up there to see who they can reach — that's a matter of
 * everyday use, not a setting. Roles and labels are, which is why they hang
 * under `settings` (`PROJECT_SETTINGS_NAV`).
 */
export const PROJECT_NAV: NavEntry[] = [
  { section: "", icon: "lucide:square-kanban", labelKey: "board" },
  { section: "list", icon: "lucide:list", labelKey: "issues" },
  { section: "members", icon: "lucide:users", labelKey: "members" },
  {
    section: "settings",
    icon: "lucide:settings",
    labelKey: "settings",
    permission: PROJECT_SETTINGS_PERMISSIONS,
  },
];

/**
 * A project's home page — `…/project/<slug>/overview`.
 *
 * It lives in no sidebar, because it *is* the project row: whoever clicks a
 * project without meaning a specific section lands here. A second entry
 * below it would point at the same address as the row above it.
 *
 * The entry exists anyway, because an open tab and a shared link need a
 * name and an icon — the same role as `ROLES_NAV` and `ACCOUNT_NAV` one
 * level up.
 */
export const PROJECT_OVERVIEW_NAV: NavEntry = {
  section: "overview",
  icon: "lucide:layout-dashboard",
  labelKey: "overview",
};

/**
 * All sections under `…/project/<slug>/…` — the list the tab bar resolves
 * the name and icon of any project address from. The counterpart to
 * `WORKSPACE_SECTIONS` one level down.
 */
export const PROJECT_SECTIONS: NavEntry[] = [
  PROJECT_OVERVIEW_NAV,
  ...PROJECT_NAV,
];

/**
 * The sections of the project settings — `…/project/<slug>/settings/<section>`,
 * empty section = general.
 *
 * The bar is rendered by `ProjectSettingsNav`; the layout decides the
 * visibility of individual entries based on permissions.
 */
export const PROJECT_SETTINGS_NAV: NavEntry[] = [
  { section: "", icon: "lucide:settings", labelKey: "general" },
  // The same page as under `…/project/<slug>/members`: whoever's looking
  // for members sometimes looks under the project and sometimes under its
  // settings — both lead there. First the people, then their permissions,
  // then the labels.
  { section: "members", icon: "lucide:users", labelKey: "members" },
  {
    section: "invitations",
    icon: "lucide:mail",
    labelKey: "invitations",
    permission: "member.invite",
  },
  {
    section: "roles",
    icon: "lucide:shield-check",
    labelKey: "roles",
    permission: "role.manage",
  },
  { section: "labels", icon: "lucide:tag", labelKey: "labels" },
  { section: "fields", icon: "lucide:layout-list", labelKey: "fields" },
  {
    // Which of the platform's plugins this project uses.
    section: "plugins",
    icon: "lucide:puzzle",
    labelKey: "plugins",
    permission: "plugin.enable",
  },
  {
    section: "activity",
    icon: "lucide:scroll-text",
    labelKey: "activity",
    permission: "audit.view",
  },
];

/**
 * The sections of the workspace settings — `/<workspaceId>/settings/<section>`,
 * empty section = general.
 *
 * The same second level as the project (`PROJECT_SETTINGS_NAV`), one step
 * up: this is what applies to the whole workspace. Members and teams are
 * additionally reachable directly under `/<workspaceId>/…` — whoever works
 * in the workspace looks them up there, whoever sets it up finds them here
 * next to roles and labels. The component is shared, not the route.
 */
export const WORKSPACE_SETTINGS_NAV: NavEntry[] = [
  { section: "", icon: "lucide:settings", labelKey: "general" },
  { section: "projects", icon: "lucide:folders", labelKey: "projects" },
  { section: "labels", icon: "lucide:tag", labelKey: "labels" },
  {
    section: "webhooks",
    icon: "lucide:webhook",
    labelKey: "webhooks",
    permission: "webhook.manage",
  },
  { section: "teams", icon: "lucide:users-round", labelKey: "teams" },
  {
    // Which of the platform's plugins this workspace uses.
    section: "plugins",
    icon: "lucide:puzzle",
    labelKey: "plugins",
    permission: "plugin.enable",
  },
  {
    section: "roles",
    icon: "lucide:shield-check",
    labelKey: "roles",
    permission: "role.manage",
  },
  {
    section: "members",
    icon: "lucide:users",
    labelKey: "members",
    permission: "member.view",
  },
  {
    section: "invitations",
    icon: "lucide:mail",
    labelKey: "invitations",
    permission: "member.invite",
  },
  {
    section: "activity",
    icon: "lucide:scroll-text",
    labelKey: "activity",
    permission: "audit.view",
  },
];

/**
 * The sections of your own account settings — `/<workspaceId>/account/<section>`,
 * empty section = general.
 *
 * The same second level as the workspace and the project, only it belongs
 * to nobody but whoever opens it. The order follows frequency: first who
 * you are, then what it looks like, then what reaches you — and last, what
 * you sign in with. Permissions play no role here: everyone sees exactly
 * their own settings.
 *
 * One exception: "connections" disappears when `auth.config.ts` hasn't
 * enabled a single OAuth provider (`account/layout.tsx` filters that out) —
 * a tab to a list that would always be empty helps nobody.
 */
export const ACCOUNT_SETTINGS_NAV: NavEntry[] = [
  { section: "", icon: "lucide:user", labelKey: "general" },
  { section: "appearance", icon: "lucide:palette", labelKey: "appearance" },
  { section: "notifications", icon: "lucide:bell", labelKey: "notifications" },
  { section: "security", icon: "lucide:shield-check", labelKey: "security" },
  { section: "api-keys", icon: "lucide:key-round", labelKey: "apiKeys" },
  { section: "mcp", icon: "lucide:plug-zap", labelKey: "mcp" },
  { section: "connections", icon: "lucide:link", labelKey: "connections" },
  { section: "shortcuts", icon: "lucide:keyboard", labelKey: "shortcuts" },
];

export function workspacePath(workspaceId: string, section: string): string {
  return section ? `/${workspaceId}/${section}` : `/${workspaceId}`;
}

/** A section of the workspace settings. Empty section = general. */
export function workspaceSettingsPath(
  workspaceId: string,
  section: string,
): string {
  const base = workspacePath(workspaceId, "settings");
  return section ? `${base}/${section}` : base;
}

/** A section of your own account settings. Empty section = general. */
export function accountPath(workspaceId: string, section: string): string {
  const base = workspacePath(workspaceId, "account");
  return section ? `${base}/${section}` : base;
}

/**
 * The plugins' settings of a workspace: `/<workspaceId>/plugin/settings` is the overview of the
 * plugins that are on there, and `/<workspaceId>/plugin/settings/<pluginId>` one plugin's own
 * settings page. Empty plugin id = the overview. (A plugin id is lowercase letters, digits and
 * dashes, so it needs no escaping, and none is a section: the area has no other pages.)
 */
export function pluginSettingsPath(
  workspaceId: string,
  pluginId?: string,
): string {
  const base = workspacePath(workspaceId, "plugin/settings");
  return pluginId ? `${base}/${pluginId}` : base;
}

/**
 * The four areas settings are split into: what applies to everyone in the
 * workspace, what applies to a project, what only concerns you yourself,
 * and the settings of the plugins the workspace switched on.
 */
export type SettingsScopeKey = "workspace" | "project" | "account" | "plugin";

export interface SettingsScopeEntry {
  key: SettingsScopeKey;
  label: string;
  icon: string;
  /**
   * Where the area leads. If the address is missing — no project in
   * context — the entry drops out of `visibleSettingsScope()` entirely,
   * instead of showing it dead.
   */
  href?: string;
}

/** Like `SettingsScopeEntry`, only after filtering: the address is set. */
export type VisibleSettingsScopeEntry = SettingsScopeEntry & { href: string };

/**
 * The targets of the scope switcher — each the general page of its area.
 *
 * Deliberately here and not in the three layouts: the addresses are the
 * same no matter which area you switch from, and three copies of this
 * would be three places where a route can go stale. Labels come in from
 * outside so this file can do without i18n.
 */
export function settingsScopeItems({
  workspaceId,
  projectSlug,
  labels,
}: {
  workspaceId: string;
  /** The project the middle area opens. Without one it stays inert. */
  projectSlug?: string;
  labels: Record<SettingsScopeKey, string>;
}): SettingsScopeEntry[] {
  // Inside out: first what only concerns yourself, then the project, and
  // then the whole workspace. That's also the order in which they're
  // needed — everyone fiddles with their own settings, few with the
  // workspace's. The plugins' settings come last: they are the workspace's,
  // one level of detail further in.
  //
  // The icons are the same ones the sidebar already uses for these things
  // (`GLOBAL_NAV`, `ACCOUNT_NAV`) — an area shouldn't depend on which door
  // you enter it through.
  return [
    {
      key: "account",
      label: labels.account,
      icon: "lucide:circle-user",
      href: accountPath(workspaceId, ""),
    },
    {
      key: "project",
      label: labels.project,
      icon: "lucide:folders",
      href: projectSlug
        ? projectSettingsPath(workspaceId, projectSlug, "")
        : undefined,
    },
    {
      key: "workspace",
      label: labels.workspace,
      icon: "lucide:building-2",
      href: workspaceSettingsPath(workspaceId, ""),
    },
    {
      key: "plugin",
      label: labels.plugin,
      // The icon of the "Plugins" section of the workspace settings: it is the same thing.
      icon: "lucide:puzzle",
      href: pluginSettingsPath(workspaceId),
    },
  ];
}

/**
 * Narrows the candidates from `settingsScopeItems()` down to what's really
 * up for choosing: "Personal" always, "Project"/"Workspace"/"Plugins" only with an
 * address AND a permission (`WORKSPACE_SETTINGS_PERMISSIONS`/
 * `PROJECT_SETTINGS_PERMISSIONS`, and `plugin.enable` in the workspace for the
 * plugins, each resolved by the layout — this function itself knows no
 * permissions).
 *
 * If only "Personal" is left in the end, the switcher has nothing left to
 * switch between — the layouts then leave `SettingsHeader` out entirely.
 */
export function visibleSettingsScope(
  items: SettingsScopeEntry[],
  allowed: { workspace: boolean; project: boolean; plugin: boolean },
): VisibleSettingsScopeEntry[] {
  return items.filter((item): item is VisibleSettingsScopeEntry => {
    if (!item.href) return false;
    if (item.key === "account") return true;
    return allowed[item.key];
  });
}

export function adminPath(section: string): string {
  return section ? `/admin/${section}` : "/admin";
}

export function projectPath(
  workspaceId: string,
  slug: string,
  section: string,
): string {
  const base = `/${workspaceId}/project/${slug}`;
  return section ? `${base}/${section}` : base;
}

/** An issue's full page — `/<workspaceId>/issue/<ref>`, lowercased like
 *  everywhere else a short code sits in the address. */
export function issuePath(workspaceId: string, ref: string): string {
  return `/${workspaceId}/issue/${ref.toLowerCase()}`;
}

/** A section of the project settings. Empty section = general. */
export function projectSettingsPath(
  workspaceId: string,
  slug: string,
  section: string,
): string {
  const base = projectPath(workspaceId, slug, "settings");
  return section ? `${base}/${section}` : base;
}

/**
 * Is `pathname` the entry `pattern` refers to?
 *
 * Normally exact — an entry is active when you're standing on it. If the
 * pattern ends in `/*`, everything beneath it counts too: "Settings" stays
 * marked while you browse its sections, and the sidebar doesn't collapse
 * the branch out from under you.
 *
 * Lives here instead of in the sidebar, because `NavLink` (marking) and
 * `TabList` (expanding) need the same answer — two interpretations of the
 * same pattern would be exactly the kind of bug you only notice late.
 */
export function isNavActive(
  pathname: string,
  href: string,
  activeHref?: string,
): boolean {
  const pattern = activeHref ?? href;
  if (!pattern.endsWith("/*")) return pathname === pattern;

  const base = pattern.slice(0, -2);
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function findBySection(
  entries: NavEntry[],
  section: string,
): NavEntry | undefined {
  return entries.find((e) => e.section === section);
}
