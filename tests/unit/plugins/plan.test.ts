import { describe, expect, it } from "bun:test";
import type { DiscoveredPlugin } from "@/lib/plugins/discovery";
import {
  type InstalledPlugin,
  type PlanInput,
  planPlugins,
} from "@/lib/plugins/plan";
import { OFFICIAL_STORE_URL } from "@/lib/plugins/policy";
import { validateManifest } from "@/lib/plugins/validate";

// Which installed plugins go to the loader and why the others do not. Pure logic
// on plain values, no database and no disk. Every plugin that does not run needs a
// reason the admin can be given, and nothing that is not allowed may reach the
// loader.

const HASH = `sha512-${"A".repeat(86)}==`;
const HOST = "1.2.0";

function manifestOf(id: string, more: Record<string, unknown> = {}) {
  const result = validateManifest({
    manifestVersion: 1,
    id,
    name: id,
    version: "1.0.0",
    description: "A test plugin",
    author: "Someone",
    license: "MIT",
    categories: ["other"],
    barynt: ">=1.0.0 <2.0.0",
    ...more,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.issues));
  return result.manifest;
}

function found(
  id: string,
  more: Record<string, unknown> = {},
): DiscoveredPlugin {
  const manifest = manifestOf(id, more);
  return {
    id,
    version: manifest.version,
    dir: `/plugins/${id}/${manifest.version}`,
    ok: true,
    manifest,
  };
}

function row(id: string, more: Partial<InstalledPlugin> = {}): InstalledPlugin {
  return {
    id,
    version: "1.0.0",
    status: "ENABLED",
    source: "STORE",
    scope: "WORKSPACE",
    origin: OFFICIAL_STORE_URL,
    integrity: HASH,
    codeApprovalHash: null,
    ...more,
  };
}

/** A plugin that is installed, on disk, and on in one workspace, unless said otherwise. */
function plan(
  more: Partial<PlanInput> & { installed: InstalledPlugin[] },
  discovered?: DiscoveredPlugin[],
) {
  return planPlugins({
    discovered: discovered ?? more.installed.map((plugin) => found(plugin.id)),
    enabledSomewhere: new Set(more.installed.map((plugin) => plugin.id)),
    activeStores: [OFFICIAL_STORE_URL],
    allowUnsigned: false,
    hostVersion: HOST,
    ...more,
  });
}

const stateOf = (result: ReturnType<typeof plan>, id: string) =>
  result.plans.get(id)?.state;
const candidateIds = (result: ReturnType<typeof plan>) =>
  result.candidates.map((candidate) => candidate.id);

describe("a plugin that is fine", () => {
  it("goes to the loader with the hash approved at install, from the directory found", () => {
    const result = plan({ installed: [row("calendar")] });
    expect(result.plans.get("calendar")).toEqual({
      state: "planned",
      mode: "declarative",
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0]).toMatchObject({
      id: "calendar",
      version: "1.0.0",
      dir: "/plugins/calendar/1.0.0",
      integrity: HASH,
    });
    expect(result.modes.get("calendar")).toBe("declarative");
  });

  it("has an entry for every installed plugin, and nothing for one that is not installed", () => {
    const result = plan(
      { installed: [row("alpha"), row("bravo", { status: "DISABLED" })] },
      [found("alpha"), found("bravo"), found("not-installed")],
    );
    expect([...result.plans.keys()].sort()).toEqual(["alpha", "bravo"]);
  });
});

describe("the manifest on disk", () => {
  it("is missing when the installed version is not there, even if another version is", () => {
    const result = plan({ installed: [row("alpha", { version: "2.0.0" })] }, [
      found("alpha"),
    ]);
    expect(result.plans.get("alpha")).toEqual({ state: "missing" });
    expect(result.candidates).toEqual([]);
  });

  it("is missing when nothing was found for the plugin", () => {
    expect(stateOf(plan({ installed: [row("alpha")] }, []), "alpha")).toBe(
      "missing",
    );
  });

  it("is invalid, with its issues, when discovery could not read it", () => {
    const broken: DiscoveredPlugin = {
      id: "alpha",
      version: "1.0.0",
      dir: "/plugins/a/1.0.0",
      ok: false,
      issues: ["categories: required"],
    };
    const result = plan({ installed: [row("alpha")] }, [broken]);
    expect(result.plans.get("alpha")).toEqual({
      state: "invalid",
      issues: ["categories: required"],
    });
    expect(result.candidates).toEqual([]);
  });
});

describe("what can load with this Barynt", () => {
  it("is incompatible when the host is outside the plugin's range, with the reason", () => {
    const result = plan({ installed: [row("alpha")] }, [
      found("alpha", { barynt: ">=2.0.0 <3.0.0" }),
    ]);
    expect(result.plans.get("alpha")).toMatchObject({
      state: "incompatible",
      problems: [{ code: "host-incompatible" }],
    });
    expect(result.candidates).toEqual([]);
  });

  it("is incompatible when a plugin it needs is not installed", () => {
    const result = plan({ installed: [row("alpha")] }, [
      found("alpha", { dependencies: { missing: ">=1.0.0" } }),
    ]);
    expect(result.plans.get("alpha")).toMatchObject({
      state: "incompatible",
      problems: [{ code: "dependency-missing" }],
    });
  });

  it("does not let an incompatible plugin take the compatible ones down", () => {
    const result = plan({ installed: [row("alpha"), row("bravo")] }, [
      found("alpha", { barynt: ">=9.0.0" }),
      found("bravo"),
    ]);
    expect(candidateIds(result)).toEqual(["bravo"]);
  });
});

describe("switched off by the platform", () => {
  it("is disabled and not loaded, whatever else is true", () => {
    const result = plan({
      installed: [row("alpha", { status: "DISABLED", scope: "PLATFORM" })],
    });
    expect(result.plans.get("alpha")).toEqual({ state: "disabled" });
    expect(result.candidates).toEqual([]);
  });

  it("is disabled even when a plugin that is wanted needs it, and the dependent is left to fail", () => {
    const result = plan(
      {
        installed: [
          row("base", { status: "DISABLED", scope: "PLATFORM" }),
          row("top", { scope: "PLATFORM" }),
        ],
      },
      [found("base"), found("top", { dependencies: { base: ">=1.0.0" } })],
    );
    expect(result.plans.get("base")).toEqual({ state: "disabled" });
    // The loader is given the dependent without its dependency and says so.
    expect(candidateIds(result)).toEqual(["top"]);
  });
});

describe("which workspace plugins are loaded", () => {
  it("does not load a workspace plugin that no workspace has switched on", () => {
    const result = plan({
      installed: [row("alpha")],
      enabledSomewhere: new Set(),
    });
    expect(result.plans.get("alpha")).toEqual({ state: "idle" });
    expect(result.candidates).toEqual([]);
  });

  it("loads it as soon as one workspace has it on", () => {
    const result = plan({
      installed: [row("alpha")],
      enabledSomewhere: new Set(["alpha"]),
    });
    expect(candidateIds(result)).toEqual(["alpha"]);
  });

  it("loads a platform plugin without any workspace, because it applies everywhere", () => {
    const result = plan({
      installed: [row("alpha", { scope: "PLATFORM" })],
      enabledSomewhere: new Set(),
    });
    expect(candidateIds(result)).toEqual(["alpha"]);
  });

  it("does not take 'enabled somewhere' for a plugin as a reason to load another", () => {
    const result = plan({
      installed: [row("alpha"), row("bravo")],
      enabledSomewhere: new Set(["alpha"]),
    });
    expect(candidateIds(result)).toEqual(["alpha"]);
    expect(result.plans.get("bravo")).toEqual({ state: "idle" });
  });

  it("loads what a wanted plugin depends on, even if no workspace switched that on", () => {
    const result = plan(
      {
        installed: [row("base"), row("top")],
        enabledSomewhere: new Set(["top"]),
      },
      [found("base"), found("top", { dependencies: { base: ">=1.0.0" } })],
    );
    expect(candidateIds(result)).toEqual(["base", "top"]);
  });

  it("loads what a dependency depends on too, all the way down", () => {
    const result = plan(
      {
        installed: [row("charlie"), row("bravo"), row("alpha")],
        enabledSomewhere: new Set(["alpha"]),
      },
      [
        found("charlie"),
        found("bravo", { dependencies: { charlie: ">=1.0.0" } }),
        found("alpha", { dependencies: { bravo: ">=1.0.0" } }),
      ],
    );
    expect(candidateIds(result)).toEqual(["charlie", "bravo", "alpha"]);
  });

  it("does not load a dependency for a plugin that is not wanted", () => {
    const result = plan(
      {
        installed: [row("base"), row("top")],
        enabledSomewhere: new Set(),
      },
      [found("base"), found("top", { dependencies: { base: ">=1.0.0" } })],
    );
    expect(result.candidates).toEqual([]);
    expect(stateOf(result, "base")).toBe("idle");
    expect(stateOf(result, "top")).toBe("idle");
  });

  it("gives the loader dependencies first, whatever order they were installed in", () => {
    const result = plan(
      { installed: [row("zulu"), row("alpha"), row("mike")] },
      [
        found("zulu", { dependencies: { mike: ">=1.0.0" } }),
        found("alpha"),
        found("mike", { dependencies: { alpha: ">=1.0.0" } }),
      ],
    );
    const order = candidateIds(result);
    expect(order.indexOf("alpha")).toBeLessThan(order.indexOf("mike"));
    expect(order.indexOf("mike")).toBeLessThan(order.indexOf("zulu"));
  });
});

describe("the policy", () => {
  it("lets a plugin without code run from the official store", () => {
    expect(plan({ installed: [row("alpha")] }).modes.get("alpha")).toBe(
      "declarative",
    );
  });

  it("blocks a plugin with code that is not approved, and does not hand it to the loader", () => {
    const result = plan({ installed: [row("alpha")] }, [
      found("alpha", { server: "server.js" }),
    ]);
    expect(result.plans.get("alpha")).toEqual({
      state: "blocked",
      reason: "not-approved",
    });
    expect(result.candidates).toEqual([]);
  });

  it("lets a plugin with code run in the process only with an approval for exactly its hash", () => {
    const withCode = [found("alpha", { server: "server.js" })];
    const approved = plan(
      { installed: [row("alpha", { codeApprovalHash: HASH })] },
      withCode,
    );
    expect(approved.plans.get("alpha")).toEqual({
      state: "planned",
      mode: "in-process",
    });
    expect(candidateIds(approved)).toEqual(["alpha"]);

    const outdated = plan(
      {
        installed: [
          row("alpha", { codeApprovalHash: `sha512-${"B".repeat(86)}==` }),
        ],
      },
      withCode,
    );
    expect(outdated.plans.get("alpha")).toEqual({
      state: "blocked",
      reason: "approval-outdated",
    });
    expect(outdated.candidates).toEqual([]);
  });

  it("blocks code from a store that is not on, and passes the store list on as given", () => {
    const withCode = [found("alpha", { server: "server.js" })];
    const result = plan(
      {
        installed: [row("alpha", { codeApprovalHash: HASH })],
        activeStores: [],
      },
      withCode,
    );
    expect(result.plans.get("alpha")).toEqual({
      state: "blocked",
      reason: "store-not-active",
    });
  });

  it("blocks a plugin from no store unless unsigned plugins are allowed", () => {
    const installed = [row("alpha", { source: "UPLOAD", origin: null })];
    expect(plan({ installed }).plans.get("alpha")).toEqual({
      state: "blocked",
      reason: "unsigned-not-allowed",
    });
    expect(plan({ installed, allowUnsigned: true }).modes.get("alpha")).toBe(
      "declarative",
    );
  });

  it("keeps unsigned code blocked even when unsigned plugins are allowed", () => {
    const result = plan(
      {
        installed: [
          row("alpha", {
            source: "UPLOAD",
            origin: null,
            codeApprovalHash: HASH,
          }),
        ],
        allowUnsigned: true,
      },
      [found("alpha", { server: "server.js" })],
    );
    expect(result.plans.get("alpha")).toEqual({
      state: "blocked",
      reason: "unsigned-code",
    });
    expect(result.candidates).toEqual([]);
  });

  it("leaves the dependents of a blocked plugin to the loader, which refuses them", () => {
    const result = plan({ installed: [row("base"), row("top")] }, [
      found("base", { server: "server.js" }),
      found("top", { dependencies: { base: ">=1.0.0" } }),
    ]);
    expect(stateOf(result, "base")).toBe("blocked");
    // `top` is handed on without `base`, so the loader reports the dependency.
    expect(candidateIds(result)).toEqual(["top"]);
  });

  it("does not ask the policy about a plugin that is not wanted", () => {
    // A plugin with code and no approval is `idle` when nobody wants it, not `blocked`:
    // only what would run needs an answer.
    const result = plan(
      { installed: [row("alpha")], enabledSomewhere: new Set() },
      [found("alpha", { server: "server.js" })],
    );
    expect(result.plans.get("alpha")).toEqual({ state: "idle" });
  });
});

describe("where a plugin applies decides what it may depend on", () => {
  it("does not load a platform plugin that needs a workspace plugin: it applies everywhere and its dependency does not", () => {
    const result = plan(
      {
        installed: [row("base"), row("top", { scope: "PLATFORM" })],
        enabledSomewhere: new Set(["base"]),
      },
      [found("base"), found("top", { dependencies: { base: ">=1.0.0" } })],
    );
    expect(result.plans.get("top")).toMatchObject({
      state: "incompatible",
      problems: [{ code: "dependency-scope" }],
    });
    expect(candidateIds(result)).toEqual(["base"]);
  });

  it("takes both scopes from the database, whatever the files say", () => {
    // The database says `top` is a platform plugin and `base` a workspace plugin, so
    // that is a problem; the manifests claim the opposite, where it would not be.
    const result = plan(
      {
        installed: [row("base"), row("top", { scope: "PLATFORM" })],
        enabledSomewhere: new Set(["base"]),
      },
      [
        found("base", { scope: "platform" }),
        found("top", { scope: "workspace", dependencies: { base: ">=1.0.0" } }),
      ],
    );
    expect(result.plans.get("top")).toMatchObject({
      state: "incompatible",
      problems: [{ code: "dependency-scope" }],
    });
  });

  it("reads a project plugin as one: it may lean on a platform plugin, and not on a workspace plugin", () => {
    const onPlatform = plan(
      {
        installed: [
          row("sso", { scope: "PLATFORM" }),
          row("board", { scope: "PROJECT" }),
        ],
        enabledSomewhere: new Set(["board"]),
      },
      [found("sso"), found("board", { dependencies: { sso: ">=1.0.0" } })],
    );
    expect(candidateIds(onPlatform)).toEqual(["sso", "board"]);

    const onWorkspace = plan(
      {
        installed: [row("tracking"), row("board", { scope: "PROJECT" })],
        enabledSomewhere: new Set(["tracking", "board"]),
      },
      [
        found("tracking"),
        found("board", { dependencies: { tracking: ">=1.0.0" } }),
      ],
    );
    expect(onWorkspace.plans.get("board")).toMatchObject({
      state: "incompatible",
      problems: [
        {
          code: "dependency-scope",
          scope: "project",
          dependencyScope: "workspace",
        },
      ],
    });
  });

  it("takes a project plugin's scope from the database too, whatever the file says", () => {
    const result = plan(
      {
        installed: [row("tracking"), row("board", { scope: "PROJECT" })],
        enabledSomewhere: new Set(["tracking", "board"]),
      },
      [
        found("tracking", { scope: "project" }),
        found("board", {
          scope: "workspace",
          dependencies: { tracking: ">=1.0.0" },
        }),
      ],
    );
    expect(result.plans.get("board")).toMatchObject({
      state: "incompatible",
      problems: [{ code: "dependency-scope", scope: "project" }],
    });
  });

  it("lets a platform plugin need another platform plugin", () => {
    const result = plan(
      {
        installed: [
          row("base", { scope: "PLATFORM" }),
          row("top", { scope: "PLATFORM" }),
        ],
        enabledSomewhere: new Set(),
      },
      [found("base"), found("top", { dependencies: { base: ">=1.0.0" } })],
    );
    expect(candidateIds(result)).toEqual(["base", "top"]);
  });
});

describe("what a switched-off plugin needs", () => {
  it("is not loaded for it: a plugin the platform switched off wants nothing", () => {
    const result = plan(
      {
        installed: [row("base"), row("top", { status: "DISABLED" })],
        enabledSomewhere: new Set(["top"]),
      },
      [found("base"), found("top", { dependencies: { base: ">=1.0.0" } })],
    );
    expect(result.plans.get("top")).toEqual({ state: "disabled" });
    expect(result.plans.get("base")).toEqual({ state: "idle" });
    expect(result.candidates).toEqual([]);
  });
});

describe("the manifest is not taken as the last word", () => {
  it("takes where the plugin applies from the database, not from the file", () => {
    // The file says workspace, the database says platform: it is wanted with no
    // workspace, as the database says.
    const result = plan(
      {
        installed: [row("alpha", { scope: "PLATFORM" })],
        enabledSomewhere: new Set(),
      },
      [found("alpha", { scope: "workspace" })],
    );
    expect(candidateIds(result)).toEqual(["alpha"]);
  });

  it("takes the source and origin from the database, not from anything on disk", () => {
    const result = plan(
      {
        installed: [row("alpha", { source: "UPLOAD", origin: null })],
      },
      [found("alpha", { server: "server.js" })],
    );
    expect(result.plans.get("alpha")).toEqual({
      state: "blocked",
      reason: "unsigned-not-allowed",
    });
  });
});
