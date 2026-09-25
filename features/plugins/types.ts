/**
 * What a plugin action gives back. `warning` is set when the change was made but
 * something the plugin did on the way failed, such as an `onDisable` that threw:
 * the admin should know, but it is not a reason to undo what was asked for.
 */
export type PluginActionResult =
  | { ok: true; warning?: string }
  | { error: string };

/**
 * What saving a plugin's settings gives back. When the values do not fit, `issues` says which
 * setting and what is wrong, so the form can show it where it belongs.
 */
export type SettingsSaveResult =
  | { ok: true }
  | {
      error: string;
      issues?: { id: string; message: string }[];
    };
