import { describe, expect, it } from "bun:test";
import { definePlugin } from "@barynt/plugin-sdk";
import { parsePluginModule } from "@/lib/plugins/definition";

// `parsePluginModule` reads what `import(pluginServerFile)` returned. That is
// plugin code the host does not control, so it must always answer and never
// throw. Pure logic, no database.

function issuesOf(mod: unknown): string[] {
  const result = parsePluginModule(mod);
  if (result.ok) throw new Error("expected the module to be refused");
  return result.issues;
}

describe("a plugin module", () => {
  it("is found in a real ES module, other exports are ignored", async () => {
    const mod = await import("./fixtures/hello-plugin");
    const result = parsePluginModule(mod);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(typeof result.definition.register).toBe("function");
    expect(typeof result.definition.boot).toBe("function");
  });

  it.each([
    ["both phases", { register() {}, boot() {} }],
    ["only register", { register() {} }],
    ["only boot", { async boot() {} }],
  ])("is accepted with %s", (_name, definition) => {
    const result = parsePluginModule({ default: definePlugin(definition) });
    expect(result.ok).toBe(true);
  });

  it("is accepted when frozen", () => {
    const definition = Object.freeze({ register() {} });
    expect(parsePluginModule({ default: definition }).ok).toBe(true);
  });
});

describe("a module that is not a plugin", () => {
  it.each([null, undefined, "text", 5, true])(
    "refuses %j as not an ES module",
    (mod) => {
      expect(issuesOf(mod)).toEqual([
        "the module did not load as an ES module",
      ]);
    },
  );

  it("says what to write when there is no default export", () => {
    // The named-export style the client spike fixtures used before the SDK.
    const [issue] = issuesOf({ register() {} });
    expect(issue).toContain("no default export");
    expect(issue).toContain("definePlugin");
  });

  it("refuses a bare function as the default and says how to wrap it", () => {
    // The shape the runtime-loading spike used: `export default function register(ctx)`.
    const [issue] = issuesOf({ default: () => {} });
    expect(issue).toContain("is a function");
    expect(issue).toContain("definePlugin({ register })");
  });

  it.each([null, "text", 5])("refuses %j as the default export", (value) => {
    expect(issuesOf({ default: value })).toHaveLength(1);
  });

  it("names a misspelled hook, a typo must not silently do nothing", () => {
    const issues = issuesOf({ default: { register() {}, bot() {} } });
    expect(issues).toEqual(["bot: is not a known hook (use register or boot)"]);
  });

  it("refuses a hook that is not a function", () => {
    expect(issuesOf({ default: { boot: 5 } })).toEqual([
      "boot: must be a function",
    ]);
  });

  it("reports every problem at once", () => {
    const issues = issuesOf({ default: { register: "x", bot: 1, foo: 2 } });
    expect(issues).toHaveLength(3);
  });

  it("refuses a plugin that does nothing", () => {
    expect(issuesOf({ default: {} })).toEqual([
      "the plugin defines neither register nor boot",
    ]);
  });

  it("does not take a promise for a plugin", () => {
    expect(issuesOf({ default: Promise.resolve({ register() {} }) })).toEqual([
      "the plugin defines neither register nor boot",
    ]);
  });
});

describe("hostile modules", () => {
  it("never throws when reading the module fails", () => {
    const throwing = new Proxy(
      {},
      {
        get() {
          throw new Error("boom");
        },
        ownKeys() {
          throw new Error("boom");
        },
      },
    );
    expect(issuesOf(throwing)).toEqual(["the module could not be read"]);
  });

  it("never throws when the default export is a getter that throws", () => {
    const mod = {
      get default(): unknown {
        throw new Error("boom");
      },
    };
    expect(issuesOf(mod)).toEqual(["the module could not be read"]);
  });

  it("never throws when a hook is a getter that throws", () => {
    const definition = {
      get register(): unknown {
        throw new Error("boom");
      },
    };
    expect(issuesOf({ default: definition })).toEqual([
      "the module could not be read",
    ]);
  });
});
