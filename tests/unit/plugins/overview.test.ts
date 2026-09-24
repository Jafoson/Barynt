import { describe, expect, it } from "bun:test";
import {
  buildOverview,
  type InstalledRow,
  type OverviewInput,
} from "@/features/plugins/overview";
import type { DiscoveredPlugin } from "@/lib/plugins/discovery";
import { OFFICIAL_STORE_URL } from "@/lib/plugins/policy";
import type { PluginStatus } from "@/lib/plugins/registry";
import { validateManifest } from "@/lib/plugins/validate";

// What the plugins page shows, put together from the database, the plugin directory
// and the registry. Pure logic: what matters is that every state has its code, that
// approval is offered only where the policy would run the code, that an update is
// offered only where the update action would take it, and that nothing of what lies
// in the directory is taken for installed.

const H1 = `sha512-${"A".repeat(86)}==`;
const H2 = `sha512-${"B".repeat(86)}==`;

type ManifestMore = Record<string, unknown>;

function found(
  id: string,
  version: string,
  more: ManifestMore = {},
): DiscoveredPlugin {
  const result = validateManifest({
    manifestVersion: 1,
    id,
    name: id,
    version,
    description: `The ${id} plugin`,
    author: "Someone",
    license: "MIT",
    categories: ["other"],
    barynt: "^0.1.0",
    ...more,
  });
  if (!result.ok) throw new Error(result.issues[0]?.message);
  return {
    id,
    version,
    dir: `/plugins/${id}/${version}`,
    ok: true,
    manifest: result.manifest,
  };
}

const broken = (id: string, version: string): DiscoveredPlugin => ({
  id,
  version,
  dir: `/plugins/${id}/${version}`,
  ok: false,
  issues: ["license: is required"],
});

function row(id: string, more: Partial<InstalledRow> = {}): InstalledRow {
  return {
    id,
    version: "1.0.0",
    status: "ENABLED",
    source: "STORE",
    scope: "WORKSPACE",
    origin: OFFICIAL_STORE_URL,
    integrity: H1,
    codeApprovalHash: null,
    previousVersion: null,
    previousIntegrity: null,
    ...more,
  };
}

function input(more: Partial<OverviewInput> = {}): OverviewInput {
  return {
    rows: [],
    discovered: [],
    snapshot: {
      dir: "/plugins",
      problem: null,
      discoveryIssues: [],
      plugins: [],
    },
    workspaceCounts: new Map(),
    activeStores: [OFFICIAL_STORE_URL],
    allowUnsigned: false,
    locale: "en",
    ...more,
  };
}

/** The one installed plugin `calendar`, with what the registry says about it. */
function one(
  more: {
    row?: Partial<InstalledRow>;
    manifest?: ManifestMore;
    status?: PluginStatus;
    extra?: DiscoveredPlugin[];
    input?: Partial<OverviewInput>;
  } = {},
) {
  const r = row("calendar", more.row);
  const overview = buildOverview(
    input({
      rows: [r],
      discovered: [
        found("calendar", r.version, more.manifest),
        ...(more.extra ?? []),
      ],
      snapshot: {
        dir: "/plugins",
        problem: null,
        discoveryIssues: [],
        plugins: more.status ? [{ id: "calendar", status: more.status }] : [],
      },
      ...more.input,
    }),
  );
  const plugin = overview.installed[0];
  if (!plugin) throw new Error("not listed");
  return plugin;
}

describe("an installed plugin", () => {
  it("shows what its manifest says and what the row says", () => {
    const plugin = one({
      manifest: {
        name: { en: "Calendar", de: "Kalender" },
        description: { en: "Plans", de: "Plant" },
        author: { name: "Mara Velez", email: "mara@example.com" },
        license: "Apache-2.0",
        homepage: "https://example.com/calendar",
        repository: "https://example.com/calendar.git",
        categories: ["planning", "other"],
        capabilities: ["issues:read", "network:egress:api.example.com"],
        scope: "workspace",
      },
      input: { locale: "de-CH" },
    });
    expect(plugin).toMatchObject({
      id: "calendar",
      version: "1.0.0",
      name: "Kalender",
      description: "Plant",
      author: "Mara Velez",
      license: "Apache-2.0",
      homepage: "https://example.com/calendar",
      repository: "https://example.com/calendar.git",
      categories: ["planning", "other"],
      capabilities: ["issues:read", "network:egress:api.example.com"],
      scope: "WORKSPACE",
      source: "STORE",
      origin: OFFICIAL_STORE_URL,
      integrity: H1,
      platformOn: true,
      unsigned: false,
      hasCode: false,
    });
  });

  it("shows the manifest of the version that is installed, not of another version that lies beside it", () => {
    const overview = buildOverview(
      input({
        rows: [row("calendar", { version: "1.0.0" })],
        discovered: [
          found("calendar", "2.0.0", { name: "Calendar two" }),
          found("calendar", "1.0.0", { name: "Calendar one" }),
        ],
      }),
    );
    expect(overview.installed[0]?.name).toBe("Calendar one");
  });

  it("takes where it applies from the row, not from the file", () => {
    expect(
      one({ row: { scope: "PLATFORM" }, manifest: { scope: "workspace" } })
        .scope,
    ).toBe("PLATFORM");
  });

  it("says the platform has it off", () => {
    expect(one({ row: { status: "DISABLED" } }).platformOn).toBe(false);
  });

  it.each([
    ["from a store", "STORE", false],
    ["from the plugin directory", "DIRECTORY", true],
    ["from an upload", "UPLOAD", true],
  ] as const)(
    "is marked as unsigned only when it comes from no store: %s",
    (_n, source, unsigned) => {
      expect(one({ row: { source } }).unsigned).toBe(unsigned);
    },
  );

  it("has code when the manifest names a server or a client entry", () => {
    expect(one({ manifest: { server: "server.js" } }).hasCode).toBe(true);
    expect(one({ manifest: { client: "client.js" } }).hasCode).toBe(true);
    expect(one().hasCode).toBe(false);
  });

  it("is in as many workspaces as have it on, and only a workspace plugin counts", () => {
    const counts = new Map([["calendar", 3]]);
    expect(one({ input: { workspaceCounts: counts } }).workspaces).toBe(3);
    expect(
      one({
        row: { scope: "PLATFORM" },
        input: { workspaceCounts: counts },
      }).workspaces,
    ).toBe(0);
    expect(one().workspaces).toBe(0);
  });

  it("falls back to its id, and to nothing else, when its files cannot be read", () => {
    const overview = buildOverview(
      input({
        rows: [row("calendar")],
        discovered: [],
        snapshot: {
          dir: "/plugins",
          problem: null,
          discoveryIssues: [],
          plugins: [{ id: "calendar", status: { state: "missing" } }],
        },
      }),
    );
    expect(overview.installed[0]).toMatchObject({
      name: "calendar",
      description: "",
      author: "",
      license: "",
      homepage: null,
      capabilities: [],
      categories: [],
      hasCode: false,
      update: null,
      previousVersion: null,
      storeUpdate: null,
    });
  });

  it("is listed by name, then by id", () => {
    const overview = buildOverview(
      input({
        rows: [row("zeta"), row("alpha-two"), row("alpha-one")],
        discovered: [
          found("zeta", "1.0.0", { name: "Alpha" }),
          found("alpha-two", "1.0.0", { name: "Zed" }),
          found("alpha-one", "1.0.0", { name: "Alpha" }),
        ],
      }),
    );
    expect(overview.installed.map((p) => p.id)).toEqual([
      "alpha-one",
      "zeta",
      "alpha-two",
    ]);
  });
});

describe("what became of it", () => {
  const cases: [string, PluginStatus | undefined, unknown][] = [
    [
      "running without code",
      { state: "loaded", mode: "declarative" },
      { kind: "running", mode: "declarative" },
    ],
    [
      "running in the process",
      { state: "loaded", mode: "in-process" },
      { kind: "running", mode: "in-process" },
    ],
    ["no workspace has it on", { state: "idle" }, { kind: "idle" }],
    ["switched off by the platform", { state: "disabled" }, { kind: "off" }],
    ["files missing", { state: "missing" }, { kind: "missing" }],
    [
      "manifest invalid",
      { state: "invalid", issues: ["id: bad"] },
      { kind: "invalid", issues: ["id: bad"] },
    ],
    [
      "not compatible",
      {
        state: "incompatible",
        problems: [
          { code: "dependency-missing", dependency: "notes", range: "^1" },
        ],
      },
      {
        kind: "incompatible",
        problems: [
          { code: "dependency-missing", dependency: "notes", range: "^1" },
        ],
      },
    ],
    [
      "blocked",
      { state: "blocked", reason: "not-approved" },
      { kind: "blocked", reason: "not-approved" },
    ],
    [
      "failed",
      { state: "failed", phase: "boot", message: "no room" },
      { kind: "failed", phase: "boot", message: "no room" },
    ],
    ["not known to the registry", undefined, { kind: "unknown" }],
  ];

  it.each(cases)("is told for a plugin that is %s", (_name, status, state) => {
    expect(one({ status }).state).toEqual(state as never);
  });

  it("is about the plugin it says, and not another one", () => {
    const overview = buildOverview(
      input({
        rows: [row("calendar"), row("notes")],
        discovered: [found("calendar", "1.0.0"), found("notes", "1.0.0")],
        snapshot: {
          dir: "/plugins",
          problem: null,
          discoveryIssues: [],
          plugins: [
            { id: "notes", status: { state: "disabled" } },
            { id: "calendar", status: { state: "idle" } },
          ],
        },
      }),
    );
    const by = Object.fromEntries(
      overview.installed.map((p) => [p.id, p.state]),
    );
    expect(by).toEqual({ calendar: { kind: "idle" }, notes: { kind: "off" } });
  });
});

describe("whether its code may be approved", () => {
  const code = { server: "server.js" };

  it("is nothing to approve for a plugin without code", () => {
    expect(one().approval).toEqual({ kind: "none" });
  });

  it("is open for code from a store that is on, and not approved yet", () => {
    expect(one({ manifest: code }).approval).toEqual({ kind: "open" });
  });

  it("is approved when the approval is for exactly the files installed now", () => {
    expect(
      one({ manifest: code, row: { codeApprovalHash: H1 } }).approval,
    ).toEqual({ kind: "approved" });
  });

  it("is outdated when the approval is for other files, and can be approved again", () => {
    expect(
      one({ manifest: code, row: { codeApprovalHash: H2 } }).approval,
    ).toEqual({ kind: "outdated" });
  });

  it("is refused for code from a store that is switched off", () => {
    expect(
      one({ manifest: code, input: { activeStores: [] } }).approval,
    ).toEqual({ kind: "refused", reason: "store-not-active" });
  });

  it("is refused for code from another store than the ones that are on", () => {
    expect(
      one({
        manifest: code,
        row: { origin: "https://example.com/other-store" },
      }).approval,
    ).toEqual({ kind: "refused", reason: "store-not-active" });
  });

  it.each([
    ["allowed", true, "unsigned-code"],
    ["not allowed", false, "unsigned-not-allowed"],
  ] as const)(
    "is refused for code from no store, with plugins from no store %s",
    (_n, allowUnsigned, reason) => {
      expect(
        one({
          manifest: code,
          row: { source: "DIRECTORY", origin: null },
          input: { allowUnsigned },
        }).approval,
      ).toEqual({ kind: "refused", reason });
    },
  );

  it("is refused when its manifest cannot be read and there is no approval", () => {
    const overview = buildOverview(input({ rows: [row("calendar")] }));
    expect(overview.installed[0]?.approval).toEqual({
      kind: "refused",
      reason: "invalid",
    });
  });

  it("is nothing to approve for a plugin without code, even from no store", () => {
    expect(
      one({ row: { source: "DIRECTORY", origin: null } }).approval,
    ).toEqual({ kind: "none" });
  });
});

describe("the way back, and the update in the store", () => {
  const updates = (entries: [string, string][]) => ({
    storeUpdates: new Map(entries),
  });

  it("is the version before the last update, when the row kept it and the hash of its files", () => {
    expect(
      one({
        row: {
          version: "1.1.0",
          previousVersion: "1.0.0",
          previousIntegrity: H1,
        },
        manifest: {},
      }).previousVersion,
    ).toBe("1.0.0");
  });

  it("is nothing when the row kept only one of the two, or none", () => {
    expect(
      one({ row: { previousVersion: "1.0.0" } }).previousVersion,
    ).toBeNull();
    expect(one({ row: { previousIntegrity: H1 } }).previousVersion).toBeNull();
    expect(one().previousVersion).toBeNull();
  });

  it("says which version the store the plugin came from offers", () => {
    expect(one({ input: updates([["calendar", "1.1.0"]]) }).storeUpdate).toBe(
      "1.1.0",
    );
  });

  it("is nothing for another plugin's update, and when the store was not asked", () => {
    expect(
      one({ input: updates([["notes", "9.9.9"]]) }).storeUpdate,
    ).toBeNull();
    expect(one().storeUpdate).toBeNull();
  });

  it("is nothing for a plugin from no store, whatever the map says", () => {
    expect(
      one({
        row: { source: "DIRECTORY", origin: null },
        input: updates([["calendar", "1.1.0"]]),
      }).storeUpdate,
    ).toBeNull();
    expect(
      one({
        row: { source: "UPLOAD", origin: null },
        input: updates([["calendar", "1.1.0"]]),
      }).storeUpdate,
    ).toBeNull();
  });

  it("is not the update of the plugin directory: the two do not mix", () => {
    const plugin = one({
      row: { source: "DIRECTORY", origin: null },
      extra: [found("calendar", "1.2.0")],
      input: updates([["calendar", "1.1.0"]]),
    });
    expect(plugin.update).toBe("1.2.0");
    expect(plugin.storeUpdate).toBeNull();
  });
});

describe("an update", () => {
  const at = (version: string, more: ManifestMore = {}) =>
    found("calendar", version, more);
  const dir = { source: "DIRECTORY", origin: null } as const;

  it("is offered for a plugin from the directory when a newer version lies there", () => {
    expect(one({ row: dir, extra: [at("1.1.0")] }).update).toBe("1.1.0");
  });

  it("is the highest version there is, not the last one listed", () => {
    expect(
      one({
        row: dir,
        extra: [at("1.10.0"), at("1.9.0"), at("1.2.0")],
      }).update,
    ).toBe("1.10.0");
  });

  it("is not offered for the same version or an older one", () => {
    expect(one({ row: dir, extra: [at("0.9.0")] }).update).toBeNull();
    expect(one({ row: dir }).update).toBeNull();
  });

  it("is not offered for a version whose manifest is not valid", () => {
    expect(
      one({ row: dir, extra: [broken("calendar", "2.0.0")] }).update,
    ).toBeNull();
  });

  it("is not offered for a plugin from a store, which is updated where it came from", () => {
    expect(one({ extra: [at("1.1.0")] }).update).toBeNull();
  });

  it("is not offered when it would change where the plugin applies", () => {
    expect(
      one({
        row: { ...dir, scope: "WORKSPACE" },
        extra: [at("1.1.0", { scope: "platform" })],
      }).update,
    ).toBeNull();
    expect(
      one({
        row: { ...dir, scope: "PLATFORM" },
        manifest: { scope: "platform" },
        extra: [at("1.1.0", { scope: "workspace" })],
      }).update,
    ).toBeNull();
    expect(
      one({
        row: { ...dir, scope: "PLATFORM" },
        manifest: { scope: "platform" },
        extra: [at("1.1.0", { scope: "platform" })],
      }).update,
    ).toBe("1.1.0");
    // Per workspace and per project are two different places.
    expect(
      one({
        row: { ...dir, scope: "WORKSPACE" },
        extra: [at("1.1.0", { scope: "project" })],
      }).update,
    ).toBeNull();
    expect(
      one({
        row: { ...dir, scope: "PROJECT" },
        manifest: { scope: "project" },
        extra: [at("1.1.0", { scope: "workspace" })],
      }).update,
    ).toBeNull();
    expect(
      one({
        row: { ...dir, scope: "PROJECT" },
        manifest: { scope: "project" },
        extra: [at("1.1.0", { scope: "project" })],
      }).update,
    ).toBe("1.1.0");
  });

  it("is a pre-release only if it is the highest there is", () => {
    expect(one({ row: dir, extra: [at("1.1.0-beta.1")] }).update).toBe(
      "1.1.0-beta.1",
    );
    expect(
      one({ row: dir, extra: [at("1.1.0-beta.1"), at("1.1.0")] }).update,
    ).toBe("1.1.0");
  });
});

describe("what lies in the plugin directory and is not installed", () => {
  it("is listed once for each plugin, in its highest valid version", () => {
    const overview = buildOverview(
      input({
        discovered: [
          found("notes", "1.0.0"),
          found("notes", "1.10.0"),
          found("notes", "1.9.0"),
          broken("notes", "2.0.0"),
        ],
      }),
    );
    expect(overview.available.map((p) => [p.id, p.version])).toEqual([
      ["notes", "1.10.0"],
    ]);
    // The version that cannot be used is said, and the valid ones are not.
    expect(overview.unusable.map((p) => [p.id, p.version])).toEqual([
      ["notes", "2.0.0"],
    ]);
  });

  it("leaves out what is installed, in whatever version", () => {
    const overview = buildOverview(
      input({
        rows: [row("calendar")],
        discovered: [
          found("calendar", "1.0.0"),
          found("calendar", "2.0.0"),
          found("notes", "1.0.0"),
        ],
      }),
    );
    expect(overview.available.map((p) => p.id)).toEqual(["notes"]);
  });

  it("says what it is: words in the language, scope, code, what it asks for", () => {
    const overview = buildOverview(
      input({
        locale: "de",
        discovered: [
          found("notes", "1.0.0", {
            name: { en: "Notes", de: "Notizen" },
            description: { en: "Writes", de: "Schreibt" },
            author: { name: "Mara" },
            license: "MIT",
            scope: "platform",
            server: "server.js",
            capabilities: ["issues:read"],
            categories: ["planning"],
          }),
        ],
      }),
    );
    expect(overview.available[0]).toEqual({
      id: "notes",
      version: "1.0.0",
      name: "Notizen",
      description: "Schreibt",
      author: "Mara",
      license: "MIT",
      categories: ["planning"],
      capabilities: ["issues:read"],
      scope: "PLATFORM",
      hasCode: true,
    });
  });

  it("says a plugin in the directory applies per project when its manifest says so", () => {
    const overview = buildOverview(
      input({ discovered: [found("board", "1.0.0", { scope: "project" })] }),
    );
    expect(overview.available[0]?.scope).toBe("PROJECT");
  });

  it("is listed by name", () => {
    const overview = buildOverview(
      input({
        discovered: [
          found("b-plugin", "1.0.0", { name: "Alpha" }),
          found("a-plugin", "1.0.0", { name: "Beta" }),
        ],
      }),
    );
    expect(overview.available.map((p) => p.id)).toEqual([
      "b-plugin",
      "a-plugin",
    ]);
  });

  it("puts a version without a valid manifest in the list of what cannot be used", () => {
    const overview = buildOverview(
      input({
        discovered: [
          broken("zed", "1.0.0"),
          broken("alpha", "2.0.0"),
          broken("alpha", "1.0.0"),
        ],
      }),
    );
    expect(overview.unusable).toEqual([
      { id: "alpha", version: "1.0.0", issues: ["license: is required"] },
      { id: "alpha", version: "2.0.0", issues: ["license: is required"] },
      { id: "zed", version: "1.0.0", issues: ["license: is required"] },
    ]);
    expect(overview.available).toEqual([]);
  });

  it("does not list the broken version of an installed plugin: its state says so", () => {
    const overview = buildOverview(
      input({
        rows: [row("calendar", { version: "1.0.0" })],
        discovered: [broken("calendar", "1.0.0")],
      }),
    );
    expect(overview.unusable).toEqual([]);
  });
});

describe("the rest of the page", () => {
  it("passes on where plugins are read from, why they are off, the problems with the directory and the setting", () => {
    const overview = buildOverview(
      input({
        allowUnsigned: true,
        snapshot: {
          dir: "/data/plugins",
          problem: "The plugins could not be loaded: database down",
          discoveryIssues: ["backup: is not a plugin"],
          plugins: [],
        },
      }),
    );
    expect(overview).toMatchObject({
      dir: "/data/plugins",
      problem: "The plugins could not be loaded: database down",
      issues: ["backup: is not a plugin"],
      allowUnsigned: true,
      installed: [],
      available: [],
      unusable: [],
    });
  });

  it("has no directory when plugins are off", () => {
    const overview = buildOverview(
      input({
        snapshot: {
          dir: null,
          problem: "PLUGINS_DIR must be absolute",
          discoveryIssues: [],
          plugins: [],
        },
      }),
    );
    expect(overview.dir).toBeNull();
    expect(overview.problem).toBe("PLUGINS_DIR must be absolute");
  });

  it("holds plain values only, so it can be handed to a client component", () => {
    const overview = buildOverview(
      input({
        rows: [row("calendar")],
        discovered: [found("calendar", "1.0.0"), found("notes", "1.0.0")],
      }),
    );
    expect(JSON.parse(JSON.stringify(overview))).toEqual(overview);
  });

  it("does not hand out what the caller passed in, so a later change to it changes nothing", () => {
    const issues = ["x"];
    const overview = buildOverview(
      input({
        snapshot: {
          dir: "/plugins",
          problem: null,
          discoveryIssues: issues,
          plugins: [],
        },
      }),
    );
    issues.push("y");
    expect(overview.issues).toEqual(["x"]);
  });
});
