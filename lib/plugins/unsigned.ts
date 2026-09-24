import "server-only";
import { db } from "@/lib/db";

/**
 * Whether the platform allows plugins that come from no store (an upload, a
 * directory, a repository address entered by hand): the `allowUnsigned` the
 * policy is given (`decideExecution` in `lib/plugins/policy.ts`).
 *
 * It fails closed, like `getActiveStoreUrls`. Only a row that says `true` allows
 * them: no row (a fresh install, where the column default `false` applies) or a
 * database that cannot be read means they are not allowed, and the reason is
 * logged. Nothing here falls back to "allowed".
 */
export async function getAllowUnsignedPlugins(): Promise<boolean> {
  try {
    const row = await db.systemSettings.findUnique({
      where: { id: 1 },
      select: { allowUnsignedPlugins: true },
    });
    return row?.allowUnsignedPlugins === true;
  } catch (error) {
    console.error(
      "[plugins] The setting for unsigned plugins could not be read, so they are not allowed:",
      error instanceof Error ? error.message : String(error),
    );
    return false;
  }
}
