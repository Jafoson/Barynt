import { beforeEach, describe, expect, it, mock } from "bun:test";

// What the plugins' settings of a workspace read. What matters: it asks the workspace's plugins
// page (which asks for `plugin.enable` in that workspace itself), somebody who may not gets `null`
// (the caller turns it into "page not found") and nothing is read for them, and any other failure
// is not swallowed as if it were a missing permission. Own process: it replaces
// `workspaceQueries`, which `plugin-workspace` tests for real.

class PermissionError extends Error {}
const mockWorkspacePlugins = mock();

mock.module("@/lib/permissions", () => ({ PermissionError }));
mock.module("@/features/plugins/workspaceQueries", () => ({
  getWorkspacePlugins: mockWorkspacePlugins,
}));

import { getPluginSettingsArea } from "@/features/plugins/settingsAreaQueries";
import type { WorkspacePluginsView } from "@/features/plugins/workspacePlugins";

const view: WorkspacePluginsView = {
  available: true,
  storeAvailable: false,
  platform: [],
  plugins: [
    {
      id: "notes",
      version: "1.0.0",
      name: "Notes",
      description: "Takes notes",
      author: "Acme",
      categories: [],
      capabilities: [],
      hasCode: false,
      fromStore: true,
      on: true,
      blocker: null,
      state: { kind: "running", mode: "declarative" },
      settings: null,
    },
  ],
};

beforeEach(() => {
  mockWorkspacePlugins.mockReset();
  mockWorkspacePlugins.mockResolvedValue(view);
});

describe("the plugins' settings of a workspace", () => {
  it("are what the workspace's plugins page reads, put together as the area", async () => {
    const area = await getPluginSettingsArea("ws-7", "de");
    expect(area?.plugins.map((p) => p.id)).toEqual(["notes"]);
    expect(area?.plugins[0].name).toBe("Notes");
  });

  it("ask for this workspace and this language, and once", async () => {
    await getPluginSettingsArea("ws-7", "de");
    expect(mockWorkspacePlugins.mock.calls).toEqual([["ws-7", "de"]]);
  });

  it("are null for someone who may not switch plugins on", async () => {
    mockWorkspacePlugins.mockRejectedValue(new PermissionError("no"));
    expect(await getPluginSettingsArea("ws-7", "en")).toBeNull();
  });

  it("do not take any other failure for a missing permission", async () => {
    mockWorkspacePlugins.mockRejectedValue(new Error("database is down"));
    await expect(getPluginSettingsArea("ws-7", "en")).rejects.toThrow(
      "database is down",
    );
  });

  it("do not take a failure that only looks like one for a missing permission", async () => {
    mockWorkspacePlugins.mockRejectedValue({ name: "PermissionError" });
    await expect(getPluginSettingsArea("ws-7", "en")).rejects.toBeDefined();
  });
});
