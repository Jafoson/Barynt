import { definePlugin } from "@barynt/plugin-sdk";

// A plugin server module the way an author writes it. The tests import it as a
// real ES module, so `parsePluginModule` sees a genuine module namespace object
// (frozen, no prototype) and not just an object literal.
export default definePlugin({
  register(ctx) {
    ctx.registerJob("sync", {});
  },
  async boot(ctx) {
    await ctx.jobs.enqueue("sync");
  },
});

/** Other named exports are allowed and ignored: only the default counts. */
export const version = "1.0.0";
