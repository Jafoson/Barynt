import { describe, expect, it } from "bun:test";
import type {
  ApprovalState,
  InstalledPlugin,
  PluginsOverview,
  RuntimeState,
} from "@/features/plugins/overview";
import {
  blockerOf,
  buildWorkspacePlugins,
} from "@/features/plugins/workspacePlugins";

// What a workspace's plugins page is made of. What matters: only the plugins that apply per
// workspace are the workspace's, a plugin the platform switched off is shown only where it is on
// here, the reason a plugin cannot be switched on or does not run is one of a few codes, and the
// platform's own paths and hashes are not passed on.

const H = `sha512-${"A".repeat(86)}==`;

function installed(more: Partial<InstalledPlugin> = {}): InstalledPlugin {
  return {
    id: "notes",
    version: "1.0.0",
    name: "Notes",
    description: "Takes notes",
    author: "Acme",
    license: "MIT",
    homepage: null,
    repository: null,
    categories: ["planning"],
    capabilities: ["issues:read"],
    scope: "WORKSPACE",
    source: "STORE",
    origin: "https://github.com/Jafoson/barynt-plugin-store",
    unsigned: false,
    hasCode: false,
    platformOn: true,
    workspaces: 3,
    state: { kind: "idle" },
    approval: { kind: "none" },
    integrity: H,
    update: null,
    ...more,
  };
}

function overview(
  list: InstalledPlugin[],
  more: Partial<PluginsOverview> = {},
): PluginsOverview {
  return {
    dir: "/secret/plugins/dir",
    problem: null,
    issues: ["something in the directory"],
    allowUnsigned: false,
    installed: list,
    available: [],
    unusable: [],
    ...more,
  };
}

const build = (
  list: InstalledPlugin[],
  on: string[] = [],
  more: Partial<PluginsOverview> = {},
  storeAvailable = false,
) => buildWorkspacePlugins(overview(list, more), new Set(on), storeAvailable);

describe("what keeps a plugin from being switched on, or from running", () => {
  const blocker = (
    plugin: Partial<InstalledPlugin>,
    approval: ApprovalState = { kind: "none" },
  ) => blockerOf(installed({ ...plugin, approval }));

  it("is nothing for a plugin that can run", () => {
    expect(blocker({})).toBeNull();
    expect(
      blocker({ state: { kind: "running", mode: "declarative" } }),
    ).toBeNull();
    expect(blocker({ state: { kind: "off" } })).toBeNull();
    expect(blocker({ hasCode: true }, { kind: "approved" })).toBeNull();
  });

  it("is the platform's switch, before anything else", () => {
    expect(blocker({ platformOn: false })).toBe("platform-off");
    expect(
      blocker({ platformOn: false, hasCode: true }, { kind: "open" }),
    ).toBe("platform-off");
  });

  it("is the approval of the code, for a plugin that has some", () => {
    expect(blocker({ hasCode: true }, { kind: "open" })).toBe("needs-approval");
    expect(blocker({ hasCode: true }, { kind: "outdated" })).toBe(
      "approval-outdated",
    );
    expect(
      blocker(
        { hasCode: true },
        { kind: "refused", reason: "store-not-active" },
      ),
    ).toBe("cannot-run");
  });

  it("does not ask for an approval of a plugin that has no code", () => {
    expect(blocker({ hasCode: false }, { kind: "open" })).toBeNull();
    expect(blocker({ hasCode: false }, { kind: "outdated" })).toBeNull();
  });

  it.each([
    ["invalid", { kind: "invalid", issues: ["x"] }],
    ["missing", { kind: "missing" }],
    ["incompatible", { kind: "incompatible", problems: [] }],
    ["failed", { kind: "failed", phase: "boot", message: "boom" }],
    ["unknown", { kind: "unknown" }],
    [
      "blocked for another reason",
      { kind: "blocked", reason: "unsigned-code" },
    ],
    [
      "blocked as it is not from an active store",
      { kind: "blocked", reason: "store-not-active" },
    ],
    [
      "blocked as its files could not be checked",
      { kind: "blocked", reason: "invalid" },
    ],
  ] as [string, RuntimeState][])(
    "is that it cannot run, when it is %s",
    (_n, state) => {
      expect(blocker({ state })).toBe("cannot-run");
    },
  );

  it("is the approval when the registry says the code is not approved, whatever the overview's own line says", () => {
    expect(
      blocker({
        hasCode: false,
        state: { kind: "blocked", reason: "not-approved" },
      }),
    ).toBe("needs-approval");
    expect(
      blocker({
        hasCode: false,
        state: { kind: "blocked", reason: "approval-outdated" },
      }),
    ).toBe("approval-outdated");
  });
});

describe("the plugins of a workspace", () => {
  it("are the ones that apply per workspace, and which of them are on here", () => {
    const view = build(
      [installed({ id: "notes" }), installed({ id: "wiki", name: "Wiki" })],
      ["wiki"],
    );
    expect(view.plugins.map((p) => [p.id, p.on])).toEqual([
      ["notes", false],
      ["wiki", true],
    ]);
  });

  it("do not include a plugin of the whole platform, which is listed apart, and only where the platform has it on", () => {
    const view = build([
      installed({ id: "notes" }),
      installed({
        id: "audit-trail",
        name: "Audit trail",
        scope: "PLATFORM",
        description: "Everywhere",
      }),
      installed({ id: "sleeping", scope: "PLATFORM", platformOn: false }),
    ]);
    expect(view.plugins.map((p) => p.id)).toEqual(["notes"]);
    expect(view.platform).toEqual([
      {
        id: "audit-trail",
        version: "1.0.0",
        name: "Audit trail",
        description: "Everywhere",
      },
    ]);
  });

  it("do not include a plugin the platform switched off, unless it is on here, to say why it is not running", () => {
    const off = installed({ id: "wiki", platformOn: false });
    expect(build([off]).plugins).toEqual([]);
    const view = build([off], ["wiki"]);
    expect(view.plugins).toHaveLength(1);
    expect(view.plugins[0]).toMatchObject({
      on: true,
      blocker: "platform-off",
    });
  });

  it("say what each is: its words, whether it has code, whether it is from a store", () => {
    const [plugin] = build([
      installed({
        name: "Notes",
        description: "Takes notes",
        author: "Acme",
        hasCode: true,
        unsigned: true,
        approval: { kind: "approved" },
        capabilities: ["issues:read", "issues:write"],
        categories: ["planning", "other"],
      }),
    ]).plugins;
    expect(plugin).toMatchObject({
      id: "notes",
      version: "1.0.0",
      name: "Notes",
      description: "Takes notes",
      author: "Acme",
      hasCode: true,
      fromStore: false,
      capabilities: ["issues:read", "issues:write"],
      categories: ["planning", "other"],
    });
    expect(build([installed({ unsigned: false })]).plugins[0]?.fromStore).toBe(
      true,
    );
  });

  it("carry the registry's state and the blocker for each", () => {
    const view = build(
      [
        installed({
          id: "a",
          state: { kind: "running", mode: "in-process" },
          hasCode: true,
          approval: { kind: "approved" },
        }),
        installed({
          id: "b",
          hasCode: true,
          approval: { kind: "open" },
          state: { kind: "blocked", reason: "not-approved" },
        }),
      ],
      ["a"],
    );
    expect(view.plugins[0]).toMatchObject({
      on: true,
      blocker: null,
      state: { kind: "running", mode: "in-process" },
    });
    expect(view.plugins[1]).toMatchObject({
      on: false,
      blocker: "needs-approval",
    });
  });

  it("are copies: what is passed on cannot change what the platform's overview holds", () => {
    const source = installed({
      capabilities: ["issues:read"],
      categories: ["planning"],
    });
    const view = build([source]);
    view.plugins[0]?.capabilities.push("x");
    view.plugins[0]?.categories.push("x");
    expect(source.capabilities).toEqual(["issues:read"]);
    expect(source.categories).toEqual(["planning"]);
  });

  it("do not carry what is the platform's: the directory, the hashes, where a plugin came from, who else uses it", () => {
    const view = build(
      [
        installed({
          integrity: H,
          origin: "https://github.com/x/y",
          workspaces: 9,
        }),
      ],
      ["notes"],
      { dir: "/secret/plugins/dir" },
    );
    const text = JSON.stringify(view);
    expect(text).not.toContain("/secret/plugins/dir");
    expect(text).not.toContain("sha512-");
    expect(text).not.toContain("github.com/x/y");
    expect(text).not.toContain("something in the directory");
    expect(Object.keys(view).sort()).toEqual([
      "available",
      "platform",
      "plugins",
      "storeAvailable",
    ]);
  });

  it("say whether plugins are available at all, and not why not: that is the platform's", () => {
    expect(build([]).available).toBe(true);
    const off = build([], [], {
      dir: null,
      problem: "BARYNT_PLUGINS_DIR must be absolute: /secret",
    });
    expect(off.available).toBe(false);
    expect(JSON.stringify(off)).not.toContain("/secret");
  });

  it("has a store when the platform gave workspaces one, and plugins are on", () => {
    expect(build([], [], {}, true).storeAvailable).toBe(true);
    expect(build([], [], {}, false).storeAvailable).toBe(false);
    expect(build([], [], { dir: null }, true).storeAvailable).toBe(false);
  });
});
