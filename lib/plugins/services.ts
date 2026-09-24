import "server-only";
import type {
  PluginInfo,
  PluginUser,
  PluginWorkspace,
} from "@barynt/plugin-sdk";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { canEnterWorkspace } from "@/lib/permissions";
import type { BootServices } from "./loader";

// The host's services for a plugin's `boot` (docs/plugins/sdk.md). `boot` runs
// once per process, outside any request, so `user` and `workspace` are not "the
// current user" but services that answer when asked: from inside a request they
// say who is asking and where, outside one they say `null`. Nothing here ever
// answers with anything but what the signed-in user of the request may see.
//
// Plugin code in the process could read the session or the database by other
// means, because it runs with the app's privileges (docs/plugins/security.md). What
// these services give it is the sanctioned way, and they hold to the same rule the
// app does.

/** The signed-in user of the current request, or `null` outside one or when nobody is signed in. */
async function sessionUser(): Promise<{ user: PluginUser } | null> {
  try {
    const session = await auth();
    const id = session?.user?.id;
    if (!id) return null;
    const name =
      `${session.user.firstName ?? ""} ${session.user.lastName ?? ""}`.trim() ||
      session.user.name ||
      "";
    return { user: { id, name } };
  } catch {
    // Outside a request there is no cookie to read.
    return null;
  }
}

// Where `setCurrentWorkspaceId` (lib/current-workspace.ts) publishes the reader of
// the request's workspace. The same symbol, written out here on purpose: importing
// that module would give these services a copy of their own, which is exactly the
// one that is never seeded.
const CURRENT_WORKSPACE_READER = Symbol.for("barynt.currentWorkspaceReader");

/** The workspace id of the current request, or `null` outside one or outside a workspace. */
function requestWorkspaceId(): string | null {
  try {
    const read = (globalThis as unknown as Record<symbol, unknown>)[
      CURRENT_WORKSPACE_READER
    ];
    if (typeof read !== "function") return null;
    const id: unknown = read();
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

async function currentWorkspace(): Promise<PluginWorkspace | null> {
  const id = requestWorkspaceId();
  if (!id) return null;
  const who = await sessionUser();
  // Not "which workspace is in the URL" but the one the signed-in user may enter,
  // as the workspace layout asks it, so a plugin cannot learn a workspace's name
  // for someone who is not in it.
  if (!who || !(await canEnterWorkspace(who.user.id, id))) return null;
  const workspace = await db.workspace.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  return workspace ? { id: workspace.id, name: workspace.name } : null;
}

const EMPTY = Object.freeze({});

/**
 * The services for one plugin. `storage` and `events` have no members until their
 * tickets are built (BARY-85, BARY-84). `jobs.enqueue` says so plainly instead of
 * pretending to queue: a job that is never run must not look queued.
 */
export function createHostServices(plugin: PluginInfo): BootServices {
  return Object.freeze({
    storage: EMPTY,
    events: EMPTY,
    jobs: Object.freeze({
      enqueue: async (): Promise<void> => {
        throw new Error(
          `Background jobs are not available yet, ${plugin.id} cannot queue one (BARY-90)`,
        );
      },
    }),
    user: Object.freeze({
      current: async (): Promise<PluginUser | null> =>
        (await sessionUser())?.user ?? null,
    }),
    workspace: Object.freeze({ current: currentWorkspace }),
  });
}
