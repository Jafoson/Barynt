import type { Translator } from "@/i18n/types";
import {
  ACCOUNT_SETTINGS_NAV,
  ADMIN_NAV,
  findBySection,
  PROJECT_NAV,
  PROJECT_SECTIONS,
  PROJECT_SETTINGS_NAV,
  WORKSPACE_SECTIONS,
  WORKSPACE_SETTINGS_NAV,
} from "@/lib/nav";
import type { Project } from "@/types";

// The tab set is global — tabs from different areas sit together. The
// context of a URL is therefore derived from the URL itself, not passed in
// from outside: the first path segment is the area ("admin" or a workspace
// ID), the second the section ("my", "project", "members", …).
function segments(path: string): { root: string; section: string } {
  const parts = path.split("/");
  return { root: parts[1] ?? "", section: parts[2] ?? "" };
}

/**
 * Workspace ID a tab's path belongs to, or `null` for admin tabs (which carry
 * no workspace context). Lets each tab decide independently whether workspace
 * lookups (projects, …) apply to it, instead of assuming the currently active
 * workspace.
 */
export function workspaceIdFromPath(path: string): string | null {
  const { root } = segments(path);
  return root && root !== "admin" ? root : null;
}

/** Resolve the project a `/<workspace>/project/<slug>` path points at, if any. */
function projectFromPath(path: string, projects: Project[]): Project | null {
  const m = path.match(/^\/[^/]+\/project\/([^/]+)/);
  if (!m) return null;
  return projects.find((p) => p.slug === m[1]) ?? null;
}

/**
 * Sub-section of a project path — `""` for the board, `"list"`, `"members"`, …
 * Read from the path rather than matched against a list of known suffixes, so a
 * new entry in `PROJECT_SECTIONS` needs no change here.
 */
function projectSection(path: string): string {
  return path.split("/")[4] ?? "";
}

/**
 * The section within the project settings — `""` for general, `"members"`,
 * `"roles"`, `"labels"`. `null` when the path isn't in the settings at all.
 *
 * Without this distinction, all four tabs would be called "Project
 * (Settings)" and couldn't be told apart next to each other.
 */
function projectSettingsSection(path: string): string | null {
  const parts = path.split("/");
  return parts[4] === "settings" ? (parts[5] ?? "") : null;
}

/**
 * The section within the workspace settings — `""` for general,
 * `"projects"`, `"labels"`, `"teams"`, … `null` when the path isn't there at
 * all. The same distinction as for the project, one level up: without it
 * every section would be called "Settings" and couldn't be told apart next
 * to each other.
 */
function workspaceSettingsSection(path: string): string | null {
  const parts = path.split("/");
  if (parts[1] === "admin" || parts[2] !== "settings") return null;
  return parts[3] ?? "";
}

/**
 * The view within My Issues — `""` for the board, `"list"` for the list.
 * `null` when the path isn't there at all. The same two views as in a
 * project, hence the same distinction: otherwise both tabs would be called
 * "My Issues".
 */
function myIssuesSection(path: string): string | null {
  const parts = path.split("/");
  if (parts[1] === "admin" || parts[2] !== "my") return null;
  return parts[3] ?? "";
}

/**
 * The section within your own account settings — `""` for general,
 * `"appearance"`, `"security"`, … `null` when the path isn't there. The same
 * distinction as for workspace and project: without it all five tabs would
 * be called "Account".
 */
function accountSection(path: string): string | null {
  const parts = path.split("/");
  if (parts[1] === "admin" || parts[2] !== "account") return null;
  return parts[3] ?? "";
}

/**
 * The plugin within the plugins' settings — `""` for the overview, else the plugin's id.
 * `null` when the path isn't there at all: `/<workspace>/plugin/settings[/<id>]`. Without it
 * every plugin's page would be called the same and couldn't be told apart next to each other.
 */
function pluginSettingsPlugin(path: string): string | null {
  const parts = path.split("/");
  if (parts[1] === "admin" || parts[2] !== "plugin" || parts[3] !== "settings")
    return null;
  return parts[4] ?? "";
}

/**
 * A plugin's id as a name for a tab: the tab bar is not told the plugin's own name (it knows
 * paths and projects), and `github-sync` reads better as `Github Sync`.
 */
function pluginTabName(id: string): string {
  return id
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Human title for a tab path (no query string). */
export function tabTitle(
  path: string,
  projects: Project[],
  t: Translator,
): string {
  const { root, section } = segments(path);

  if (root === "admin") {
    const entry = findBySection(ADMIN_NAV, section);
    return entry ? t(`nav.${entry.labelKey}`) : "Barynt";
  }

  if (section === "project") {
    return projectFromPath(path, projects)?.name ?? t("nav.board");
  }

  // An issue's own page (`/<workspace>/issue/PREFIX-12`): its key says
  // which one it is.
  if (section === "issue") return decodeURIComponent(path.split("/")[3] ?? "");

  // The plugins' settings are not a section of the workspace's table: they have a place of
  // their own (`/<workspace>/plugin/settings`), called after what they are.
  if (pluginSettingsPlugin(path) !== null) return t("nav.plugins");

  const entry = findBySection(WORKSPACE_SECTIONS, section);
  return entry ? t(`nav.${entry.labelKey}`) : "Barynt";
}

/** Project color for a project tab path, else null. */
export function tabColor(path: string, projects: Project[]): string | null {
  return projectFromPath(path, projects)?.color ?? null;
}

/** Uploaded project avatar for a project tab path, else null. */
export function tabImage(path: string, projects: Project[]): string | null {
  return projectFromPath(path, projects)?.avatarUrl ?? null;
}

/** Iconify name for a tab path. */
export function tabIcon(path: string): string {
  const { root, section } = segments(path);

  if (root === "admin") {
    return findBySection(ADMIN_NAV, section)?.icon ?? "lucide:settings";
  }

  if (section === "project") {
    // Like the title: the settings have a second level, and that carries
    // its own icon. Without this branch, all four would get the gear.
    const settingsSection = projectSettingsSection(path);
    if (settingsSection !== null) {
      return (
        findBySection(PROJECT_SETTINGS_NAV, settingsSection)?.icon ??
        "lucide:settings"
      );
    }

    return (
      findBySection(PROJECT_SECTIONS, projectSection(path))?.icon ??
      "lucide:layout-dashboard"
    );
  }

  if (section === "issue") return "lucide:circle-dot";

  // The plugins' settings carry the icon of the plugins section of the workspace settings.
  if (pluginSettingsPlugin(path) !== null) return "lucide:puzzle";

  // My Issues has two views like a project — the list carries its icon,
  // the board stays with the area's icon.
  if (myIssuesSection(path) === "list") {
    return findBySection(PROJECT_NAV, "list")?.icon ?? "lucide:list";
  }

  // Same second level, just for your own account settings.
  const account = accountSection(path);
  if (account !== null) {
    return (
      findBySection(ACCOUNT_SETTINGS_NAV, account)?.icon ?? "lucide:circle-user"
    );
  }

  // Like the project: the settings have a second level, and that carries
  // its own icon. Without this branch, every section would get the gear.
  const workspaceSection = workspaceSettingsSection(path);
  if (workspaceSection !== null) {
    return (
      findBySection(WORKSPACE_SETTINGS_NAV, workspaceSection)?.icon ??
      "lucide:settings"
    );
  }

  return (
    findBySection(WORKSPACE_SECTIONS, section)?.icon ??
    "lucide:layout-dashboard"
  );
}

export interface TabMeta {
  title: string;
  color: string | null;
  icon: string | null;
  image: string | null;
}

/**
 * Derive everything the TabBar renders from a tab's stored href.
 *
 * The href may carry a query string (filters/sort, e.g. `?status=todo`) which
 * is stripped before deriving title/color/icon. Sub-views of a project get a
 * `Project Name (Issues)` suffix so they stay distinct from its board tab;
 * the icon is omitted when a project color dot is shown instead.
 */
export function tabMeta(
  href: string,
  projects: Project[],
  t: Translator,
): TabMeta {
  const path = href.split("?")[0];
  const color = tabColor(path, projects);
  const image = tabImage(path, projects);

  let title = tabTitle(path, projects, t);
  // The board is the main view and carries the project name unchanged —
  // every sub-page says in a suffix which one it is.
  const inProject = path.includes("/project/");
  const settingsSection = inProject ? projectSettingsSection(path) : null;

  if (settingsSection !== null) {
    // The settings have a second level. Its head is called "Settings" in
    // the tab, the sections below it carry their own name — "Members" says
    // more than "Settings" and is just as unambiguous.
    const sub = findBySection(PROJECT_SETTINGS_NAV, settingsSection);
    const label =
      sub && sub.section ? t(`nav.${sub.labelKey}`) : t("nav.settings");
    title = `${title} (${label})`;
  } else if (inProject) {
    const entry = findBySection(PROJECT_SECTIONS, projectSection(path));
    if (entry?.section) title = `${title} (${t(`nav.${entry.labelKey}`)})`;
  } else {
    // The same rule for the workspace: the head is called "Settings", the
    // sections below it carry their own name.
    const section = workspaceSettingsSection(path);
    const sub = section ? findBySection(WORKSPACE_SETTINGS_NAV, section) : null;
    if (sub) title = `${title} (${t(`nav.${sub.labelKey}`)})`;

    // And once more for your own issues: the board is the main view and
    // carries the name unchanged, the list says so in a suffix.
    if (myIssuesSection(path) === "list")
      title = `${title} (${t("nav.issues")})`;

    // The plugins' settings say which plugin: the overview is the head and stays as it is.
    const plugin = pluginSettingsPlugin(path);
    if (plugin) title = `${title} (${pluginTabName(plugin)})`;

    // And once more for your own account settings.
    const account = accountSection(path);
    const accountSub = account
      ? findBySection(ACCOUNT_SETTINGS_NAV, account)
      : null;
    if (accountSub) title = `${title} (${t(`nav.${accountSub.labelKey}`)})`;
  }

  return {
    title,
    color,
    icon: color ? null : tabIcon(path),
    image,
  };
}
