import { describe, expect, it } from "bun:test";
import { getLastChange, recordProjectChange } from "@/lib/realtime/store";

describe("realtime store (BARY-26)", () => {
  it("returns null for a workspace with no recorded change", () => {
    expect(getLastChange("ws-never-changed")).toBeNull();
  });

  it("records the actor and a timestamp", () => {
    const before = Date.now();
    recordProjectChange("ws-a", "u1");
    const change = getLastChange("ws-a");

    expect(change).not.toBeNull();
    expect(change?.actorId).toBe("u1");
    expect(change?.at).toBeGreaterThanOrEqual(before);
  });

  it("keeps changes for different workspaces independent", () => {
    recordProjectChange("ws-b", "u1");
    recordProjectChange("ws-c", "u2");

    expect(getLastChange("ws-b")?.actorId).toBe("u1");
    expect(getLastChange("ws-c")?.actorId).toBe("u2");
  });

  it("only keeps the most recent change per workspace", () => {
    recordProjectChange("ws-d", "u1");
    recordProjectChange("ws-d", "u2");

    expect(getLastChange("ws-d")?.actorId).toBe("u2");
  });
});
