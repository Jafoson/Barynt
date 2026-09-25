import { beforeEach, describe, expect, it } from "bun:test";
import type { DiscoveredPlugin, Discovery } from "@/lib/plugins/discovery";
import type {
  LoadCandidate,
  LoadOptions,
  LoadReport,
} from "@/lib/plugins/loader";
import type { InstalledPlugin } from "@/lib/plugins/plan";
import { OFFICIAL_STORE_URL } from "@/lib/plugins/policy";
import {
  activePluginsIn,
  activePluginsInProject,
  createPluginRegistry,
  RETRY_AFTER_FAILURE_MS,
  type RegistryDeps,
  type RegistrySnapshot,
} from "@/lib/plugins/registry";
import {
  createRegistryState,
  getRegistryState,
  invalidatePluginRegistry,
  type RegistryState,
} from "@/lib/plugins/registryState";
import { validateManifest } from "@/lib/plugins/validate";

// The registry decides, once per process, which plugins are running, and keeps the
// answer until something that decides it changes. What matters here: it fails
// closed (a build that fails is no plugins, never the last good answer), a change
// during a build is never served from that build, `boot` runs once per process,
// and one build serves all requests. Everything it needs comes in as plain values.

const HASH = `sha512-${"A".repeat(86)}==`;

function found(
  id: string,
  more: Record<string, unknown> = {},
): DiscoveredPlugin {
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
  return {
    id,
    version: result.manifest.version,
    dir: `/plugins/${id}/1.0.0`,
    ok: true,
    manifest: result.manifest,
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

interface Harness {
  deps: RegistryDeps;
  state: RegistryState;
  calls: {
    installed: number;
    discover: number;
    activeStores: number;
    allowUnsigned: number;
    load: LoadCandidate[][];
    loadOptions: LoadOptions[];
    /** What `alreadyBooted` answered for each candidate, at the moment the loader asked. */
    booted: Record<string, boolean>[];
    services: string[];
    /** The manifest each `services` call was given, in order. */
    manifests: unknown[];
    log: string[];
  };
  clock: { now: number };
  /** What the fake database and disk return. Change it between builds. */
  data: {
    installed: InstalledPlugin[];
    enabledSomewhere: Set<string>;
    discovered: DiscoveredPlugin[];
    issues: string[];
    stores: string[];
    allowUnsigned: boolean;
    dir: string | null;
    dirProblem?: string;
    /** The directory is the default, nobody named it. */
    implicit: boolean;
    /** The directory does not exist. */
    rootMissing: boolean;
    /** Ids the fake loader refuses. */
    refuse: Map<string, { phase: "import" | "boot"; message: string }>;
  };
}

function harness(
  overrides: Partial<RegistryDeps> = {},
  data: Partial<Harness["data"]> = {},
): Harness {
  const state = createRegistryState();
  const clock = { now: 1_000_000 };
  const calls: Harness["calls"] = {
    installed: 0,
    discover: 0,
    activeStores: 0,
    allowUnsigned: 0,
    load: [],
    loadOptions: [],
    booted: [],
    services: [],
    manifests: [],
    log: [],
  };
  const d: Harness["data"] = {
    installed: [row("calendar")],
    enabledSomewhere: new Set(["calendar"]),
    discovered: [found("calendar")],
    issues: [],
    stores: [OFFICIAL_STORE_URL],
    allowUnsigned: false,
    dir: "/plugins",
    implicit: false,
    rootMissing: false,
    refuse: new Map(),
    ...data,
  };
  const deps: RegistryDeps = {
    pluginsDir: () =>
      d.dir === null
        ? { dir: null, ...(d.dirProblem ? { problem: d.dirProblem } : {}) }
        : { dir: d.dir, implicit: d.implicit },
    installed: async () => {
      calls.installed += 1;
      return {
        plugins: [...d.installed],
        enabledSomewhere: new Set(d.enabledSomewhere),
      };
    },
    discover: async (): Promise<Discovery> => {
      calls.discover += 1;
      return {
        plugins: [...d.discovered],
        issues: [...d.issues],
        rootMissing: d.rootMissing,
      };
    },
    activeStores: async () => {
      calls.activeStores += 1;
      return [...d.stores];
    },
    allowUnsigned: async () => {
      calls.allowUnsigned += 1;
      return d.allowUnsigned;
    },
    load: async (candidates, options): Promise<LoadReport> => {
      calls.load.push([...candidates]);
      calls.loadOptions.push(options);
      calls.booted.push(
        Object.fromEntries(
          candidates.map((candidate) => [
            `${candidate.id}@${candidate.version}`,
            options.alreadyBooted?.(candidate) ?? false,
          ]),
        ),
      );
      const failed = new Map<
        string,
        { phase: "import" | "boot"; message: string }
      >();
      const loaded = [];
      for (const candidate of candidates) {
        const refusal = d.refuse.get(candidate.id);
        if (refusal) failed.set(candidate.id, refusal);
        else {
          loaded.push({
            id: candidate.id,
            version: candidate.version,
            registrations: [],
            hooks: {},
          });
        }
      }
      return { loaded, failed } as LoadReport;
    },
    host: { barynt: "1.2.0", sdk: "0.1.0" },
    services: (plugin, manifest) => {
      calls.services.push(plugin.id);
      calls.manifests.push(manifest);
      return {
        storage: {},
        events: {},
        jobs: { enqueue: async () => {} },
        user: { current: async () => null },
        workspace: { current: async () => null },
        settings: {
          current: async () => null,
          ofProject: async () => null,
        },
      };
    },
    now: () => clock.now,
    log: (message) => calls.log.push(message),
    ...overrides,
  };
  return { deps, state, calls, clock, data: d };
}

/** A promise that is settled from outside, to hold a build in the middle. */
function deferred<T = void>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

const statusOf = (snapshot: RegistrySnapshot, id: string) =>
  snapshot.plugins.find((plugin) => plugin.id === id)?.status;

let h: Harness;
beforeEach(() => {
  h = harness();
});

const registry = () => createPluginRegistry(h.deps, h.state);

describe("plugins are off", () => {
  it("without a directory: no plugins, and neither the database nor the disk is asked", async () => {
    h = harness({}, { dir: null });
    const snapshot = await registry().get();
    expect(snapshot.dir).toBeNull();
    expect(snapshot.problem).toBeNull();
    expect(snapshot.plugins).toEqual([]);
    expect(snapshot.active).toEqual([]);
    expect(h.calls.installed).toBe(0);
    expect(h.calls.discover).toBe(0);
    expect(h.calls.activeStores).toBe(0);
    expect(h.calls.load).toEqual([]);
  });

  it("with a directory that is not usable: no plugins, and the reason", async () => {
    h = harness(
      {},
      { dir: null, dirProblem: "BARYNT_PLUGINS_DIR must be absolute" },
    );
    const snapshot = await registry().get();
    expect(snapshot.problem).toContain("absolute");
    expect(snapshot.active).toEqual([]);
    expect(h.calls.installed).toBe(0);
  });
});

describe("a plugin directory nobody named", () => {
  const MISSING = "/home/barynt/.barynt/plugins: cannot be read (ENOENT)";

  it("is fine when it is not there: no plugins yet, and nothing to report", async () => {
    h = harness(
      {},
      {
        dir: "/home/barynt/.barynt/plugins",
        implicit: true,
        rootMissing: true,
        issues: [MISSING],
        installed: [],
        discovered: [],
      },
    );
    const snapshot = await registry().get();
    expect(snapshot.dir).toBe("/home/barynt/.barynt/plugins");
    expect(snapshot.problem).toBeNull();
    expect(snapshot.discoveryIssues).toEqual([]);
    expect(snapshot.plugins).toEqual([]);
  });

  it("is a problem when it was named and is not there", async () => {
    h = harness(
      {},
      {
        dir: "/data/plugins",
        implicit: false,
        rootMissing: true,
        issues: ["/data/plugins: cannot be read (ENOENT)"],
        installed: [],
        discovered: [],
      },
    );
    expect((await registry().get()).discoveryIssues).toEqual([
      "/data/plugins: cannot be read (ENOENT)",
    ]);
  });

  it("still shows plugins that are installed but lost with the directory, as missing", async () => {
    h = harness(
      {},
      {
        dir: "/home/barynt/.barynt/plugins",
        implicit: true,
        rootMissing: true,
        issues: [MISSING],
        installed: [row("calendar")],
        discovered: [],
      },
    );
    const snapshot = await registry().get();
    expect(statusOf(snapshot, "calendar")).toEqual({ state: "missing" });
    expect(snapshot.discoveryIssues).toEqual([]);
  });

  it("keeps what discovery found wrong inside a default directory that exists", async () => {
    h = harness(
      {},
      {
        dir: "/home/barynt/.barynt/plugins",
        implicit: true,
        rootMissing: false,
        issues: ["/home/barynt/.barynt/plugins/Foo: not a valid plugin id"],
      },
    );
    expect((await registry().get()).discoveryIssues).toHaveLength(1);
  });

  it("loads plugins from it like from any other", async () => {
    h = harness({}, { dir: "/home/barynt/.barynt/plugins", implicit: true });
    expect(statusOf(await registry().get(), "calendar")).toMatchObject({
      state: "loaded",
    });
  });
});

describe("building the snapshot", () => {
  it("runs a plugin that is fine, and records how it may run", async () => {
    const snapshot = await registry().get();
    expect(snapshot.dir).toBe("/plugins");
    expect(snapshot.problem).toBeNull();
    expect(statusOf(snapshot, "calendar")).toEqual({
      state: "loaded",
      mode: "declarative",
    });
    expect(snapshot.active).toEqual([
      {
        id: "calendar",
        version: "1.0.0",
        scope: "WORKSPACE",
        mode: "declarative",
        registrations: [],
        hooks: {},
      },
    ]);
  });

  it("keeps the lifecycle hooks a plugin has, the very ones the loader reported", async () => {
    const onEnable = () => {};
    const hooks = Object.freeze({ onEnable });
    h = harness({
      load: async (candidates) =>
        ({
          loaded: candidates.map((c) => ({
            id: c.id,
            version: c.version,
            registrations: [],
            hooks,
          })),
          failed: new Map(),
        }) as unknown as LoadReport,
    });
    const active = (await registry().get()).active;
    expect(active[0]?.hooks).toBe(hooks);
    expect(active[0]?.hooks.onEnable).toBe(onEnable);
  });

  it("gives the loader the host's versions and only the plugins the plan let through", async () => {
    h = harness(
      {},
      {
        installed: [
          row("calendar"),
          row("sleeping", { status: "DISABLED" }),
          row("forgotten"),
        ],
        discovered: [found("calendar"), found("sleeping"), found("forgotten")],
        enabledSomewhere: new Set(["calendar"]),
      },
    );
    await registry().get();
    expect(h.calls.load).toHaveLength(1);
    expect(h.calls.load[0]?.map((c) => c.id)).toEqual(["calendar"]);
    expect(h.calls.loadOptions[0]?.host).toEqual({
      barynt: "1.2.0",
      sdk: "0.1.0",
    });
  });

  it("does not call the loader at all when nothing is to be loaded", async () => {
    h = harness({}, { installed: [], discovered: [] });
    const snapshot = await registry().get();
    expect(h.calls.load).toEqual([]);
    expect(snapshot.plugins).toEqual([]);
  });

  it("lists every installed plugin with what became of it, by id", async () => {
    h = harness(
      {},
      {
        installed: [
          row("zulu"),
          row("alpha", { status: "DISABLED" }),
          row("mike"),
          row("bravo", { source: "UPLOAD", origin: null }),
          row("gone"),
        ],
        discovered: [
          found("zulu"),
          found("alpha"),
          found("mike", { barynt: ">=9.0.0" }),
          found("bravo"),
        ],
        enabledSomewhere: new Set(["zulu", "mike", "bravo", "gone"]),
      },
    );
    const snapshot = await registry().get();
    expect(snapshot.plugins.map((p) => p.id)).toEqual([
      "alpha",
      "bravo",
      "gone",
      "mike",
      "zulu",
    ]);
    expect(statusOf(snapshot, "alpha")).toEqual({ state: "disabled" });
    expect(statusOf(snapshot, "bravo")).toEqual({
      state: "blocked",
      reason: "unsigned-not-allowed",
    });
    expect(statusOf(snapshot, "gone")).toEqual({ state: "missing" });
    expect(statusOf(snapshot, "mike")).toMatchObject({ state: "incompatible" });
    expect(statusOf(snapshot, "zulu")).toMatchObject({ state: "loaded" });
    expect(snapshot.active.map((p) => p.id)).toEqual(["zulu"]);
  });

  it("carries what discovery found wrong with the directory", async () => {
    h = harness({}, { issues: ["/plugins/Foo: not a valid plugin id"] });
    const snapshot = await registry().get();
    expect(snapshot.discoveryIssues).toEqual([
      "/plugins/Foo: not a valid plugin id",
    ]);
  });

  it("uses the stores and the setting for unsigned plugins as they are when it builds", async () => {
    h = harness(
      {},
      {
        installed: [row("upload", { source: "UPLOAD", origin: null })],
        discovered: [found("upload")],
        enabledSomewhere: new Set(["upload"]),
        allowUnsigned: true,
      },
    );
    expect(statusOf(await registry().get(), "upload")).toMatchObject({
      state: "loaded",
    });
  });

  it("does not let a plugin with code run: nothing records an approval yet", async () => {
    h = harness(
      {},
      {
        installed: [row("coded")],
        discovered: [found("coded", { server: "server.js" })],
        enabledSomewhere: new Set(["coded"]),
      },
    );
    const snapshot = await registry().get();
    expect(statusOf(snapshot, "coded")).toEqual({
      state: "blocked",
      reason: "not-approved",
    });
    expect(h.calls.load).toEqual([]);
    expect(snapshot.active).toEqual([]);
  });
});

describe("while plugins load", () => {
  it("counts a load as running while the loader runs, and only then", async () => {
    const seen: number[] = [];
    h = harness({
      load: async (candidates) => {
        seen.push(h.state.loading);
        return {
          loaded: candidates.map((c) => ({
            id: c.id,
            version: c.version,
            registrations: [],
            hooks: {},
          })),
          failed: new Map(),
        };
      },
    });
    expect(h.state.loading).toBe(0);
    await registry().get();
    expect(seen).toEqual([1]);
    expect(h.state.loading).toBe(0);
  });

  it("counts it down again when the loader throws", async () => {
    h = harness({
      load: async () => {
        throw new Error("boom");
      },
    });
    const snapshot = await registry().get();
    expect(snapshot.problem).toContain("boom");
    expect(h.state.loading).toBe(0);
  });

  it("does not count a load when there is nothing to load", async () => {
    const seen: number[] = [];
    h = harness(
      {
        load: async () => {
          seen.push(h.state.loading);
          return { loaded: [], failed: new Map() };
        },
      },
      { installed: [], discovered: [] },
    );
    await registry().get();
    expect(seen).toEqual([]);
    expect(h.state.loading).toBe(0);
  });
});

describe("what the loader says", () => {
  it("records a plugin it refused, with the phase and the message, and does not run it", async () => {
    h.data.refuse.set("calendar", { phase: "import", message: "boom" });
    const snapshot = await registry().get();
    expect(statusOf(snapshot, "calendar")).toEqual({
      state: "failed",
      phase: "import",
      message: "boom",
    });
    expect(snapshot.active).toEqual([]);
  });

  it("keeps the others when one is refused", async () => {
    h = harness(
      {},
      {
        installed: [row("alpha"), row("bravo")],
        discovered: [found("alpha"), found("bravo")],
        enabledSomewhere: new Set(["alpha", "bravo"]),
      },
    );
    h.data.refuse.set("alpha", { phase: "boot", message: "no" });
    const snapshot = await registry().get();
    expect(snapshot.active.map((p) => p.id)).toEqual(["bravo"]);
    expect(statusOf(snapshot, "alpha")).toMatchObject({ state: "failed" });
  });

  it("treats a plugin the loader neither loaded nor blamed as failed, never as running", async () => {
    h = harness({
      load: async () => ({ loaded: [], failed: new Map() }),
    });
    const snapshot = await registry().get();
    expect(statusOf(snapshot, "calendar")).toMatchObject({ state: "failed" });
    expect(snapshot.active).toEqual([]);
  });
});

describe("one build serves everyone", () => {
  it("builds once and keeps the snapshot", async () => {
    const r = registry();
    const first = await r.get();
    const second = await r.get();
    expect(second).toBe(first);
    expect(h.calls.installed).toBe(1);
    expect(h.calls.load).toHaveLength(1);
  });

  it("does not start a second build for requests that arrive while one runs", async () => {
    const gate = deferred();
    h = harness({
      installed: async () => {
        h.calls.installed += 1;
        await gate.promise;
        return {
          plugins: [row("calendar")],
          enabledSomewhere: new Set(["calendar"]),
        };
      },
    });
    const r = registry();
    const pending = Promise.all([r.get(), r.get(), r.get(), r.get()]);
    gate.resolve();
    const snapshots = await pending;
    expect(h.calls.installed).toBe(1);
    expect(new Set(snapshots).size).toBe(1);
  });

  it("shares the snapshot through the state, as two bundled copies of the registry do", async () => {
    const one = createPluginRegistry(h.deps, h.state);
    const other = createPluginRegistry(h.deps, h.state);
    const first = await one.get();
    expect(await other.get()).toBe(first);
    expect(h.calls.installed).toBe(1);
  });
});

describe("when the plugins change", () => {
  it("builds again for the next request, and serves nothing old in between", async () => {
    const r = registry();
    expect(statusOf(await r.get(), "calendar")).toMatchObject({
      state: "loaded",
    });
    h.data.allowUnsigned = false;
    h.data.installed = [row("calendar", { status: "DISABLED" })];
    r.invalidate();
    expect(h.state.snapshot).toBeNull();
    const after = await r.get();
    expect(statusOf(after, "calendar")).toEqual({ state: "disabled" });
    expect(after.active).toEqual([]);
    expect(h.calls.installed).toBe(2);
  });

  it("is what invalidatePluginRegistry does, from wherever it is called", async () => {
    await registry().get();
    invalidatePluginRegistry(h.state);
    expect(h.state.snapshot).toBeNull();
    await registry().get();
    expect(h.calls.installed).toBe(2);
  });

  it("does not serve a build that a change overtook", async () => {
    const gate = deferred();
    let call = 0;
    h = harness({
      installed: async () => {
        call += 1;
        const mine = call;
        if (mine === 1) await gate.promise;
        // The first build reads a plugin that is switched on, the second one
        // reads that it is switched off.
        return {
          plugins: [
            row("calendar", { status: mine === 1 ? "ENABLED" : "DISABLED" }),
          ],
          enabledSomewhere: new Set(["calendar"]),
        };
      },
    });
    const r = registry();
    const pending = r.get();
    // A store is switched off while the first build is still reading.
    r.invalidate();
    gate.resolve();
    const snapshot = await pending;
    expect(statusOf(snapshot, "calendar")).toEqual({ state: "disabled" });
    expect(snapshot.active).toEqual([]);
    expect(call).toBe(2);
  });

  it("keeps nothing rather than something stale when it keeps changing", async () => {
    let r!: ReturnType<typeof registry>;
    h = harness({
      installed: async () => {
        r.invalidate();
        return {
          plugins: [row("calendar")],
          enabledSomewhere: new Set(["calendar"]),
        };
      },
    });
    r = registry();
    const snapshot = await r.get();
    expect(snapshot.active).toEqual([]);
    expect(snapshot.problem).toContain("kept changing");
  });
});

describe("failing closed", () => {
  it("is no plugins, with the reason and a log line, when the build fails as a whole", async () => {
    h = harness({
      installed: async () => {
        throw new Error("connection lost");
      },
    });
    const snapshot = await registry().get();
    expect(snapshot.active).toEqual([]);
    expect(snapshot.problem).toContain("connection lost");
    expect(h.calls.log.join("\n")).toContain("connection lost");
  });

  it("does not fall back to the last good snapshot when the next build fails", async () => {
    let fail = false;
    h = harness({
      installed: async () => {
        h.calls.installed += 1;
        if (fail) throw new Error("connection lost");
        return {
          plugins: [row("calendar")],
          enabledSomewhere: new Set(["calendar"]),
        };
      },
    });
    const r = registry();
    expect((await r.get()).active).toHaveLength(1);
    fail = true;
    r.invalidate();
    const snapshot = await r.get();
    expect(snapshot.active).toEqual([]);
    expect(snapshot.problem).toContain("connection lost");
  });

  it("tries again after a while, not on every request", async () => {
    let fail = true;
    h = harness({
      installed: async () => {
        h.calls.installed += 1;
        if (fail) throw new Error("connection lost");
        return {
          plugins: [row("calendar")],
          enabledSomewhere: new Set(["calendar"]),
        };
      },
    });
    const r = registry();
    await r.get();
    await r.get();
    await r.get();
    expect(h.calls.installed).toBe(1);

    fail = false;
    h.clock.now += RETRY_AFTER_FAILURE_MS - 1;
    expect((await r.get()).active).toEqual([]);
    expect(h.calls.installed).toBe(1);

    h.clock.now += 1;
    expect((await r.get()).active).toHaveLength(1);
    expect(h.calls.installed).toBe(2);
  });

  it("does not keep a failure that a change has since replaced", async () => {
    h = harness({
      installed: async () => {
        h.calls.installed += 1;
        throw new Error("nope");
      },
    });
    const r = registry();
    await r.get();
    r.invalidate();
    expect(h.state.failedAt).toBeNull();
  });

  it("start never throws, whatever goes wrong", async () => {
    h = harness({
      pluginsDir: () => {
        throw new Error("environment unreadable");
      },
    });
    await expect(registry().start()).resolves.toBeUndefined();
    expect(h.calls.log.join("\n")).toContain("environment unreadable");
  });

  it("start never throws even when the clock does", async () => {
    // The failure path itself needs the time, so this is a failure inside the failure.
    h = harness({
      installed: async () => {
        throw new Error("connection lost");
      },
      now: () => {
        throw new Error("no clock");
      },
    });
    await expect(registry().start()).resolves.toBeUndefined();
    expect(h.calls.log.join("\n")).toContain("no clock");
  });

  it("start builds the snapshot, so the first request finds it there", async () => {
    await registry().start();
    expect(h.state.snapshot).not.toBeNull();
    await registry().get();
    expect(h.calls.installed).toBe(1);
  });
});

describe("boot runs once per process", () => {
  it("does not boot again a plugin that booted, when the registry is built again", async () => {
    const r = registry();
    await r.get();
    // The first time nothing had booted.
    expect(h.calls.booted[0]).toEqual({ "calendar@1.0.0": false });

    r.invalidate();
    await r.get();
    expect(h.calls.booted[1]).toEqual({ "calendar@1.0.0": true });
  });

  it("does boot a version that has not booted yet", async () => {
    const r = registry();
    await r.get();
    h.data.installed = [row("calendar", { version: "1.1.0" })];
    h.data.discovered = [
      {
        ...found("calendar"),
        version: "1.1.0",
        dir: "/plugins/calendar/1.1.0",
        manifest: {
          ...(found("calendar") as { manifest: object }).manifest,
          version: "1.1.0",
        },
      } as DiscoveredPlugin,
    ];
    r.invalidate();
    await r.get();
    expect(h.calls.booted[1]).toEqual({ "calendar@1.1.0": false });
  });

  it("does not count a plugin as booted when it failed, while another one did boot", async () => {
    h = harness(
      {},
      {
        installed: [row("alpha"), row("bravo")],
        discovered: [found("alpha"), found("bravo")],
        enabledSomewhere: new Set(["alpha", "bravo"]),
      },
    );
    h.data.refuse.set("alpha", { phase: "boot", message: "no" });
    const r = registry();
    await r.get();
    h.data.refuse.clear();
    r.invalidate();
    await r.get();
    // `bravo` booted and is not booted again; `alpha` failed, so it may boot now.
    expect(h.calls.booted[1]).toEqual({
      "alpha@1.0.0": false,
      "bravo@1.0.0": true,
    });
  });

  it("keeps a plugin as booted that a build booted, even if a change overtook that build and it was thrown away", async () => {
    // The plugin booted in that build, and the runtime cannot take that back, so it
    // is not booted again: what a discarded build did stays done.
    const gate = deferred();
    let first = true;
    h = harness({
      installed: async () => {
        if (first) {
          first = false;
          await gate.promise;
        }
        return {
          plugins: [row("calendar")],
          enabledSomewhere: new Set(["calendar"]),
        };
      },
    });
    const r = registry();
    const pending = r.get();
    r.invalidate();
    gate.resolve();
    await pending;
    expect(h.calls.booted[0]).toEqual({ "calendar@1.0.0": false });
    expect(h.calls.booted[1]).toEqual({ "calendar@1.0.0": true });
  });

  it("gives the services to the loader one plugin at a time, with the manifest that was loaded", async () => {
    await registry().get();
    const services = h.calls.loadOptions[0]?.services;
    const manifest = { scope: "project", contributes: { settings: [] } };
    services?.({ id: "calendar", version: "1.0.0" }, manifest as never);
    expect(h.calls.services).toEqual(["calendar"]);
    expect(h.calls.manifests[0]).toBe(manifest);
  });
});

describe("which plugins apply in a workspace", () => {
  const snapshot = (active: RegistrySnapshot["active"]): RegistrySnapshot => ({
    builtAt: 0,
    dir: "/plugins",
    problem: null,
    discoveryIssues: [],
    plugins: [],
    active,
  });
  const running = (
    id: string,
    scope: "WORKSPACE" | "PLATFORM" | "PROJECT",
  ) => ({
    id,
    version: "1.0.0",
    scope,
    mode: "declarative" as const,
    registrations: [],
    hooks: {},
  });

  it("is every platform plugin and each workspace plugin the workspace switched on", () => {
    const result = activePluginsIn(
      snapshot([
        running("everywhere", "PLATFORM"),
        running("chosen", "WORKSPACE"),
        running("other-workspace", "WORKSPACE"),
      ]),
      new Set(["chosen"]),
    );
    expect(result.map((p) => p.id)).toEqual(["everywhere", "chosen"]);
  });

  it("never counts a plugin that applies per project as a workspace's, whatever the workspace switched on", () => {
    const result = activePluginsIn(
      snapshot([
        running("everywhere", "PLATFORM"),
        running("chosen", "WORKSPACE"),
        running("per-project", "PROJECT"),
      ]),
      new Set(["chosen", "per-project"]),
    );
    expect(result.map((p) => p.id)).toEqual(["everywhere", "chosen"]);
  });

  it("leaves out a plugin that runs only because another one needs it", () => {
    const result = activePluginsIn(
      snapshot([
        running("dependency", "WORKSPACE"),
        running("top", "WORKSPACE"),
      ]),
      new Set(["top"]),
    );
    expect(result.map((p) => p.id)).toEqual(["top"]);
  });

  it("is nothing when nothing runs, however many workspaces switched things on", () => {
    expect(activePluginsIn(snapshot([]), new Set(["chosen"]))).toEqual([]);
  });

  it("keeps the order in which the plugins loaded", () => {
    const result = activePluginsIn(
      snapshot([running("b", "PLATFORM"), running("a", "PLATFORM")]),
      new Set(),
    );
    expect(result.map((p) => p.id)).toEqual(["b", "a"]);
  });
});

describe("the plugins that apply in a project", () => {
  const snapshot = (active: ReturnType<typeof running>[]) => ({
    builtAt: 0,
    dir: "/plugins",
    problem: null,
    discoveryIssues: [],
    plugins: [],
    active,
  });
  const running = (
    id: string,
    scope: "WORKSPACE" | "PLATFORM" | "PROJECT",
  ) => ({
    id,
    version: "1.0.0",
    scope,
    mode: "declarative" as const,
    registrations: [],
    hooks: {},
  });

  it("is what applies in its workspace and each project plugin the project switched on", () => {
    const result = activePluginsInProject(
      snapshot([
        running("everywhere", "PLATFORM"),
        running("chosen", "WORKSPACE"),
        running("other-workspace", "WORKSPACE"),
        running("board", "PROJECT"),
        running("other-project", "PROJECT"),
      ]),
      new Set(["chosen"]),
      new Set(["board"]),
    );
    expect(result.map((p) => p.id)).toEqual(["everywhere", "chosen", "board"]);
  });

  it("does not take a plugin for the other level's whatever the sets hold", () => {
    const result = activePluginsInProject(
      snapshot([
        running("workspace-plugin", "WORKSPACE"),
        running("project-plugin", "PROJECT"),
      ]),
      new Set(["project-plugin"]),
      new Set(["workspace-plugin"]),
    );
    expect(result).toEqual([]);
  });

  it("leaves out a plugin that runs only because another one needs it", () => {
    const result = activePluginsInProject(
      snapshot([running("dependency", "PROJECT"), running("top", "PROJECT")]),
      new Set(),
      new Set(["top"]),
    );
    expect(result.map((p) => p.id)).toEqual(["top"]);
  });

  it("is nothing when nothing runs", () => {
    expect(
      activePluginsInProject(snapshot([]), new Set(["a"]), new Set(["b"])),
    ).toEqual([]);
  });

  it("keeps the order in which the plugins loaded", () => {
    const result = activePluginsInProject(
      snapshot([
        running("b", "PROJECT"),
        running("a", "PLATFORM"),
        running("c", "WORKSPACE"),
      ]),
      new Set(["c"]),
      new Set(["b"]),
    );
    expect(result.map((p) => p.id)).toEqual(["b", "a", "c"]);
  });

  it("is what a workspace gets, for a workspace: a project's plugins are not among them", () => {
    const result = activePluginsIn(
      snapshot([running("board", "PROJECT"), running("chosen", "WORKSPACE")]),
      new Set(["chosen", "board"]),
    );
    expect(result.map((p) => p.id)).toEqual(["chosen"]);
  });
});

describe("the state that is shared", () => {
  it("is one object for the whole process", () => {
    expect(getRegistryState()).toBe(getRegistryState());
  });

  it("is reset by an invalidation, except for what booted", () => {
    const state = createRegistryState();
    state.snapshot = {
      builtAt: 0,
      dir: null,
      problem: null,
      discoveryIssues: [],
      plugins: [],
      active: [],
    };
    state.failedAt = 5;
    state.booted.add("calendar@1.0.0");
    invalidatePluginRegistry(state);
    expect(state.snapshot).toBeNull();
    expect(state.failedAt).toBeNull();
    expect(state.generation).toBe(1);
    expect(state.booted.has("calendar@1.0.0")).toBe(true);
  });
});
