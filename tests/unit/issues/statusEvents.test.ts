import { beforeEach, describe, expect, it, mock } from "bun:test";

mock.module("@/lib/db", () => ({
  db: {
    status: {
      findMany: mock(async () => [
        { id: "todo", category: "unstarted" },
        { id: "doing", category: "started" },
      ]),
    },
    issueStatusEvent: { create: mock(async () => ({})) },
  },
}));

import { db } from "@/lib/db";
import { recordStatusEvent } from "@/lib/issue-status-events";

const create = db.issueStatusEvent.create as ReturnType<typeof mock>;
const findMany = db.status.findMany as ReturnType<typeof mock>;

// The record the flow metrics read (BARY-171): where an issue stood when.
// Categories are frozen into the row — a status filed under another
// category later mustn't rewrite the past.

describe("recordStatusEvent", () => {
  beforeEach(() => {
    create.mockClear();
  });

  it("stores a change with both categories", async () => {
    const at = new Date("2026-10-01T10:00:00Z");
    await recordStatusEvent("i1", "todo", "doing", at);
    expect(create.mock.calls[0][0].data).toEqual({
      issueId: "i1",
      fromStatus: "todo",
      toStatus: "doing",
      fromCategory: "unstarted",
      toCategory: "started",
      at,
    });
  });

  it("stores the creation without a from", async () => {
    await recordStatusEvent("i1", null, "todo");
    const data = create.mock.calls[0][0].data;
    expect(data.fromStatus).toBeNull();
    expect(data.fromCategory).toBeNull();
    expect(data.toCategory).toBe("unstarted");
    expect(data.at).toBeInstanceOf(Date);
  });

  it("skips a status it can't file under a category", async () => {
    await recordStatusEvent("i1", "todo", "gone");
    expect(create).not.toHaveBeenCalled();
  });

  it("never throws — the change itself has happened", async () => {
    findMany.mockImplementationOnce(async () => {
      throw new Error("db down");
    });
    const error = console.error;
    console.error = () => {};
    try {
      await expect(
        recordStatusEvent("i1", "todo", "doing"),
      ).resolves.toBeUndefined();
    } finally {
      console.error = error;
    }
  });
});
