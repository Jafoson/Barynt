import { describe, expect, it } from "bun:test";
import { describeBlocked, describeStatus } from "@/lib/plugins/describe";
import type { BlockedReason } from "@/lib/plugins/policy";
import type { PluginStatus } from "@/lib/plugins/registry";

// The sentences an action gives an admin for what became of a plugin. Every state
// the registry can put a plugin in has to have one, and a reason that is left out
// must not silently become an empty sentence.

describe("why a plugin is blocked", () => {
  it.each<[BlockedReason, string]>([
    ["invalid", "Its files could not be checked."],
    [
      "unsigned-not-allowed",
      "It comes from no store, and the platform has not allowed plugins from no store.",
    ],
    [
      "unsigned-code",
      "It comes from no store and has code, and code from no store does not run in the app.",
    ],
    [
      "store-not-active",
      "It has code and comes from a store that is not switched on.",
    ],
    ["not-approved", "The platform has not approved its code to run."],
    [
      "approval-outdated",
      "The platform approved the code of another version. This version has to be approved on its own.",
    ],
  ])("says what %s means", (reason, text) => {
    expect(describeBlocked(reason)).toBe(text);
  });
});

describe("what became of a plugin", () => {
  const cases: [string, PluginStatus | undefined, string][] = [
    ["nothing known", undefined, "The registry does not know it."],
    ["loaded", { state: "loaded", mode: "declarative" }, "It is running."],
    ["disabled", { state: "disabled" }, "The platform has switched it off."],
    ["idle", { state: "idle" }, "No workspace has it switched on."],
    [
      "missing",
      { state: "missing" },
      "Its files are not in the plugin directory.",
    ],
    [
      "invalid",
      { state: "invalid", issues: ["id: bad", "version: bad"] },
      "Its manifest is not valid: id: bad; version: bad.",
    ],
    [
      "incompatible",
      {
        state: "incompatible",
        problems: [
          { code: "host-incompatible", range: ">=9.0.0", host: "0.1.0" },
          { code: "dependency-missing", dependency: "notes", range: "^1" },
        ],
      },
      "The plugin works with Barynt >=9.0.0, this is 0.1.0; needs the plugin notes (^1), which is not installed.",
    ],
    [
      "blocked",
      { state: "blocked", reason: "not-approved" },
      "The platform has not approved its code to run.",
    ],
    [
      "failed",
      { state: "failed", phase: "boot", message: "no room" },
      "It failed to load (boot): no room",
    ],
  ];

  it.each(cases)("says it for %s", (_name, status, text) => {
    expect(describeStatus(status)).toBe(text);
  });
});
