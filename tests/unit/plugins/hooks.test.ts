import { describe, expect, it } from "bun:test";
import {
  HOOK_TIMEOUT_MS,
  runHook,
  uninstallHookContext,
  workspaceHookContext,
} from "@/lib/plugins/hooks";
import type { PluginHooks } from "@/lib/plugins/loader";

// Running a hook is running plugin code, so what matters is what comes back when
// that code misbehaves: nothing thrown, one short line, and a hook that hangs is
// waited for only so long.

const HOST = { barynt: "0.1.0", sdk: "0.2.0" };
const context = workspaceHookContext(
  { id: "calendar", version: "1.0.0" },
  HOST,
  { id: "w1", name: "W" },
);

const running = (hooks: PluginHooks) => ({ hooks });

describe("running a hook", () => {
  it("calls the hook with the context and says it ran", async () => {
    const seen: unknown[] = [];
    const outcome = await runHook(
      running({ onEnable: (ctx) => void seen.push(ctx) }),
      "onEnable",
      context,
    );
    expect(outcome).toEqual({ ran: true, ok: true });
    expect(seen).toEqual([context]);
  });

  it("waits for a hook that is async", async () => {
    const order: string[] = [];
    const outcome = await runHook(
      running({
        onDisable: async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
          order.push("hook");
        },
      }),
      "onDisable",
      context,
    );
    order.push("after");
    expect(outcome).toEqual({ ran: true, ok: true });
    expect(order).toEqual(["hook", "after"]);
  });

  it("does nothing for a plugin that is not running", async () => {
    expect(await runHook(undefined, "onEnable", context)).toEqual({
      ran: false,
    });
  });

  it("does nothing for a hook the plugin does not have, and runs no other", async () => {
    let called = false;
    const outcome = await runHook(
      running({
        onDisable: () => {
          called = true;
        },
      }),
      "onEnable",
      context,
    );
    expect(outcome).toEqual({ ran: false });
    expect(called).toBe(false);
  });

  it.each([
    [
      "throws",
      () => {
        throw new Error("no room");
      },
      "no room",
    ],
    [
      "rejects",
      async () => {
        throw new Error("no room");
      },
      "no room",
    ],
    [
      "throws something that is not an Error",
      () => {
        throw "just text";
      },
      "just text",
    ],
    [
      "throws an error whose message throws",
      () => {
        const error = new Error("x");
        Object.defineProperty(error, "message", {
          get() {
            throw new Error("no");
          },
        });
        throw error;
      },
      "unknown error",
    ],
    [
      "throws nothing at all",
      () => {
        throw undefined;
      },
      "undefined",
    ],
  ])(
    "says it failed, and never throws, when the hook %s",
    async (_n, hook, message) => {
      expect(
        await runHook(running({ onEnable: hook }), "onEnable", context),
      ).toEqual({ ran: true, ok: false, message });
    },
  );

  it("keeps the message to one short line without a stack trace", async () => {
    const outcome = await runHook(
      running({
        onEnable: () => {
          throw new Error(`line one\n   line two\n${"x".repeat(1000)}`);
        },
      }),
      "onEnable",
      context,
    );
    const message = outcome.ran && !outcome.ok ? outcome.message : "";
    expect(message.startsWith("line one line two xxx")).toBe(true);
    expect(message.length).toBe(301);
    expect(message).not.toContain("\n");
  });

  it("stops waiting for a hook that takes too long, and says so", async () => {
    const started = Date.now();
    const outcome = await runHook(
      running({ onEnable: () => new Promise(() => {}) }),
      "onEnable",
      context,
      50,
    );
    expect(outcome).toEqual({
      ran: true,
      ok: false,
      message: "onEnable took longer than 50 ms",
    });
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("does not wait longer than that for one that finishes in time", async () => {
    const outcome = await runHook(
      running({
        onEnable: () => new Promise((resolve) => setTimeout(resolve, 10)),
      }),
      "onEnable",
      context,
      1000,
    );
    expect(outcome).toEqual({ ran: true, ok: true });
  });

  it("waits as long as a hook may take, like `boot`", () => {
    expect(HOOK_TIMEOUT_MS).toBe(30_000);
  });

  it("does not let a hook that fails late become an unhandled rejection", async () => {
    let late: (error: Error) => void = () => {};
    const outcome = await runHook(
      running({
        onEnable: () =>
          new Promise<void>((_, reject) => {
            late = reject;
          }),
      }),
      "onEnable",
      context,
      20,
    );
    expect(outcome.ran && !outcome.ok).toBe(true);
    late(new Error("too late"));
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
});

describe("the contexts", () => {
  it("say which plugin, which host and which workspace", () => {
    expect(context).toEqual({
      plugin: { id: "calendar", version: "1.0.0" },
      host: HOST,
      workspace: { id: "w1", name: "W" },
    });
    expect(
      uninstallHookContext({ id: "calendar", version: "1.0.0" }, HOST),
    ).toEqual({ plugin: { id: "calendar", version: "1.0.0" }, host: HOST });
  });

  it("are frozen all the way down, and copies of what the host holds", () => {
    const info = { id: "calendar", version: "1.0.0" };
    const workspace = { id: "w1", name: "W" };
    const host = { ...HOST };
    const made = workspaceHookContext(info, host, workspace);
    for (const value of [made, made.plugin, made.host, made.workspace]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(made.plugin).not.toBe(info);
    expect(made.host).not.toBe(host);
    expect(made.workspace).not.toBe(workspace);
    const gone = uninstallHookContext(info, host);
    for (const value of [gone, gone.plugin, gone.host]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
    expect(gone.plugin).not.toBe(info);
  });

  it("carry nothing else: no services, no way to reach the database", () => {
    expect(Object.keys(context).sort()).toEqual([
      "host",
      "plugin",
      "workspace",
    ]);
    expect(
      Object.keys(
        uninstallHookContext({ id: "a1", version: "1.0.0" }, HOST),
      ).sort(),
    ).toEqual(["host", "plugin"]);
  });
});
