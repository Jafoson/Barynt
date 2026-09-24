import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type BootContext,
  definePlugin,
  type PluginDefinition,
  type RegistrationContext,
  SDK_VERSION,
  SERVER_CONTRIBUTION_POINTS,
} from "@barynt/plugin-sdk";
import { valid } from "semver";
import { CONTRIBUTION_POINTS } from "@/lib/plugins/manifest";

// The SDK is what plugin authors and the host both import. It is types and one
// identity function, so what needs guarding is its edges: that it stays in step
// with the manifest and with its own package.json, and that its contexts have
// the members the docs promise. Pure logic, no database.

describe("definePlugin", () => {
  it("returns its argument unchanged, so bundling it into a plugin is harmless", () => {
    const definition: PluginDefinition = { register() {}, boot() {} };
    expect(definePlugin(definition)).toBe(definition);
  });

  it("accepts a plugin with only one of the two phases", () => {
    expect(definePlugin({ register() {} })).toBeDefined();
    expect(definePlugin({ boot() {} })).toBeDefined();
  });

  it("takes the lifecycle hooks with the contexts the docs promise, and returns them unchanged", () => {
    const seen: string[] = [];
    const definition = definePlugin({
      onEnable(ctx) {
        seen.push(
          `enable ${ctx.plugin.id} ${ctx.host.sdk} ${ctx.workspace.id}`,
        );
      },
      async onDisable(ctx) {
        seen.push(`disable ${ctx.workspace.name}`);
      },
      onUninstall(ctx) {
        seen.push(`uninstall ${ctx.plugin.version}`);
      },
    });
    const workspace = { id: "w1", name: "W" };
    const base = {
      plugin: { id: "demo", version: "1.0.0" },
      host: { barynt: "1.0.0", sdk: SDK_VERSION },
    };
    definition.onEnable?.({ ...base, workspace });
    definition.onDisable?.({ ...base, workspace });
    definition.onUninstall?.(base);
    expect(seen).toEqual([
      `enable demo ${SDK_VERSION} w1`,
      "disable W",
      "uninstall 1.0.0",
    ]);
  });
});

describe("SDK version", () => {
  it("is a SemVer version and matches the package's package.json", () => {
    const pkg = JSON.parse(
      readFileSync(
        join(import.meta.dir, "../../../packages/plugin-sdk/package.json"),
        "utf8",
      ),
    ) as { name: string; version: string };
    expect(valid(SDK_VERSION)).toBe(SDK_VERSION);
    expect(pkg.version).toBe(SDK_VERSION);
    expect(pkg.name).toBe("@barynt/plugin-sdk");
  });
});

describe("server extension points", () => {
  it("are all extension points the manifest knows", () => {
    for (const point of SERVER_CONTRIBUTION_POINTS) {
      expect(CONTRIBUTION_POINTS as readonly string[]).toContain(point);
    }
  });

  it("leave the points with a screen to the client entry, on purpose", () => {
    // A server module cannot hand over a React component. If one of these
    // moves, it moves knowingly, together with the client entry (BARY-65).
    const missing = CONTRIBUTION_POINTS.filter(
      (point) =>
        !(SERVER_CONTRIBUTION_POINTS as readonly string[]).includes(point),
    );
    expect(missing).toEqual([
      "pages",
      "navigation",
      "views",
      "issuePanels",
      "issueActions",
      "dashboardWidgets",
      "commands",
    ]);
  });
});

describe("the two contexts", () => {
  const registered: string[] = [];
  const registration = {
    plugin: { id: "demo", version: "1.0.0" },
    host: { barynt: "1.0.0", sdk: SDK_VERSION },
    registerSetting: (id) => void registered.push(`setting:${id}`),
    registerPermission: (id) => void registered.push(`permission:${id}`),
    registerEventListener: (id) => void registered.push(`event:${id}`),
    registerJob: (id) => void registered.push(`job:${id}`),
    registerWebhook: (id) => void registered.push(`webhook:${id}`),
    registerNotification: (id) => void registered.push(`notification:${id}`),
    registerCustomField: (id) => void registered.push(`customField:${id}`),
  } satisfies RegistrationContext;

  it("give the registration phase one register method per server point", () => {
    // `satisfies` fails the type check when the interface lacks one of these;
    // this checks the other direction, that no method is left without a point.
    const methods = Object.keys(registration).filter((key) =>
      key.startsWith("register"),
    );
    expect(methods).toHaveLength(SERVER_CONTRIBUTION_POINTS.length);
  });

  it("run a plugin through both phases in order", async () => {
    const order: string[] = [];
    const plugin = definePlugin({
      register(ctx) {
        order.push("register");
        ctx.registerJob("sync", {});
        ctx.registerSetting("api-key", {});
      },
      async boot(ctx) {
        order.push("boot");
        await ctx.jobs.enqueue("sync", { full: true });
        const user = await ctx.user.current();
        expect(user).toBeNull();
      },
    });
    const enqueued: unknown[][] = [];
    const boot = {
      plugin: registration.plugin,
      host: registration.host,
      storage: {},
      events: {},
      jobs: { enqueue: async (...args: unknown[]) => void enqueued.push(args) },
      user: { current: async () => null },
      workspace: { current: async () => null },
    } satisfies BootContext;

    plugin.register?.(registration);
    await plugin.boot?.(boot);

    expect(order).toEqual(["register", "boot"]);
    expect(registered).toEqual(["job:sync", "setting:api-key"]);
    expect(enqueued).toEqual([["sync", { full: true }]]);
  });
});
