import { describe, expect, it } from "bun:test";
import { emitProjectChange, subscribeProjectChange } from "@/lib/realtime/bus";

describe("realtime bus (BARY-26)", () => {
  it("delivers an event only to subscribers of the same workspace", () => {
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    const unsubA = subscribeProjectChange("ws-a", (e) => receivedA.push(e));
    const unsubB = subscribeProjectChange("ws-b", (e) => receivedB.push(e));

    emitProjectChange({
      workspaceId: "ws-a",
      projectId: "proj-a",
      actorId: "u1",
      at: 1,
    });

    expect(receivedA).toEqual([
      { workspaceId: "ws-a", projectId: "proj-a", actorId: "u1", at: 1 },
    ]);
    expect(receivedB).toEqual([]);

    unsubA();
    unsubB();
  });

  it("stops delivering after unsubscribe", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeProjectChange("ws-c", (e) => received.push(e));
    unsubscribe();

    emitProjectChange({
      workspaceId: "ws-c",
      projectId: "proj-c",
      actorId: "u1",
      at: 1,
    });

    expect(received).toEqual([]);
  });

  it("delivers to every subscriber of the same workspace, across projects", () => {
    const first: unknown[] = [];
    const second: unknown[] = [];
    const unsub1 = subscribeProjectChange("ws-d", (e) => first.push(e));
    const unsub2 = subscribeProjectChange("ws-d", (e) => second.push(e));

    emitProjectChange({
      workspaceId: "ws-d",
      projectId: "proj-x",
      issueId: "i1",
      actorId: "u2",
      at: 2,
    });

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);

    unsub1();
    unsub2();
  });
});
