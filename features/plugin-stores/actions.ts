"use server";

import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { PLATFORM, requirePermission } from "@/lib/permissions";
import { invalidatePluginRegistry } from "@/lib/plugins/registryState";
import { sealStoreToken } from "@/lib/plugins/storeCredentials";
import { normalizeStoreUrl } from "@/lib/plugins/storeUrl";
import { SecretsKeyError } from "@/lib/secrets";
import {
  MAX_PLUGIN_STORES,
  MAX_STORE_NAME_LENGTH,
  MAX_STORE_URL_LENGTH,
} from "./constants";
import { parseStoreCredential } from "./credential";

// Which plugin stores are on. Only `plugin.manage` may change it, because it
// decides which code the platform can be asked to approve, and every change is
// audited. Connecting a store, or switching one on, needs the caller to say they
// trust it: the dialog asks, and the server refuses without the answer, so the
// warning cannot be skipped by calling the action directly. Nothing here runs or
// approves any plugin: each plugin with code still needs its own approval
// (BARY-122).
//
// A private repository needs an access token. It is sealed before it is stored
// (`lib/secrets.ts`, bound to the store's address), and no result, error text or
// audit entry from this file ever contains it. Only the fact that one was set or
// removed is recorded.
//
// Which stores are on decides which plugins may run, and the registry keeps its
// answer (`lib/plugins/registry.ts`). So whatever changes that answer, connecting a
// store, switching one on or off, removing one, says so, and the next request builds
// the registry again. Code a plugin already started keeps running until the process
// restarts; what changes at once is that the host stops handing the plugin out.

export type PluginStoreResult = { ok: true } | { error: string };

const NOT_TRUSTED =
  "Confirm that you trust the authors of this store: plugins from it can be approved to run with the full power of the app.";

function isUniqueViolation(error: unknown): boolean {
  return (error as { code?: unknown } | null)?.code === "P2002";
}

/**
 * Seals a token for a store. Without a key to seal with there is an error text
 * and nothing is stored; a token is never kept in a form that is not sealed.
 */
function seal(
  storeKey: string,
  token: string,
): { sealed: string } | { error: string } {
  try {
    return { sealed: sealStoreToken(storeKey, token) };
  } catch (error) {
    if (error instanceof SecretsKeyError) return { error: error.message };
    throw error;
  }
}

/** Connects another store. Off by default is not an option: a store that is connected is on. */
export async function addPluginStore(input: {
  url: string;
  name: string;
  /** The answer to "do you trust this store?" from the dialog. */
  trusted: boolean;
  /** For a private repository: the access token, and the user name if the host wants one. */
  token?: string;
  username?: string;
}): Promise<PluginStoreResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);

  if (input?.trusted !== true) return { error: NOT_TRUSTED };

  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > MAX_STORE_NAME_LENGTH) {
    return {
      error: `Give the store a name of 1 to ${MAX_STORE_NAME_LENGTH} characters.`,
    };
  }

  const url = typeof input.url === "string" ? input.url.trim() : "";
  const key =
    url.length <= MAX_STORE_URL_LENGTH ? normalizeStoreUrl(url) : null;
  if (!key) {
    return {
      error:
        "Enter the https:// address of the Git repository, without credentials, a port, a query or a fragment.",
    };
  }

  // Access to a private repository is optional. A user name without a token is
  // not access, so it is refused instead of silently dropped.
  const hasCredential = [input.token, input.username].some(
    (value) => typeof value === "string" && value.trim() !== "",
  );
  let credential: { username: string | null; token: string } | null = null;
  if (hasCredential) {
    const parsed = parseStoreCredential(input);
    if ("error" in parsed) return { error: parsed.error };
    credential = parsed;
  }

  if ((await db.pluginStore.count()) >= MAX_PLUGIN_STORES) {
    return { error: `At most ${MAX_PLUGIN_STORES} stores can be connected.` };
  }
  if (await db.pluginStore.findUnique({ where: { key } })) {
    return { error: "This store is already connected." };
  }

  let sealed: string | null = null;
  if (credential) {
    const result = seal(key, credential.token);
    if ("error" in result) return { error: result.error };
    sealed = result.sealed;
  }

  let created: { id: string };
  try {
    created = await db.pluginStore.create({
      data: {
        url,
        key,
        name,
        official: false,
        enabled: true,
        credential: sealed,
        credentialUser: credential?.username ?? null,
      },
      select: { id: true },
    });
  } catch (error) {
    // Two admins adding the same address at the same moment.
    if (isUniqueViolation(error)) {
      return { error: "This store is already connected." };
    }
    throw error;
  }

  await recordAudit({
    action: "plugin.store.added",
    actorId,
    target: { type: "pluginStore", id: created.id, label: `${name} (${key})` },
  });
  if (sealed) {
    await recordAudit({
      action: "plugin.store.credentialSet",
      actorId,
      target: {
        type: "pluginStore",
        id: created.id,
        label: `${name} (${key})`,
      },
    });
  }

  invalidatePluginRegistry();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Switches a store on or off. Switching the official store off is allowed, that
 * is how an admin uses only their own. Switching any other store *on* needs the
 * same confirmation as connecting it.
 */
export async function setPluginStoreEnabled(
  id: string,
  enabled: boolean,
  trusted = false,
): Promise<PluginStoreResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);

  const store = await db.pluginStore.findUnique({
    where: { id },
    select: { id: true, name: true, key: true, official: true, enabled: true },
  });
  if (!store) return { error: "Unknown store." };
  if (store.enabled === enabled) return { ok: true };

  if (enabled && !store.official && trusted !== true) {
    return { error: NOT_TRUSTED };
  }

  await db.pluginStore.update({ where: { id }, data: { enabled } });

  await recordAudit({
    action: enabled ? "plugin.store.enabled" : "plugin.store.disabled",
    actorId,
    target: {
      type: "pluginStore",
      id: store.id,
      label: `${store.name} (${store.key})`,
    },
  });

  invalidatePluginRegistry();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Removes a store. The official one cannot be removed, only switched off, so it
 * is always there to switch back on. Plugins installed from a removed store stay
 * installed, but their code is no longer allowed to run.
 */
export async function removePluginStore(
  id: string,
): Promise<PluginStoreResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);

  const store = await db.pluginStore.findUnique({
    where: { id },
    select: { id: true, name: true, key: true, official: true },
  });
  if (!store) return { error: "Unknown store." };
  if (store.official) {
    return {
      error: "The official store cannot be removed. Switch it off instead.",
    };
  }

  await db.pluginStore.delete({ where: { id } });

  await recordAudit({
    action: "plugin.store.removed",
    actorId,
    target: {
      type: "pluginStore",
      id: store.id,
      label: `${store.name} (${store.key})`,
    },
  });

  invalidatePluginRegistry();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Sets or replaces the access to a private repository. The token is sealed for
 * this store's address and is never shown again; to change it, enter a new one.
 * It is only sent to that address (BARY-105).
 */
export async function setPluginStoreCredential(
  id: string,
  input: { token: string; username?: string },
): Promise<PluginStoreResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);

  const parsed = parseStoreCredential(input);
  if ("error" in parsed) return { error: parsed.error };

  const store = await db.pluginStore.findUnique({
    where: { id },
    select: { id: true, name: true, key: true },
  });
  if (!store) return { error: "Unknown store." };

  const result = seal(store.key, parsed.token);
  if ("error" in result) return { error: result.error };

  await db.pluginStore.update({
    where: { id },
    data: { credential: result.sealed, credentialUser: parsed.username },
  });

  await recordAudit({
    action: "plugin.store.credentialSet",
    actorId,
    target: {
      type: "pluginStore",
      id: store.id,
      label: `${store.name} (${store.key})`,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}

/** Removes the access to a private repository. The store stays; it is then reached without a token. */
export async function clearPluginStoreCredential(
  id: string,
): Promise<PluginStoreResult> {
  const actorId = await requirePermission("plugin.manage", PLATFORM);

  const store = await db.pluginStore.findUnique({
    where: { id },
    select: { id: true, name: true, key: true, credential: true },
  });
  if (!store) return { error: "Unknown store." };
  if (store.credential === null) return { ok: true };

  await db.pluginStore.update({
    where: { id },
    data: { credential: null, credentialUser: null },
  });

  await recordAudit({
    action: "plugin.store.credentialCleared",
    actorId,
    target: {
      type: "pluginStore",
      id: store.id,
      label: `${store.name} (${store.key})`,
    },
  });

  revalidatePath("/", "layout");
  return { ok: true };
}
