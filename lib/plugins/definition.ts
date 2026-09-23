import type { PluginDefinition } from "@barynt/plugin-sdk";

// What a plugin's server module has to look like once it is imported. The
// module is plugin code the host does not control, so this reads it defensively:
// like the manifest validator it reports every problem and never throws, even
// for a module made of getters or a proxy that throws on access.

/** The hooks a definition may have. Anything else is most likely a typo. */
const HOOKS = ["register", "boot"] as const;

export type PluginModuleResult =
  | { ok: true; definition: PluginDefinition }
  | { ok: false; issues: string[] };

/**
 * Takes what `import(pluginServerFile)` returned and finds the plugin in it:
 * the default export, made with `definePlugin`. A module that exports its
 * functions by name, or a bare function as the default, is refused with a
 * message that says what to write instead.
 */
export function parsePluginModule(mod: unknown): PluginModuleResult {
  try {
    if (typeof mod !== "object" || mod === null) {
      return fail("the module did not load as an ES module");
    }
    const definition: unknown = (mod as { default?: unknown }).default;
    if (definition === undefined) {
      return fail(
        "no default export: write `export default definePlugin({ register, boot })`",
      );
    }
    if (typeof definition === "function") {
      return fail(
        "the default export is a function: wrap it as `definePlugin({ register })`",
      );
    }
    if (typeof definition !== "object" || definition === null) {
      return fail(
        "the default export must be the object `definePlugin` returns",
      );
    }

    const issues: string[] = [];
    const known: readonly string[] = HOOKS;
    for (const key of Object.keys(definition)) {
      if (!known.includes(key)) {
        issues.push(`${key}: is not a known hook (use ${HOOKS.join(" or ")})`);
      }
    }
    for (const hook of HOOKS) {
      const value: unknown = (definition as Record<string, unknown>)[hook];
      if (value !== undefined && typeof value !== "function") {
        issues.push(`${hook}: must be a function`);
      }
    }
    const defined = HOOKS.filter(
      (hook) => (definition as Record<string, unknown>)[hook] !== undefined,
    );
    if (defined.length === 0 && issues.length === 0) {
      issues.push(`the plugin defines neither ${HOOKS.join(" nor ")}`);
    }
    return issues.length > 0
      ? { ok: false, issues }
      : { ok: true, definition: definition as PluginDefinition };
  } catch {
    return fail("the module could not be read");
  }
}

function fail(issue: string): PluginModuleResult {
  return { ok: false, issues: [issue] };
}
