import { describe, expect, it } from "bun:test";
import { emitProjectChange, subscribeProjectChange } from "@/lib/realtime/bus";

describe("realtime bus (BARY-26)", () => {
  it("delivers an event only to subscribers of the same project", () => {
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];
    const unsubA = subscribeProjectChange("proj-a", (e) => receivedA.push(e));
    const unsubB = subscribeProjectChange("proj-b", (e) => receivedB.push(e));

    emitProjectChange({ projectId: "proj-a", actorId: "u1", at: 1 });

    expect(receivedA).toEqual([{ projectId: "proj-a", actorId: "u1", at: 1 }]);
    expect(receivedB).toEqual([]);

    unsubA();
    unsubB();
  });

  it("stops delivering after unsubscribe", () => {
    const received: unknown[] = [];
    const unsubscribe = subscribeProjectChange("proj-c", (e) =>
      received.push(e),
    );
    unsubscribe();

    emitProjectChange({ projectId: "proj-c", actorId: "u1", at: 1 });

    expect(received).toEqual([]);
  });

  it("delivers to every subscriber of the same project", () => {
    const first: unknown[] = [];
    const second: unknown[] = [];
    const unsub1 = subscribeProjectChange("proj-d", (e) => first.push(e));
    const unsub2 = subscribeProjectChange("proj-d", (e) => second.push(e));

    emitProjectChange({
      projectId: "proj-d",
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
