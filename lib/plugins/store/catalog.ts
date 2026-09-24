import { gt } from "semver";
import { authorName, resolveText } from "../localized";
import { satisfiesHost } from "../resolve";
import { normalizeStoreUrl } from "../storeUrl";
import type { StoreProblem, StoreSnapshot, StoreVersion } from "./reader";

// What the store page lists: the entries of every store that is on, each with what
// the page needs to decide (is there a version to install, does it fit this Barynt,
// is it installed and could it be updated). Pure: plain values in and out, so the page
// and tests read the same rules, and everything can be handed to a client component.
//
// One entry per store and plugin. The same plugin id can be in two stores; they are two
// entries with their store on them, because an installed plugin is updated only from the
// store it came from (BARY-96), and one store's "notes" is not another's.

export interface CatalogStoreInput {
  /** `PluginStore.id`. */
  id: string;
  /** The address normalised (`host/path`): what `Plugin.origin` is compared with. */
  key: string;
  name: string;
  official: boolean;
  snapshot: StoreSnapshot;
  /** When the clone was last updated, or `null` if it never was. */
  syncedAt: Date | null;
  /** Why the last attempt to update it failed, or `null` if it did not. */
  syncError: string | null;
}

export interface InstalledInput {
  id: string;
  version: string;
  origin: string | null;
}

export interface CatalogVersion {
  version: string;
  released: string | null;
  changelog: string | null;
  revoked: boolean;
  revokedReason: string | null;
}

export interface CatalogEntry {
  /** Unique on the page: the store and the plugin. */
  key: string;
  storeId: string;
  storeName: string;
  official: boolean;
  id: string;
  name: string;
  description: string;
  author: string;
  license: string;
  homepage: string | null;
  repository: string | null;
  categories: string[];
  keywords: string[];
  /** What it asks to be allowed. A promise, not a fence (docs/plugins/security.md). */
  capabilities: string[];
  scope: "WORKSPACE" | "PLATFORM";
  hasCode: boolean;
  /** The Barynt versions it works with, as the manifest says. */
  barynt: string;
  /** This Barynt is one of them. */
  compatible: boolean;
  /** The version to install: the one the store describes, unless it was withdrawn. Otherwise `null`. */
  offered: string | null;
  /** All of them, highest first. */
  versions: CatalogVersion[];
  /** Installed, and if so whether from this store and what it could be updated to. */
  installed: {
    version: string;
    fromThisStore: boolean;
    update: string | null;
  } | null;
}

export interface CatalogStoreState {
  id: string;
  name: string;
  official: boolean;
  /** `null` if it could be read, otherwise why not. */
  error: string | null;
  /** `not-fetched` when there is no clone yet, which is not a fault of the store. */
  errorCode: "not-fetched" | "unreadable" | null;
  /** When the clone was last updated, or `null` if it never was. */
  syncedAt: Date | null;
  /** Why the last attempt to update it failed: the state shown is the one from `syncedAt`. */
  syncError: string | null;
  problems: StoreProblem[];
}

export interface Catalog {
  entries: CatalogEntry[];
  stores: CatalogStoreState[];
}

export interface CatalogInput {
  /** The stores to list, already narrowed to the ones that are on. */
  stores: readonly CatalogStoreInput[];
  installed: readonly InstalledInput[];
  hostVersion: string;
  locale: string;
}

const publicVersion = (v: StoreVersion): CatalogVersion => ({
  version: v.version,
  released: v.released,
  changelog: v.changelog,
  revoked: v.revoked,
  revokedReason: v.revokedReason,
});

export function buildCatalog(input: CatalogInput): Catalog {
  const installedById = new Map(input.installed.map((p) => [p.id, p]));
  const entries: CatalogEntry[] = [];
  const stores: CatalogStoreState[] = [];

  for (const store of input.stores) {
    const { snapshot } = store;
    stores.push({
      id: store.id,
      name: store.name,
      official: store.official,
      error: snapshot.ok ? null : snapshot.error,
      errorCode: snapshot.ok ? null : snapshot.code,
      syncedAt: store.syncedAt,
      syncError: store.syncError,
      problems: snapshot.ok ? snapshot.problems : [],
    });
    if (!snapshot.ok) continue;

    for (const entry of snapshot.entries) {
      const m = entry.manifest;
      // The store describes one version: the manifest's (its CI keeps that the newest listed).
      // That is the only one that can be installed, because it is the only one whose manifest
      // the installer can compare with what the store lists (`stageRelease.ts`); an older one
      // is shown in the details, and one that is withdrawn is offered as nothing.
      const described = entry.versions.find((v) => v.version === m.version);
      const offered = described && !described.revoked ? described : null;
      const installed = installedById.get(entry.id) ?? null;
      // `normalizeStoreUrl` gives `null` for no address and for one that is no store
      // address, which is never a store's key.
      const fromThisStore =
        installed !== null && normalizeStoreUrl(installed.origin) === store.key;
      entries.push({
        key: `${store.id}/${entry.id}`,
        storeId: store.id,
        storeName: store.name,
        official: store.official,
        id: entry.id,
        name: resolveText(m.name, input.locale),
        description: resolveText(m.description, input.locale),
        author: authorName(m.author),
        license: m.license,
        homepage: m.homepage ?? null,
        repository: entry.repository ?? m.repository ?? null,
        categories: [...m.categories],
        keywords: [...m.keywords],
        capabilities: [...m.capabilities],
        scope: m.scope === "platform" ? "PLATFORM" : "WORKSPACE",
        hasCode: Boolean(m.server || m.client),
        barynt: m.barynt,
        compatible: satisfiesHost(m.barynt, input.hostVersion),
        offered: offered?.version ?? null,
        versions: entry.versions.map(publicVersion),
        installed: installed
          ? {
              version: installed.version,
              fromThisStore,
              update:
                fromThisStore &&
                offered &&
                gt(offered.version, installed.version)
                  ? offered.version
                  : null,
            }
          : null,
      });
    }
  }

  entries.sort(
    (a, b) => a.name.localeCompare(b.name) || a.key.localeCompare(b.key),
  );
  return { entries, stores };
}
