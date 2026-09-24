// Runs once when the server starts, before it takes requests. Plugins are started
// here, not on the first request that needs them: `boot` is promised to run once
// per process and outside any request (docs/plugins/sdk.md), and started from a
// request it would see that request's session.

export async function register() {
  // Only the Node.js server loads plugins. Nothing has to be set for it: the plugin
  // directory has a default, and with no plugins installed this reads two empty
  // tables and does nothing else.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  try {
    const { startPluginRegistry } = await import("@/lib/plugins/host");
    // Not awaited: `register` has to finish before the server takes requests, and
    // plugins must never keep the app from starting. A request that needs them
    // waits for the build that is running.
    void startPluginRegistry();
  } catch (error) {
    console.error(
      "[plugins] The plugins could not be started:",
      error instanceof Error ? error.message : String(error),
    );
  }
}
