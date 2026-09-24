import "../plugin-store-support/setup";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  mockSetVisibility,
  resetStarted,
  settled,
} from "../plugin-store-support/setup";

// The plugin stores page, where the admin says who gets the store: in workspaces, in
// projects, and whether they see only what was released. The switches are stand-ins that
// keep their functions, so a test can flip them and see which action runs with which values.

interface Flip {
  id: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}
let switches: Flip[] = [];

mock.module("@/components/ui/atoms/Switch/Switch", () => ({
  Switch: (props: Flip & { label: string }) => {
    switches.push({
      id: props.id,
      checked: props.checked,
      disabled: props.disabled,
      onChange: props.onChange,
    });
    return (
      <input
        type="checkbox"
        id={props.id}
        checked={props.checked}
        disabled={props.disabled}
        readOnly
      />
    );
  },
}));
mock.module("@/components/ui/layout/ConfirmDialog/ConfirmDialog", () => ({
  useConfirm: () => async () => true,
}));
mock.module("@/features/plugin-stores/actions", () => ({
  addPluginStore: mock(),
  clearPluginStoreCredential: mock(),
  removePluginStore: mock(),
  setPluginStoreCredential: mock(),
  setPluginStoreEnabled: mock(),
}));
mock.module("@/features/plugin-stores/unsignedActions", () => ({
  setAllowUnsignedPlugins: mock(),
}));

import { PluginStores } from "@/features/plugin-stores/components/PluginStores/PluginStores";
import type { StoreVisibility } from "@/lib/plugins/storeVisibility";

const open: StoreVisibility = {
  inWorkspaces: true,
  inProjects: true,
  curatedOnly: false,
};

function render(visibility: StoreVisibility): string {
  switches = [];
  resetStarted();
  return renderToStaticMarkup(
    <PluginStores stores={[]} allowUnsigned={false} visibility={visibility} />,
  ) as ReactNode as string;
}
const byId = (id: string) => {
  const found = switches.find((s) => s.id === id);
  if (!found) throw new Error(`no switch ${id}`);
  return found;
};

beforeEach(() => {
  mockSetVisibility.mockReset();
  mockSetVisibility.mockResolvedValue({ ok: true });
});

describe("where the store is shown", () => {
  it("has three switches with the words for each, and says approving code stays with the admin", () => {
    const html = render(open);
    for (const key of [
      "pluginStores.visibilityTitle",
      "pluginStores.visibilityWorkspaces",
      "pluginStores.visibilityWorkspacesDesc",
      "pluginStores.visibilityProjects",
      "pluginStores.visibilityProjectsDesc",
      "pluginStores.curatedOnly",
      "pluginStores.curatedOnlyDesc",
      "pluginStores.visibilityNote",
    ]) {
      expect(html).toContain(key);
    }
  });

  it("shows the switches as they are set", () => {
    render({ inWorkspaces: true, inProjects: false, curatedOnly: true });
    expect(byId("plugin-store-in-workspaces").checked).toBe(true);
    expect(byId("plugin-store-in-projects").checked).toBe(false);
    expect(byId("plugin-store-curated-only").checked).toBe(true);
    render({ inWorkspaces: false, inProjects: true, curatedOnly: false });
    expect(byId("plugin-store-in-workspaces").checked).toBe(false);
    expect(byId("plugin-store-in-projects").checked).toBe(true);
    expect(byId("plugin-store-curated-only").checked).toBe(false);
  });

  it.each([
    [
      "workspaces",
      "plugin-store-in-workspaces",
      { inWorkspaces: false, inProjects: true, curatedOnly: false },
    ],
    [
      "projects",
      "plugin-store-in-projects",
      { inWorkspaces: true, inProjects: false, curatedOnly: false },
    ],
    [
      "only released plugins",
      "plugin-store-curated-only",
      { inWorkspaces: true, inProjects: true, curatedOnly: true },
    ],
  ])(
    "changes only %s, and sends all three values",
    async (_n, id, expected) => {
      render(open);
      byId(id).onChange(id === "plugin-store-curated-only");
      await settled();
      expect(mockSetVisibility.mock.calls).toEqual([[expected]]);
    },
  );

  it("sends the values that were on the page, so a switch changes one and keeps the rest", async () => {
    render({ inWorkspaces: false, inProjects: true, curatedOnly: true });
    byId("plugin-store-in-projects").onChange(false);
    await settled();
    expect(mockSetVisibility.mock.calls).toEqual([
      [{ inWorkspaces: false, inProjects: false, curatedOnly: true }],
    ]);
  });

  it("cannot be told to show only released plugins where the store is shown nowhere, and says why", () => {
    const nowhere = render({
      inWorkspaces: false,
      inProjects: false,
      curatedOnly: false,
    });
    expect(byId("plugin-store-curated-only").disabled).toBe(true);
    expect(nowhere).toContain("pluginStores.curatedOnlyOff");
    const somewhere = render({
      inWorkspaces: true,
      inProjects: false,
      curatedOnly: false,
    });
    expect(byId("plugin-store-curated-only").disabled).toBe(false);
    expect(somewhere).not.toContain("pluginStores.curatedOnlyOff");
  });

  it("keeps the switches for workspaces and projects usable when nothing else is", () => {
    render({ inWorkspaces: false, inProjects: false, curatedOnly: true });
    expect(byId("plugin-store-in-workspaces").disabled).toBe(false);
    expect(byId("plugin-store-in-projects").disabled).toBe(false);
  });
});
