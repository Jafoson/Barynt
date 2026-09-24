import type { StoreCatalogView } from "@/features/plugins/storeQueries";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";

export function entry(
  id: string,
  more: Partial<CatalogEntry> = {},
): CatalogEntry {
  return {
    key: `store-1/${id}`,
    storeId: "store-1",
    storeName: "Official",
    official: true,
    id,
    name: id,
    description: `The ${id} plugin`,
    author: "Someone",
    license: "MIT",
    homepage: null,
    repository: null,
    categories: ["other"],
    keywords: [],
    capabilities: [],
    scope: "WORKSPACE",
    hasCode: false,
    barynt: "^0.1.0",
    compatible: true,
    offered: "1.0.0",
    versions: [
      {
        version: "1.0.0",
        released: "2026-01-01",
        changelog: null,
        revoked: false,
        revokedReason: null,
      },
    ],
    installed: null,
    ...more,
  };
}

export function view(
  more: Partial<StoreCatalogView> & {
    entries?: CatalogEntry[];
    stores?: StoreCatalogView["catalog"]["stores"];
  } = {},
): StoreCatalogView {
  return {
    catalog: {
      entries: more.entries ?? [],
      stores: more.stores ?? [
        {
          id: "store-1",
          name: "Official",
          official: true,
          error: null,
          errorCode: null,
          syncedAt: null,
          syncError: null,
          problems: [],
        },
      ],
    },
    visibility: more.visibility ?? {
      inWorkspaces: true,
      inProjects: true,
      curatedOnly: false,
    },
    released: more.released ?? [],
    problem: more.problem ?? null,
  };
}
