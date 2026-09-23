import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type LoadCandidate,
  type LoadOptions,
  type LoadReport,
  loadPlugins,
} from "@/lib/plugins/loader";
import { validateManifest } from "@/lib/plugins/validate";

// The loader runs plugin code inside the app, so what matters is what it does
// when that code misbehaves: throws, hangs, registers what it may not, or leans
// on a plugin that failed. These tests write real plugin directories with real
// JavaScript modules and load them. No database.

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-loader-"));
  trace().length = 0;
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

/** Plugin modules and the test's services write here, to show what ran and in what order. */
function trace(): string[] {
  const g = globalThis as { __barynt_trace?: string[] };
  g.__barynt_trace ??= [];
  return g.__barynt_trace;
}

const T = "globalThis.__barynt_trace";

interface PluginSpec {
  /** The source of `server.js`. Without it the plugin has no server code. */
  code?: string;
  version?: string;
  dependencies?: Record<string, string>;
  contributes?: Record<string, { id: string }[]>;
}

/** Writes `<root>/<id>/<version>/` and returns what `loadPlugins` takes. */
async function plugin(
  id: string,
  spec: PluginSpec = {},
): Promise<LoadCandidate> {
  const version = spec.version ?? "1.0.0";
  const dir = join(root, id, version);
  await mkdir(dir, { recursive: true });
  const result = validateManifest({
    manifestVersion: 1,
    id,
    name: id,
    version,
    description: "A test plugin",
    author: "Someone",
    license: "MIT",
    categories: ["other"],
    barynt: "^0.1.0",
    dependencies: spec.dependencies ?? {},
    contributes: spec.contributes ?? {},
    ...(spec.code === undefined ? {} : { server: "server.js" }),
  });
  if (!result.ok)
    throw new Error(`bad test manifest: ${result.issues[0]?.message}`);
  if (spec.code !== undefined) {
    await writeFile(join(dir, "server.js"), spec.code);
  }
  return { id, version, dir, manifest: result.manifest };
}

const HOST = { barynt: "0.1.0", sdk: "0.1.0" };

function options(more: Partial<LoadOptions> = {}): LoadOptions {
  return {
    host: HOST,
    services: (info) => ({
      storage: {},
      events: {},
      jobs: {
        enqueue: async (jobId) => {
          trace().push(`enqueue:${info.id}:${jobId}`);
        },
      },
      user: { current: async () => null },
      workspace: { current: async () => null },
    }),
    importTimeoutMs: 2000,
    bootTimeoutMs: 2000,
    ...more,
  };
}

function ids(report: LoadReport): string[] {
  return report.loaded.map((p) => p.id);
}

function why(report: LoadReport, id: string) {
  return report.failed.get(id);
}

/** A module that records that it was imported, registered and booted. */
const tracing = (id: string, body = "") => `
${T} ??= [];
${T}.push("import:${id}");
export default {
  register(ctx) { ${T}.push("register:${id}"); ${body} },
  boot() { ${T}.push("boot:${id}"); },
};`;

describe("a plugin that works", () => {
  it("is imported, registered and booted, and its registrations are reported", async () => {
    const a = await plugin("calendar", {
      contributes: { jobs: [{ id: "sync" }], settings: [{ id: "api-key" }] },
      code: tracing(
        "calendar",
        `ctx.registerJob("sync", { run() {} }); ctx.registerSetting("api-key", {});`,
      ),
    });
    const report = await loadPlugins([a], options());
    expect(report.failed.size).toBe(0);
    expect(report.loaded).toHaveLength(1);
    expect(report.loaded[0]).toMatchObject({
      id: "calendar",
      version: "1.0.0",
    });
    expect(
      report.loaded[0]?.registrations.map((r) => `${r.point}:${r.id}`),
    ).toEqual(["jobs:sync", "settings:api-key"]);
    expect(trace()).toEqual([
      "import:calendar",
      "register:calendar",
      "boot:calendar",
    ]);
  });

  it("registers every plugin before it boots any", async () => {
    const a = await plugin("alpha", { code: tracing("alpha") });
    const b = await plugin("beta", { code: tracing("beta") });
    await loadPlugins([a, b], options());
    expect(trace().filter((t) => !t.startsWith("import"))).toEqual([
      "register:alpha",
      "register:beta",
      "boot:alpha",
      "boot:beta",
    ]);
  });

  it("gives register and boot the plugin, the host and the services, bound to the plugin", async () => {
    const a = await plugin("calendar", {
      contributes: { jobs: [{ id: "sync" }] },
      code: `
${T} ??= [];
export default {
  register(ctx) {
    ${T}.push("register:" + ctx.plugin.id + "@" + ctx.plugin.version + " host " + ctx.host.barynt + "/" + ctx.host.sdk);
    ${T}.push("frozen:" + Object.isFrozen(ctx) + "," + Object.isFrozen(ctx.plugin));
  },
  async boot(ctx) {
    ${T}.push("boot keys:" + Object.keys(ctx).sort().join(","));
    await ctx.jobs.enqueue("sync");
    ${T}.push("user:" + (await ctx.user.current()));
  },
};`,
    });
    await loadPlugins([a], options());
    expect(trace()).toEqual([
      "register:calendar@1.0.0 host 0.1.0/0.1.0",
      "frozen:true,true",
      "boot keys:events,host,jobs,plugin,storage,user,workspace",
      "enqueue:calendar:sync",
      "user:null",
    ]);
  });

  it("does not hand the plugin more than the five services", async () => {
    const a = await plugin("calendar", {
      code: `${T} ??= []; export default { boot(ctx) { ${T}.push(String(ctx.secret)); } };`,
    });
    await loadPlugins(
      [a],
      options({
        services: () =>
          ({
            storage: {},
            events: {},
            jobs: { enqueue: async () => {} },
            user: { current: async () => null },
            workspace: { current: async () => null },
            secret: "the database handle",
          }) as never,
      }),
    );
    expect(trace()).toEqual(["undefined"]);
  });

  it("loads a plugin with only register, or only boot", async () => {
    const a = await plugin("only-register", {
      code: `export default { register() {} };`,
    });
    const b = await plugin("only-boot", {
      code: `export default { boot() {} };`,
    });
    const report = await loadPlugins([a, b], options());
    expect(ids(report)).toEqual(["only-register", "only-boot"]);
  });

  it("loads a plugin without server code, and it can be depended on", async () => {
    const base = await plugin("declarative");
    const user = await plugin("calendar", {
      dependencies: { declarative: "^1.0.0" },
      code: tracing("calendar"),
    });
    const report = await loadPlugins([base, user], options());
    expect(ids(report)).toEqual(["declarative", "calendar"]);
    expect(report.loaded[0]?.registrations).toEqual([]);
  });

  it("returns nothing for nothing", async () => {
    const report = await loadPlugins([], options());
    expect(report.loaded).toEqual([]);
    expect(report.failed.size).toBe(0);
  });
});

describe("what a plugin may register", () => {
  const all = {
    settings: [{ id: "s" }],
    permissions: [{ id: "p" }],
    events: [{ id: "e" }],
    jobs: [{ id: "j" }],
    webhooks: [{ id: "w" }],
    notifications: [{ id: "n" }],
    customFields: [{ id: "c" }],
  };

  it("has one method per server extension point", async () => {
    const a = await plugin("everything", {
      contributes: all,
      code: `export default { register(ctx) {
        ctx.registerSetting("s", {}); ctx.registerPermission("p", {});
        ctx.registerEventListener("e", {}); ctx.registerJob("j", {});
        ctx.registerWebhook("w", {}); ctx.registerNotification("n", {});
        ctx.registerCustomField("c", {});
      } };`,
    });
    const report = await loadPlugins([a], options());
    expect(
      report.loaded[0]?.registrations.map((r) => `${r.point}:${r.id}`),
    ).toEqual([
      "settings:s",
      "permissions:p",
      "events:e",
      "jobs:j",
      "webhooks:w",
      "notifications:n",
      "customFields:c",
    ]);
  });

  it("refuses an id the manifest does not list, and says which", async () => {
    const a = await plugin("calendar", {
      contributes: { jobs: [{ id: "sync" }] },
      code: `export default { register(ctx) { ctx.registerJob("other", {}); } };`,
    });
    const report = await loadPlugins([a], options());
    expect(ids(report)).toEqual([]);
    expect(why(report, "calendar")).toEqual({
      phase: "register",
      message:
        'jobs "other" is not listed under contributes.jobs in the manifest',
    });
  });

  it("refuses an id under the wrong point", async () => {
    const a = await plugin("calendar", {
      contributes: { jobs: [{ id: "sync" }] },
      code: `export default { register(ctx) { ctx.registerWebhook("sync", {}); } };`,
    });
    expect(why(await loadPlugins([a], options()), "calendar")?.phase).toBe(
      "register",
    );
  });

  it("refuses the same id twice", async () => {
    const a = await plugin("calendar", {
      contributes: { jobs: [{ id: "sync" }] },
      code: `export default { register(ctx) { ctx.registerJob("sync", {}); ctx.registerJob("sync", {}); } };`,
    });
    expect(
      why(await loadPlugins([a], options()), "calendar")?.message,
    ).toContain("registered twice");
  });

  it("refuses a definition that is not an object", async () => {
    const a = await plugin("calendar", {
      contributes: { jobs: [{ id: "sync" }] },
      code: `export default { register(ctx) { ctx.registerJob("sync", "run"); } };`,
    });
    expect(
      why(await loadPlugins([a], options()), "calendar")?.message,
    ).toContain("needs an object");
  });

  it("still refuses a plugin that catches the violation to carry on", async () => {
    const a = await plugin("calendar", {
      contributes: { jobs: [{ id: "sync" }] },
      code: `export default { register(ctx) {
        try { ctx.registerJob("nope", {}); } catch {}
        ctx.registerJob("sync", {});
      } };`,
    });
    const report = await loadPlugins([a], options());
    expect(ids(report)).toEqual([]);
    expect(why(report, "calendar")?.phase).toBe("register");
  });

  it("discards what a plugin registered before it failed", async () => {
    const a = await plugin("calendar", {
      contributes: { jobs: [{ id: "sync" }] },
      code: `export default { register(ctx) { ctx.registerJob("sync", {}); throw new Error("late"); } };`,
    });
    const report = await loadPlugins([a], options());
    expect(ids(report)).toEqual([]);
    expect(why(report, "calendar")).toEqual({
      phase: "register",
      message: "late",
    });
  });

  it("refuses a register that returns a promise, it has to be synchronous", async () => {
    const a = await plugin("calendar", {
      code: `export default { async register() { throw new Error("rejected later"); } };`,
    });
    const report = await loadPlugins([a], options());
    expect(why(report, "calendar")).toEqual({
      phase: "register",
      message: "register returned a promise, it has to be synchronous",
    });
  });

  it("does not let a plugin change the context it was given", async () => {
    const a = await plugin("calendar", {
      code: `${T} ??= [];
export default { register(ctx) {
  try { ctx.registerJob = () => {}; ${T}.push("changed"); } catch { ${T}.push("refused"); }
} };`,
    });
    await loadPlugins([a], options());
    expect(trace()).toEqual(["refused"]);
  });
});

describe("the server file", () => {
  it("is reported when it does not exist", async () => {
    const a = await plugin("calendar", { code: "export default {};" });
    await rm(join(a.dir, "server.js"));
    expect(why(await loadPlugins([a], options()), "calendar")).toEqual({
      phase: "entry",
      message: "server.js does not exist",
    });
  });

  it("is reported when it is a directory", async () => {
    const a = await plugin("calendar", { code: "export default {};" });
    await rm(join(a.dir, "server.js"));
    await mkdir(join(a.dir, "server.js"));
    expect(why(await loadPlugins([a], options()), "calendar")).toEqual({
      phase: "entry",
      message: "server.js is not a file",
    });
  });

  it("is refused when a symlink leads out of the plugin directory", async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), "barynt-elsewhere-"));
    try {
      await writeFile(
        join(elsewhere, "evil.js"),
        `${T} ??= []; ${T}.push("evil ran"); export default { register() {} };`,
      );
      const a = await plugin("calendar", { code: "export default {};" });
      await rm(join(a.dir, "server.js"));
      await symlink(join(elsewhere, "evil.js"), join(a.dir, "server.js"));
      const report = await loadPlugins([a], options());
      expect(why(report, "calendar")).toEqual({
        phase: "entry",
        message: "server.js leads out of the plugin directory",
      });
      expect(trace()).toEqual([]);
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });

  it("may be a symlink that stays inside the plugin directory", async () => {
    const a = await plugin("calendar", { code: "export default {};" });
    await rm(join(a.dir, "server.js"));
    await writeFile(
      join(a.dir, "real.js"),
      "export default { register() {} };",
    );
    await symlink(join(a.dir, "real.js"), join(a.dir, "server.js"));
    expect(ids(await loadPlugins([a], options()))).toEqual(["calendar"]);
  });
});

describe("importing the module", () => {
  it("reports a syntax error as an import failure", async () => {
    const a = await plugin("calendar", { code: "export default {{{" });
    const failure = why(await loadPlugins([a], options()), "calendar");
    expect(failure?.phase).toBe("import");
    expect(failure?.message.length).toBeGreaterThan(0);
  });

  it("reports code that throws when it is imported", async () => {
    const a = await plugin("calendar", {
      code: `throw new Error("cannot start"); export default {};`,
    });
    expect(why(await loadPlugins([a], options()), "calendar")).toEqual({
      phase: "import",
      message: "cannot start",
    });
  });

  it("stops waiting for a module that never finishes importing", async () => {
    const a = await plugin("calendar", {
      code: `await new Promise(() => {}); export default {};`,
    });
    const report = await loadPlugins([a], options({ importTimeoutMs: 100 }));
    expect(why(report, "calendar")).toEqual({
      phase: "import",
      message: "importing the module took longer than 100 ms",
    });
  });

  it.each([
    [
      "no default export",
      `export const register = () => {};`,
      "no default export",
    ],
    [
      "a function as the default",
      `export default function () {}`,
      "is a function",
    ],
    [
      "an unknown hook",
      `export default { register() {}, bot() {} };`,
      "not a known hook",
    ],
    ["nothing at all", `export default {};`, "neither register nor boot"],
  ])("reports %s as a module failure", async (_name, code, text) => {
    const a = await plugin("calendar", { code });
    const failure = why(await loadPlugins([a], options()), "calendar");
    expect(failure?.phase).toBe("module");
    expect(failure?.message).toContain(text);
  });
});

describe("boot", () => {
  it.each([
    ["throws", `export default { boot() { throw new Error("no boot"); } };`],
    [
      "rejects",
      `export default { async boot() { throw new Error("no boot"); } };`,
    ],
  ])(
    "reports a boot that %s and drops what the plugin registered",
    async (_name, code) => {
      const a = await plugin("calendar", { code });
      const report = await loadPlugins([a], options());
      expect(ids(report)).toEqual([]);
      expect(why(report, "calendar")).toEqual({
        phase: "boot",
        message: "no boot",
      });
    },
  );

  it("stops waiting for a boot that never finishes", async () => {
    const a = await plugin("calendar", {
      code: `export default { boot() { return new Promise(() => {}); } };`,
    });
    const report = await loadPlugins([a], options({ bootTimeoutMs: 100 }));
    expect(why(report, "calendar")).toEqual({
      phase: "boot",
      message: "boot took longer than 100 ms",
    });
  });

  it("reports a services factory that throws as a boot failure", async () => {
    const a = await plugin("calendar", {
      code: "export default { boot() {} };",
    });
    const report = await loadPlugins(
      [a],
      options({
        services: () => {
          throw new Error("no services");
        },
      }),
    );
    expect(why(report, "calendar")).toEqual({
      phase: "boot",
      message: "no services",
    });
  });
});

describe("one plugin failing", () => {
  it("does not stop the others", async () => {
    const good1 = await plugin("alpha", { code: tracing("alpha") });
    const bad = await plugin("beta", {
      code: `export default { register() { throw new Error("x"); } };`,
    });
    const good2 = await plugin("gamma", { code: tracing("gamma") });
    const report = await loadPlugins([good1, bad, good2], options());
    expect(ids(report)).toEqual(["alpha", "gamma"]);
    expect([...report.failed.keys()]).toEqual(["beta"]);
    expect(trace()).toContain("boot:alpha");
    expect(trace()).toContain("boot:gamma");
  });

  it("keeps a plugin that needs it from loading, and never imports it", async () => {
    const base = await plugin("base", {
      code: `export default { register() { throw new Error("x"); } };`,
    });
    const user = await plugin("calendar", {
      dependencies: { base: "^1.0.0" },
      code: tracing("calendar"),
    });
    const report = await loadPlugins([base, user], options());
    expect(why(report, "calendar")).toEqual({
      phase: "dependency",
      message: "needs base, which did not load",
    });
    // Its code did not run, not even the top level of the module.
    expect(trace()).toEqual([]);
  });

  it("passes it on, however deep", async () => {
    const a = await plugin("aaa", {
      code: `export default { register() { throw new Error("x"); } };`,
    });
    const b = await plugin("bbb", { dependencies: { aaa: "^1.0.0" } });
    const c = await plugin("ccc", {
      dependencies: { bbb: "^1.0.0" },
      code: tracing("ccc"),
    });
    const report = await loadPlugins([a, b, c], options());
    expect(ids(report)).toEqual([]);
    expect(why(report, "bbb")?.phase).toBe("dependency");
    expect(why(report, "ccc")?.message).toBe("needs bbb, which did not load");
    expect(trace()).toEqual([]);
  });

  it("also pulls back a plugin that had registered when its dependency failed to boot", async () => {
    const base = await plugin("base", {
      code: `export default { boot() { throw new Error("no boot"); } };`,
    });
    const user = await plugin("calendar", {
      dependencies: { base: "^1.0.0" },
      contributes: { jobs: [{ id: "sync" }] },
      code: tracing("calendar", `ctx.registerJob("sync", {});`),
    });
    const report = await loadPlugins([base, user], options());
    expect(ids(report)).toEqual([]);
    expect(why(report, "base")?.phase).toBe("boot");
    expect(why(report, "calendar")?.phase).toBe("dependency");
    // It had registered, but its boot never ran.
    expect(trace()).toEqual(["import:calendar", "register:calendar"]);
  });

  it("does not load a plugin listed before the plugin it needs", async () => {
    const base = await plugin("base");
    const user = await plugin("calendar", { dependencies: { base: "^1.0.0" } });
    const report = await loadPlugins([user, base], options());
    expect(ids(report)).toEqual(["base"]);
    expect(why(report, "calendar")?.phase).toBe("dependency");
  });
});

describe("the message of a failure", () => {
  it.each([
    ["a string", `throw "just text";`, "just text"],
    ["null", `throw null;`, "null"],
    ["undefined", `throw undefined;`, "undefined"],
    ["a plain object", `throw {};`, "[object Object]"],
    [
      "an object whose toString throws",
      `throw { toString() { throw new Error("no"); } };`,
      "unknown error",
    ],
    [
      "an error whose message throws",
      `const e = new Error("x"); Object.defineProperty(e, "message", { get() { throw new Error("no"); } }); throw e;`,
      "unknown error",
    ],
    ["an empty message", `throw new Error("");`, "unknown error"],
  ])("copes with %s being thrown", async (_name, statement, message) => {
    const a = await plugin("calendar", {
      code: `export default { register() { ${statement} } };`,
    });
    expect(why(await loadPlugins([a], options()), "calendar")?.message).toBe(
      message,
    );
  });

  it("keeps it to one short line without a stack trace", async () => {
    const a = await plugin("calendar", {
      code: `export default { register() { throw new Error("line one\\n   line two\\n" + "x".repeat(1000)); } };`,
    });
    const message =
      why(await loadPlugins([a], options()), "calendar")?.message ?? "";
    expect(message.startsWith("line one line two xxx")).toBe(true);
    expect(message.length).toBe(301);
    expect(message.endsWith("…")).toBe(true);
    expect(message).not.toContain("\n");
    expect(message).not.toContain("    at ");
  });
});
