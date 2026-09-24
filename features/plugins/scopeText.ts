import type { PluginRowScope } from "@/lib/plugins/scope";

/**
 * The message key, in `pluginStore` and in `pluginsAdmin`, that says where a plugin applies.
 * One place, so the card, the details and the plugins page name a scope the same way.
 */
export function scopeMessageKey(
  scope: PluginRowScope,
): "scopePlatform" | "scopeProject" | "scopeWorkspace" {
  switch (scope) {
    case "PLATFORM":
      return "scopePlatform";
    case "PROJECT":
      return "scopeProject";
    case "WORKSPACE":
      return "scopeWorkspace";
  }
}
