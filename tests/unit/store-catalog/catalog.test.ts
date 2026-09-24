import { describe, expect, it } from "bun:test";
import {
  buildCatalog,
  type CatalogInput,
  type CatalogStoreInput,
} from "@/lib/plugins/store/catalog";
import type {
  StoreEntry,
  StoreSnapshot,
  StoreVersion,
} from "@/lib/plugins/store/reader";
import { validateManifest } from "@/lib/plugins/validate";

// What the store page lists. Pure logic: what matters is that every store that could be
// read is listed, one entry per store and plugin, that a store that could not be read says
// why instead of looking empty, that the version to install is the highest that is not
// revoked, that compatibility is judged against this Barynt, and that an update is offered
// only from the store the plugin came from.

const OFFICIAL = "github.com/jafoson/barynt-plugin-store";
const OTHER = "example.com/acme/plugins";
const H = "c".repeat(128);

function version(v: string, more: Partial<StoreVersion> = {}): StoreVersion {
  return {
    version: v,
    download: `https://x.com/${v}.tgz`,
    sha512: H,
    released: null,
    changelog: null,
    revoked: false,
    revokedReason: null,
    ...more,
  };
}

function entry(
  id: string,
  versions: StoreVersion[] = [version("1.0.0")],
  manifestMore: object = {},
): StoreEntry {
  const result = validateManifest({
    manifestVersion: 1,
    id,
    name: id,
    version: versions[0]?.version ?? "1.0.0",
    description: `The ${id} plugin`,
    author: "Someone",
    license: "MIT",
    categories: ["other"],
    barynt: "^0.1.0",
    ...manifestMore,
  });
  if (!result.ok) throw new Error(result.issues[0]?.message);
  return { id, manifest: result.manifest, repository: null, versions };
}

const ok = (
  entries: StoreEntry[],
  problems = [] as { id: string; issues: string[] }[],
): StoreSnapshot => ({
  ok: true,
  store: { id: "s", name: "S" },
  entries,
  problems,
});

function store(
  more: Partial<CatalogStoreInput> & { entries?: StoreEntry[] } = {},
): CatalogStoreInput {
  return {
    id: "store-1",
    key: OFFICIAL,
    name: "Official",
    official: true,
    snapshot: more.snapshot ?? ok(more.entries ?? []),
    syncedAt: null,
    syncError: null,
    ...(more.id ? { id: more.id } : {}),
    ...(more.key ? { key: more.key } : {}),
    ...(more.name ? { name: more.name } : {}),
    ...(more.official !== undefined ? { official: more.official } : {}),
    ...(more.syncedAt !== undefined ? { syncedAt: more.syncedAt } : {}),
    ...(more.syncError !== undefined ? { syncError: more.syncError } : {}),
  };
}

const input = (more: Partial<CatalogInput> = {}): CatalogInput => ({
  stores: [],
  installed: [],
  hostVersion: "0.1.0",
  locale: "en",
  ...more,
});

describe("the entries", () => {
  it("says what the manifest says, in the language, with the store it is in", () => {
    const catalog = buildCatalog(
      input({
        locale: "de",
        stores: [
          store({
            entries: [
              entry("notes", [version("1.2.0")], {
                name: { en: "Notes", de: "Notizen" },
                description: { en: "Writes", de: "Schreibt" },
                author: { name: "Mara" },
                license: "Apache-2.0",
                homepage: "https://example.com",
                repository: "https://example.com/notes.git",
                categories: ["planning", "other"],
                keywords: ["notes", "text"],
                capabilities: ["issues:read"],
                scope: "platform",
                server: "server.js",
                barynt: "^0.1.0",
              }),
            ],
          }),
        ],
      }),
    );
    expect(catalog.entries).toEqual([
      {
        key: "store-1/notes",
        storeId: "store-1",
        storeName: "Official",
        official: true,
        id: "notes",
        name: "Notizen",
        description: "Schreibt",
        author: "Mara",
        license: "Apache-2.0",
        homepage: "https://example.com",
        repository: "https://example.com/notes.git",
        categories: ["planning", "other"],
        keywords: ["notes", "text"],
        capabilities: ["issues:read"],
        scope: "PLATFORM",
        hasCode: true,
        barynt: "^0.1.0",
        compatible: true,
        offered: "1.2.0",
        versions: [
          {
            version: "1.2.0",
            released: null,
            changelog: null,
            revoked: false,
            revokedReason: null,
          },
        ],
        installed: null,
      },
    ]);
  });

  it("prefers the store's repository address over the manifest's", () => {
    const e = entry("notes", [version("1.0.0")], {
      repository: "https://example.com/m",
    });
    e.repository = "https://example.com/store";
    const catalog = buildCatalog(input({ stores: [store({ entries: [e] })] }));
    expect(catalog.entries[0]?.repository).toBe("https://example.com/store");
  });

  it("is per workspace unless the manifest says the whole platform, and has code if it has an entry point", () => {
    const catalog = buildCatalog(
      input({
        stores: [
          store({
            entries: [
              entry("a-plugin"),
              entry("b-plugin", [version("1.0.0")], { client: "client.js" }),
            ],
          }),
        ],
      }),
    );
    expect(catalog.entries.map((e) => [e.id, e.scope, e.hasCode])).toEqual([
      ["a-plugin", "WORKSPACE", false],
      ["b-plugin", "WORKSPACE", true],
    ]);
  });

  it("is listed by name, then by store and id", () => {
    const catalog = buildCatalog(
      input({
        stores: [
          store({
            id: "s2",
            key: OTHER,
            name: "Other",
            official: false,
            entries: [
              entry("same-plugin", [version("1.0.0")], { name: "Same" }),
            ],
          }),
          store({
            id: "s1",
            entries: [
              entry("zzz-plugin", [version("1.0.0")], { name: "Alpha" }),
              entry("same-plugin", [version("1.0.0")], { name: "Same" }),
            ],
          }),
        ],
      }),
    );
    expect(catalog.entries.map((e) => e.key)).toEqual([
      "s1/zzz-plugin",
      "s1/same-plugin",
      "s2/same-plugin",
    ]);
  });

  it("is one entry per store when two stores have the same plugin", () => {
    const catalog = buildCatalog(
      input({
        stores: [
          store({ id: "s1", entries: [entry("notes")] }),
          store({
            id: "s2",
            key: OTHER,
            name: "Acme",
            official: false,
            entries: [entry("notes", [version("2.0.0")])],
          }),
        ],
      }),
    );
    expect(catalog.entries.map((e) => [e.storeName, e.offered])).toEqual([
      ["Official", "1.0.0"],
      ["Acme", "2.0.0"],
    ]);
  });
});

describe("the version to install", () => {
  it("is the highest that is not revoked, as the store lists them", () => {
    const catalog = buildCatalog(
      input({
        stores: [
          store({
            entries: [
              entry("notes", [
                version("2.0.0", { revoked: true }),
                version("1.5.0"),
                version("1.0.0"),
              ]),
            ],
          }),
        ],
      }),
    );
    expect(catalog.entries[0]?.offered).toBe("1.5.0");
    expect(
      catalog.entries[0]?.versions.map((v) => [v.version, v.revoked]),
    ).toEqual([
      ["2.0.0", true],
      ["1.5.0", false],
      ["1.0.0", false],
    ]);
  });

  it("is nothing when every version is revoked, and says why they are", () => {
    const catalog = buildCatalog(
      input({
        stores: [
          store({
            entries: [
              entry("notes", [
                version("1.1.0", {
                  revoked: true,
                  revokedReason: "stole data",
                }),
                version("1.0.0", { revoked: true }),
              ]),
            ],
          }),
        ],
      }),
    );
    expect(catalog.entries[0]?.offered).toBeNull();
    expect(catalog.entries[0]?.versions[0]).toMatchObject({
      revoked: true,
      revokedReason: "stole data",
    });
  });
});

describe("whether it fits this Barynt", () => {
  it.each([
    ["^0.1.0", "0.1.0", true],
    ["^0.1.0", "0.1.7", true],
    ["^0.1.0", "0.2.0", false],
    [">=1.0.0", "0.1.0", false],
    ["^0.1.0", "0.1.0-beta.2", true],
  ])("is judged by the range %s against %s: %s", (barynt, host, compatible) => {
    const catalog = buildCatalog(
      input({
        hostVersion: host,
        stores: [
          store({ entries: [entry("notes", [version("1.0.0")], { barynt })] }),
        ],
      }),
    );
    expect(catalog.entries[0]?.compatible).toBe(compatible);
    expect(catalog.entries[0]?.barynt).toBe(barynt);
  });
});

describe("whether it is installed", () => {
  const notes = (versions: StoreVersion[]) => entry("notes", versions);

  it("is not, when nothing by that id is installed", () => {
    const catalog = buildCatalog(
      input({ stores: [store({ entries: [notes([version("1.0.0")])] })] }),
    );
    expect(catalog.entries[0]?.installed).toBeNull();
  });

  it("says the version and that it came from this store, and offers no update at the same version", () => {
    const catalog = buildCatalog(
      input({
        stores: [store({ entries: [notes([version("1.0.0")])] })],
        installed: [
          {
            id: "notes",
            version: "1.0.0",
            origin: "https://github.com/Jafoson/barynt-plugin-store",
          },
        ],
      }),
    );
    expect(catalog.entries[0]?.installed).toEqual({
      version: "1.0.0",
      fromThisStore: true,
      update: null,
    });
  });

  it("offers an update from the store it came from, to the highest version that is not revoked", () => {
    const catalog = buildCatalog(
      input({
        stores: [
          store({
            entries: [
              notes([
                version("2.0.0", { revoked: true }),
                version("1.10.0"),
                version("1.9.0"),
                version("1.0.0"),
              ]),
            ],
          }),
        ],
        installed: [
          {
            id: "notes",
            version: "1.9.0",
            origin: "https://github.com/jafoson/barynt-plugin-store.git",
          },
        ],
      }),
    );
    expect(catalog.entries[0]?.installed).toEqual({
      version: "1.9.0",
      fromThisStore: true,
      update: "1.10.0",
    });
  });

  it("offers no update when the installed version is newer than the store's", () => {
    const catalog = buildCatalog(
      input({
        stores: [store({ entries: [notes([version("1.0.0")])] })],
        installed: [
          { id: "notes", version: "1.5.0", origin: `https://${OFFICIAL}` },
        ],
      }),
    );
    expect(catalog.entries[0]?.installed?.update).toBeNull();
  });

  it("does not offer an update from another store than the one it came from", () => {
    const catalog = buildCatalog(
      input({
        stores: [
          store({ id: "s1", entries: [notes([version("1.0.0")])] }),
          store({
            id: "s2",
            key: OTHER,
            name: "Acme",
            official: false,
            entries: [notes([version("9.0.0")])],
          }),
        ],
        installed: [
          { id: "notes", version: "1.0.0", origin: `https://${OFFICIAL}` },
        ],
      }),
    );
    const by = Object.fromEntries(
      catalog.entries.map((e) => [e.storeId, e.installed]),
    );
    expect(by.s1).toEqual({
      version: "1.0.0",
      fromThisStore: true,
      update: null,
    });
    expect(by.s2).toEqual({
      version: "1.0.0",
      fromThisStore: false,
      update: null,
    });
  });

  it.each([
    ["from no store", null],
    ["from an address that is no store address", "not a url"],
    ["from an address with credentials", `https://u:p@${OFFICIAL}`],
  ])(
    "is not from this store when it was installed %s, and gets no update",
    (_n, origin) => {
      const catalog = buildCatalog(
        input({
          stores: [store({ entries: [notes([version("2.0.0")])] })],
          installed: [{ id: "notes", version: "1.0.0", origin }],
        }),
      );
      expect(catalog.entries[0]?.installed).toEqual({
        version: "1.0.0",
        fromThisStore: false,
        update: null,
      });
    },
  );

  it("offers no update when every newer version is revoked", () => {
    const catalog = buildCatalog(
      input({
        stores: [
          store({
            entries: [
              notes([version("2.0.0", { revoked: true }), version("1.0.0")]),
            ],
          }),
        ],
        installed: [
          { id: "notes", version: "1.0.0", origin: `https://${OFFICIAL}` },
        ],
      }),
    );
    expect(catalog.entries[0]?.installed?.update).toBeNull();
  });
});

describe("the stores themselves", () => {
  it("says of each whether it could be read, when it was fetched, and what was wrong with entries", () => {
    const when = new Date("2026-09-24T10:00:00Z");
    const catalog = buildCatalog(
      input({
        stores: [
          store({
            id: "s1",
            syncedAt: when,
            snapshot: ok(
              [entry("notes")],
              [{ id: "bad-one", issues: ["source.json is missing"] }],
            ),
          }),
          store({
            id: "s2",
            key: OTHER,
            name: "Acme",
            official: false,
            syncError: "The server answered 404.",
            snapshot: {
              ok: false,
              error: "The store has not been fetched yet.",
              code: "not-fetched",
            },
          }),
        ],
      }),
    );
    expect(catalog.stores).toEqual([
      {
        id: "s1",
        name: "Official",
        official: true,
        error: null,
        errorCode: null,
        syncedAt: when,
        syncError: null,
        problems: [{ id: "bad-one", issues: ["source.json is missing"] }],
      },
      {
        id: "s2",
        name: "Acme",
        official: false,
        error: "The store has not been fetched yet.",
        errorCode: "not-fetched",
        syncedAt: null,
        syncError: "The server answered 404.",
        problems: [],
      },
    ]);
  });

  it("lists nothing of a store that could not be read, and still lists the others", () => {
    const catalog = buildCatalog(
      input({
        stores: [
          store({
            id: "s2",
            key: OTHER,
            snapshot: { ok: false, error: "gone", code: "unreadable" },
          }),
          store({ id: "s1", entries: [entry("notes")] }),
        ],
      }),
    );
    expect(catalog.entries.map((e) => e.key)).toEqual(["s1/notes"]);
  });

  it("is an empty catalog for no stores", () => {
    expect(buildCatalog(input())).toEqual({ entries: [], stores: [] });
  });

  it("holds plain values only, apart from the date, so it can be handed to a client component", () => {
    const catalog = buildCatalog(
      input({
        stores: [store({ syncedAt: new Date(0), entries: [entry("notes")] })],
        installed: [{ id: "notes", version: "1.0.0", origin: null }],
      }),
    );
    const roundTrip = JSON.parse(JSON.stringify(catalog));
    expect(roundTrip.entries).toEqual(
      JSON.parse(JSON.stringify(catalog.entries)),
    );
    expect(roundTrip.entries[0].name).toBe("notes");
  });
});
