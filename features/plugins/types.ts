/** What every plugin action answers: it worked, or why it did not. */
export type PluginActionResult = { ok: true } | { error: string };
