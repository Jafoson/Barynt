import { describe, expect, it } from "bun:test";
import { scopeMessageKey } from "@/features/plugins/scopeText";

// The message that says where a plugin applies: one key for each place, so the card, the
// details and the plugins page name it the same way.

describe("the message that says where a plugin applies", () => {
  it.each([
    ["WORKSPACE", "scopeWorkspace"],
    ["PLATFORM", "scopePlatform"],
    ["PROJECT", "scopeProject"],
  ] as const)("is %s → %s", (scope, key) => {
    expect(scopeMessageKey(scope)).toBe(key);
  });
});
