import type { SettingsNavItem } from "@/components/ui/layout/SettingsNav/SettingsNav";
import { pluginSettingsPath } from "@/lib/nav";
import { navPlugins, type SettingsArea } from "./settingsArea";

/**
 * The rows of the plugins' settings navigation: the overview, then each plugin that has something
 * to set, the workspace's first and then the ones set per project. A workspace plugin has the
 * puzzle piece and is open on its own page; one set per project has the projects' icon and is open
 * on its page and on the pages beneath it, one for each project. `overviewLabel` comes in
 * translated, so this needs no i18n.
 */
export function settingsNavItems(
  area: SettingsArea,
  workspaceId: string,
  overviewLabel: string,
): SettingsNavItem[] {
  return [
    {
      href: pluginSettingsPath(workspaceId),
      label: overviewLabel,
      icon: "lucide:layout-list",
    },
    ...navPlugins(area).map((plugin): SettingsNavItem => {
      const href = pluginSettingsPath(workspaceId, plugin.id);
      return plugin.kind === "project"
        ? {
            href,
            label: plugin.name,
            icon: "lucide:folders",
            activeHref: `${href}/*`,
          }
        : { href, label: plugin.name, icon: "lucide:puzzle" };
    }),
  ];
}
