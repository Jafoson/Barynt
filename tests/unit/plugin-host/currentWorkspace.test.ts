import { beforeEach, describe, expect, it } from "bun:test";
import {
  CURRENT_WORKSPACE_READER,
  getCurrentWorkspaceId,
  setCurrentWorkspaceId,
} from "@/lib/current-workspace";

// The request's workspace is kept in a request-scoped store (`cache()`), and the
// plugin host's services run from another compilation layer, with a copy of this
// module that is never seeded. So the copy that *is* seeded publishes its reader on
// `global`, where they find it. Found in a production build: without this the
// workspace service answered `null` inside a request that had a workspace. What is
// checked here is that the reader is published and that it is this module's own;
// that `cache()` remembers the value for the length of a request is React's part.

const holder = globalThis as unknown as Record<symbol, unknown>;

beforeEach(() => {
  delete holder[CURRENT_WORKSPACE_READER];
});

describe("setCurrentWorkspaceId", () => {
  it("publishes the reader for the plugin host", () => {
    expect(holder[CURRENT_WORKSPACE_READER]).toBeUndefined();
    setCurrentWorkspaceId("nimbus");
    expect(typeof holder[CURRENT_WORKSPACE_READER]).toBe("function");
  });

  it("publishes this module's own reader, not a value: it holds no request data", () => {
    setCurrentWorkspaceId("nimbus");
    expect(holder[CURRENT_WORKSPACE_READER]).toBe(getCurrentWorkspaceId);
  });

  it("publishes it again on every call, so it is there once a request has seeded the store", () => {
    setCurrentWorkspaceId("nimbus");
    delete holder[CURRENT_WORKSPACE_READER];
    setCurrentWorkspaceId("other");
    expect(holder[CURRENT_WORKSPACE_READER]).toBe(getCurrentWorkspaceId);
  });

  it("does not publish anything before the store is seeded", () => {
    expect(holder[CURRENT_WORKSPACE_READER]).toBeUndefined();
  });

  it("uses the key the host services look for", () => {
    expect(Symbol.keyFor(CURRENT_WORKSPACE_READER)).toBe(
      "barynt.currentWorkspaceReader",
    );
  });
});
