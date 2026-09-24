/**
 * What a plugin action gives back. `warning` is set when the change was made but
 * something the plugin did on the way failed, such as an `onDisable` that threw:
 * the admin should know, but it is not a reason to undo what was asked for.
 */
export type PluginActionResult =
  | { ok: true; warning?: string }
  | { error: string };
