import { describe, expect, it } from "bun:test";
import {
  configurable,
  type SettingsArea,
  settingsAreaOf,
  settingsPageOf,
} from "@/features/plugins/settingsArea";
import type {
  WorkspacePlugin,
  WorkspacePluginsView,
} from "@/features/plugins/workspacePlugins";
import type { SettingsForm } from "@/lib/plugins/settings";

// What the plugins' settings of a workspace show: the plugins that are switched on here, by name,
// each with the form of its settings or without. What matters: a plugin that is off here has no
// page (its values stay for when it is on again), what applies to the whole platform is not listed,
// and a page for a plugin that does not exist, is off or declares nothing is "not found", never
// an empty form.

const form: SettingsForm = {
  fields: [
    {
      id: "title",
      type: "text",
      label: "Title",
      description: null,
      required: false,
      placeholder: null,
      format: null,
      maxLength: 200,
      min: null,
      max: null,
      integer: false,
      options: [],
      default: null,
    },
  ],
  values: { title: "Hello" },
};

function plugin(more: Partial<WorkspacePlugin> = {}): WorkspacePlugin {
  return {
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
    settings: form,
    ...more,
  };
}
function view(plugins: WorkspacePlugin[]): WorkspacePluginsView {
  return { available: true, storeAvailable: false, plugins, platform: [] };
}

describe("the plugins of the area", () => {
  it("are the ones that are on here, with what they are", () => {
    expect(settingsAreaOf(view([plugin()]))).toEqual({
      plugins: [
        {
          id: "notes",
          name: "Notes",
          description: "Takes notes",
          version: "1.0.0",
          settings: form,
        },
      ],
    });
  });

  it("leave out the ones that are off here", () => {
    const area = settingsAreaOf(
      view([
        plugin({ id: "a", name: "A", on: false, settings: null }),
        plugin({ id: "b", name: "B", on: true }),
      ]),
    );
    expect(area.plugins.map((p) => p.id)).toEqual(["b"]);
  });

  it("stand in the order of their names, and of their ids where the names are the same", () => {
    const area = settingsAreaOf(
      view([
        plugin({ id: "zeta", name: "Zeta" }),
        plugin({ id: "beta-2", name: "Beta" }),
        plugin({ id: "alpha", name: "Alpha" }),
        plugin({ id: "beta-1", name: "Beta" }),
      ]),
    );
    expect(area.plugins.map((p) => p.id)).toEqual([
      "alpha",
      "beta-1",
      "beta-2",
      "zeta",
    ]);
  });

  it("stand by their names, not by their ids", () => {
    const area = settingsAreaOf(
      view([
        plugin({ id: "a-last", name: "Zulu" }),
        plugin({ id: "z-first", name: "Alpha" }),
      ]),
    );
    expect(area.plugins.map((p) => p.name)).toEqual(["Alpha", "Zulu"]);
  });

  it("do not reorder or change what the plugins page read", () => {
    const plugins = [
      plugin({ id: "b", name: "B" }),
      plugin({ id: "a", name: "A" }),
    ];
    settingsAreaOf(view(plugins));
    expect(plugins.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("carry a plugin that declares nothing, with no form", () => {
    const area = settingsAreaOf(view([plugin({ settings: null })]));
    expect(area.plugins).toHaveLength(1);
    expect(area.plugins[0].settings).toBeNull();
  });

  it("are none when nothing is on here, and none of the platform's are listed", () => {
    expect(settingsAreaOf(view([])).plugins).toEqual([]);
    expect(
      settingsAreaOf({
        ...view([]),
        platform: [
          { id: "reports", version: "1.0.0", name: "Reports", description: "" },
        ],
      }).plugins,
    ).toEqual([]);
  });
});

describe("the plugins the navigation lists", () => {
  const area: SettingsArea = settingsAreaOf(
    view([
      plugin({ id: "a", name: "A" }),
      plugin({ id: "b", name: "B", settings: null }),
      plugin({ id: "c", name: "C" }),
    ]),
  );

  it("are the ones that have settings, and not the ones that declare none", () => {
    expect(configurable(area).map((p) => p.id)).toEqual(["a", "c"]);
  });

  it("are none when no plugin has settings", () => {
    expect(
      configurable(settingsAreaOf(view([plugin({ settings: null })]))),
    ).toEqual([]);
  });
});

describe("one plugin's page", () => {
  const area = settingsAreaOf(
    view([
      plugin({ id: "a", name: "A" }),
      plugin({ id: "b", name: "B", settings: null }),
    ]),
  );

  it("is the plugin with its form", () => {
    const page = settingsPageOf(area, "a");
    expect(page?.id).toBe("a");
    expect(page?.name).toBe("A");
    expect(page?.settings).toBe(form);
  });

  it("is not there for a plugin that declares no settings", () => {
    expect(settingsPageOf(area, "b")).toBeNull();
  });

  it("is not there for a plugin that is off here, or that does not exist", () => {
    const off = settingsAreaOf(
      view([plugin({ id: "a", on: false, settings: null })]),
    );
    expect(settingsPageOf(off, "a")).toBeNull();
    expect(settingsPageOf(area, "missing")).toBeNull();
    expect(settingsPageOf(area, "")).toBeNull();
  });

  it("is looked up by the id and by nothing else", () => {
    expect(settingsPageOf(area, "A")).toBeNull();
    expect(settingsPageOf(area, "a ")).toBeNull();
    expect(settingsPageOf(area, "constructor")).toBeNull();
  });
});
