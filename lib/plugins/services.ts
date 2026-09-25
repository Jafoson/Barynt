import "server-only";
import type {
  PluginInfo,
  PluginSettingValues,
  PluginUser,
  PluginWorkspace,
  SettingsService,
} from "@barynt/plugin-sdk";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { can, canEnterWorkspace } from "@/lib/permissions";
import type { BootServices } from "./loader";
import type { PluginManifest } from "./manifest";
import { getRegistryState } from "./registryState";
import { rowScopeOf } from "./scope";
import { resolveSettings, settingsOf, toFields } from "./settings";

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
  // While plugins load, and so while one boots, nobody is asked. A plugin approved
  // after the server started boots inside the request that built the registry, and
  // must not see that request's user.
  if (getRegistryState().loading > 0) return null;
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

/**
 * A plugin's settings, read the way the host offers them. What the plugin is (its level) and
 * what its settings are come from the manifest that was loaded; whether it is on, and what is
 * set, come from the database, asked again each time so a switch or a change is seen at once.
 * Every answer is the values as the host resolves them (`resolveSettings`: what is stored while it
 * still fits the definition, else the default, else `null`), so a plugin never sees a stored value
 * the definition would refuse.
 *
 * `null` is the one answer for "nothing to read here": the platform switched the plugin off, it is
 * off in this workspace or project, the signed-in user may not see them, or the plugin is of
 * another level. A plugin that applies to the whole platform needs no request: what the platform
 * set is the plugin's own configuration, not a user's data.
 */
function createSettingsService(
  plugin: PluginInfo,
  manifest: Pick<PluginManifest, "scope" | "contributes">,
): SettingsService {
  const scope = rowScopeOf(manifest.scope);
  // Only the values and the checks are used, not the words, so any language will do.
  const fields = toFields(settingsOf(manifest), "en");
  const read = (stored: unknown): PluginSettingValues =>
    Object.freeze({ ...resolveSettings(fields, stored) });

  /** The plugin's own row, when the platform has it switched on and it is still of this level. */
  async function platformRow(): Promise<{ config: unknown } | null> {
    const row = await db.plugin.findUnique({
      where: { id: plugin.id },
      select: { status: true, scope: true, config: true },
    });
    if (!row || row.status !== "ENABLED" || row.scope !== scope) return null;
    return { config: row.config };
  }

  return Object.freeze({
    async current(): Promise<PluginSettingValues | null> {
      if (scope !== "PLATFORM" && scope !== "WORKSPACE") return null;
      const row = await platformRow();
      if (!row) return null;
      if (scope === "PLATFORM") return read(row.config);

      // Not "which workspace is in the URL" but the one the signed-in user may enter.
      const workspace = await currentWorkspace();
      if (!workspace) return null;
      const here = await db.pluginWorkspace.findUnique({
        where: {
          pluginId_workspaceId: {
            pluginId: plugin.id,
            workspaceId: workspace.id,
          },
        },
        select: { enabled: true, config: true },
      });
      return here?.enabled ? read(here.config) : null;
    },

    async ofProject(projectId: string): Promise<PluginSettingValues | null> {
      if (scope !== "PROJECT") return null;
      if (typeof projectId !== "string" || projectId === "") return null;
      const who = await sessionUser();
      if (!who) return null;
      // A project's settings are for someone who may see the project, as its page is.
      if (!(await can(who.user.id, "project.view", { projectId }))) return null;
      if (!(await platformRow())) return null;
      const here = await db.pluginProject.findUnique({
        where: {
          pluginId_projectId: { pluginId: plugin.id, projectId },
        },
        select: { enabled: true, config: true },
      });
      return here?.enabled ? read(here.config) : null;
    },
  });
}

const EMPTY = Object.freeze({});

/**
 * The services for one plugin, with the manifest that was loaded (its level and its settings).
 * `storage` and `events` have no members until their
 * tickets are built (BARY-85, BARY-84). `jobs.enqueue` says so plainly instead of
 * pretending to queue: a job that is never run must not look queued.
 */
export function createHostServices(
  plugin: PluginInfo,
  manifest: Pick<PluginManifest, "scope" | "contributes">,
): BootServices {
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
    settings: createSettingsService(plugin, manifest),
  });
}
