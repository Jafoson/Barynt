import "server-only";
import { rm, rmdir } from "node:fs/promises";
import { dirname } from "node:path";
import { revalidatePath } from "next/cache";
import { recordAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { discoverPlugins, pluginsDirSetting } from "@/lib/plugins/discovery";
import { invalidatePluginRegistry } from "@/lib/plugins/registryState";
import { previewInstall } from "@/lib/plugins/resolve";
import { storeCloneDir } from "@/lib/plugins/store/paths";
import { readStoreDirectory } from "@/lib/plugins/store/reader";
import { placeRelease, verifyRelease } from "@/lib/plugins/store/stageRelease";
import { BARYNT_VERSION } from "@/lib/version";
import { installedCandidates, refuseChange, toCandidate } from "./disk";
import { isUniqueViolation } from "./guards";
import type { PluginActionResult } from "./types";

// Installing a plugin from a store: what `installStorePlugin` (storeActions.ts) does once it
// knows who asks and what. The entry is read from the store's local clone, the release is
// downloaded and checked against the hash the store pinned and the manifest it lists
// (`lib/plugins/store/stageRelease.ts`, nothing is written until all of that holds), put in the
// plugin directory in one rename, and recorded as a plugin from that store.
//
// **The client never says where the plugin came from**: the store is looked up here by its id,
// the entry is read from its clone, and `source` and `origin` are set here. Installing approves
// no code: a plugin with code runs only after the platform approves its exact files
// (`features/plugins/actions.ts`), and nothing is switched on anywhere.

const refuse = (error: string): PluginActionResult => ({ error });

/**
 * Installs `pluginId` in `version` from the store `storeId`. Every check that needs no
 * download comes first, so a request that cannot succeed asks nobody for anything.
 */
export async function installFromStore(input: {
  actorId: string;
  storeId: string;
  pluginId: string;
  version: string;
}): Promise<PluginActionResult> {
  const { actorId, storeId, pluginId, version } = input;

  const setting = pluginsDirSetting();
  if (setting.dir === null) {
    return refuse(
      setting.problem ?? "Plugins are off: there is no plugin directory.",
    );
  }

  const store = await db.pluginStore.findUnique({
    where: { id: storeId },
    select: { key: true, url: true, name: true, enabled: true },
  });
  if (!store) return refuse("There is no such store.");
  if (!store.enabled) return refuse("The store is switched off.");

  const existing = await db.plugin.findUnique({
    where: { id: pluginId },
    select: { version: true, source: true },
  });
  if (existing) {
    return refuse(
      existing.source === "STORE"
        ? `${pluginId} is installed already (${existing.version}). Updating from a store is not available yet.`
        : `${pluginId} is installed already (${existing.version}), so it is not installed again.`,
    );
  }

  // The entry as the store lists it now, from its clone, which is data and never trusted.
  const snapshot = await readStoreDirectory(
    storeCloneDir(setting.dir, store.key),
  );
  if (!snapshot.ok) {
    return refuse(`${store.name} cannot be read: ${snapshot.error}`);
  }
  const entry = snapshot.entries.find((e) => e.id === pluginId);
  if (!entry) return refuse(`${store.name} does not list ${pluginId}.`);
  const listed = entry.versions.find((v) => v.version === version);
  if (!listed) {
    return refuse(`${store.name} does not list ${pluginId} ${version}.`);
  }
  if (listed.revoked) {
    return refuse(
      `${pluginId} ${version} was withdrawn by the store${listed.revokedReason ? `: ${listed.revokedReason}` : ""}, so it is not installed.`,
    );
  }
  // The store describes one version, and only that one can be compared with what it lists.
  if (entry.manifest.version !== version) {
    return refuse(
      `Only ${entry.manifest.version}, the version ${store.name} describes, can be installed.`,
    );
  }
  const scope = entry.manifest.scope === "platform" ? "PLATFORM" : "WORKSPACE";

  // What it needs and what it would break, as for any install, before anything is downloaded.
  const { plugins } = await discoverPlugins(setting.dir);
  const rows = await db.plugin.findMany({
    select: { id: true, version: true, scope: true },
  });
  const notDone = refuseChange(
    previewInstall(
      installedCandidates(rows, plugins),
      toCandidate(entry.manifest, scope),
      BARYNT_VERSION,
    ),
  );
  if (notDone) return refuse(notDone);

  const verified = await verifyRelease({
    download: listed.download,
    sha512: listed.sha512,
    expected: entry.manifest,
  });
  if (!verified.ok) return refuse(verified.error);

  const placed = await placeRelease({
    pluginsDir: setting.dir,
    id: pluginId,
    version,
    files: verified.release.files,
  });
  if (!placed.ok) return refuse(placed.error);

  try {
    await db.plugin.create({
      data: {
        id: pluginId,
        version,
        status: "ENABLED",
        source: "STORE",
        scope,
        origin: store.url,
        integrity: placed.integrity,
      },
    });
  } catch (error) {
    // Only what this call put there is taken away again.
    if (placed.created) await removePlaced(placed.dir);
    // Two admins installing the same plugin at the same moment.
    if (isUniqueViolation(error)) {
      return refuse(`${pluginId} is installed already.`);
    }
    throw error;
  }

  await recordAudit({
    action: "plugin.installed",
    actorId,
    target: { type: "plugin", id: pluginId, label: `${pluginId}@${version}` },
    meta: {
      version,
      source: "STORE",
      scope,
      hash: placed.integrity,
      store: store.key,
      archive: verified.release.archiveSha512,
    },
  });

  invalidatePluginRegistry();
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * Takes away a directory this install put in place, when the row could not be made, and the
 * plugin's own directory if that leaves it empty (`rmdir` leaves one that holds other versions).
 * Never throws.
 */
async function removePlaced(dir: string): Promise<void> {
  await rm(/* turbopackIgnore: true */ dir, {
    recursive: true,
    force: true,
  }).catch(() => {});
  await rmdir(/* turbopackIgnore: true */ dirname(dir)).catch(() => {});
}
