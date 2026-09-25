import { describe, expect, it } from "bun:test";
import {
  type AreaInput,
  type AreaProject,
  navPlugins,
  pluginPageOf,
  projectChooserOf,
  projectPageOf,
  type SettingsArea,
  settingsAreaOf,
  settingsPageOf,
} from "@/features/plugins/settingsArea";
import type {
  WorkspacePlugin,
  WorkspacePluginsView,
} from "@/features/plugins/workspacePlugins";
import type { SettingsForm } from "@/lib/plugins/settings";

// What the plugins' settings of a workspace show: the plugins that are switched on here or in a
// project, by name, each with the form of its settings or without. What matters: a plugin that is
// off has no page (its values stay for when it is on again), what applies to the whole platform is
// not listed, a person sees the workspace's plugins only when they may set those up and a project's
// only in projects they may set up, and a page for a plugin or a project that does not exist, is off
// or declares nothing is "not found", never an empty form.

const form = (title = "Hello"): SettingsForm => ({
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
  values: { title },
});

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
    settings: form(),
    ...more,
  };
}
function view(plugins: WorkspacePlugin[]): WorkspacePluginsView {
  return { available: true, storeAvailable: false, plugins, platform: [] };
}
function project(more: Partial<AreaProject> = {}): AreaProject {
  return {
    id: "p-1",
    slug: "web-app",
    name: "Web App",
    color: "#3b82f6",
    avatarUrl: null,
    ...more,
  };
}
const area = (input: Partial<AreaInput> = {}): SettingsArea =>
  settingsAreaOf({ workspace: view([]), projects: [], ...input });

describe("the workspace's plugins of the area", () => {
  it("are the ones that are on here, with what they are", () => {
    expect(area({ workspace: view([plugin()]) }).plugins).toEqual([
      {
        id: "notes",
        name: "Notes",
        description: "Takes notes",
        version: "1.0.0",
        settings: form(),
      },
    ]);
  });

  it("leave out the ones that are off here", () => {
    const result = area({
      workspace: view([
        plugin({ id: "a", name: "A", on: false, settings: null }),
        plugin({ id: "b", name: "B", on: true }),
      ]),
    });
    expect(result.plugins.map((p) => p.id)).toEqual(["b"]);
  });

  it("stand by their names, not by their ids, and by id where the names are the same", () => {
    const result = area({
      workspace: view([
        plugin({ id: "a-last", name: "Zulu" }),
        plugin({ id: "z-first", name: "Alpha" }),
        plugin({ id: "beta-2", name: "Beta" }),
        plugin({ id: "beta-1", name: "Beta" }),
      ]),
    });
    expect(result.plugins.map((p) => p.id)).toEqual([
      "z-first",
      "beta-1",
      "beta-2",
      "a-last",
    ]);
  });

  it("do not reorder or change what the plugins page read", () => {
    const plugins = [
      plugin({ id: "b", name: "B" }),
      plugin({ id: "a", name: "A" }),
    ];
    area({ workspace: view(plugins) });
    expect(plugins.map((p) => p.id)).toEqual(["b", "a"]);
  });

  it("carry a plugin that declares nothing, with no form", () => {
    const result = area({ workspace: view([plugin({ settings: null })]) });
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].settings).toBeNull();
  });

  it("are none, and not the workspace's to set, for someone who may not set them up", () => {
    const result = area({ workspace: null });
    expect(result.plugins).toEqual([]);
    expect(result.ownWorkspace).toBe(false);
  });

  it("are the workspace's to set for someone who may", () => {
    expect(area({ workspace: view([]) }).ownWorkspace).toBe(true);
  });

  it("do not list what is the platform's", () => {
    const result = area({
      workspace: {
        ...view([]),
        platform: [
          { id: "reports", version: "1.0.0", name: "Reports", description: "" },
        ],
      },
    });
    expect(result.plugins).toEqual([]);
    expect(result.projectPlugins).toEqual([]);
  });
});

describe("the plugins that are set per project", () => {
  const web = project();
  const mobile = project({ id: "p-2", slug: "mobile", name: "Mobile" });

  it("are the ones that are on in a project, with the project and what is set there", () => {
    const result = area({
      projects: [
        {
          project: web,
          view: view([
            plugin({ id: "roadmap", name: "Roadmap", settings: form("Q3") }),
          ]),
        },
      ],
    });
    expect(result.projectPlugins).toEqual([
      {
        id: "roadmap",
        name: "Roadmap",
        description: "Takes notes",
        version: "1.0.0",
        projects: [{ ...web, settings: form("Q3") }],
      },
    ]);
  });

  it("are one entry for the plugin, whatever number of projects it is on in", () => {
    const result = area({
      projects: [
        {
          project: web,
          view: view([
            plugin({ id: "roadmap", name: "Roadmap", settings: form("A") }),
          ]),
        },
        {
          project: mobile,
          view: view([
            plugin({ id: "roadmap", name: "Roadmap", settings: form("B") }),
          ]),
        },
      ],
    });
    expect(result.projectPlugins).toHaveLength(1);
    expect(result.projectPlugins[0].projects.map((p) => p.slug)).toEqual([
      "mobile",
      "web-app",
    ]);
    expect(
      result.projectPlugins[0].projects.map((p) => p.settings?.values.title),
    ).toEqual(["B", "A"]);
  });

  it("keep each project's own values apart", () => {
    const result = area({
      projects: [
        {
          project: web,
          view: view([plugin({ id: "roadmap", settings: form("A") })]),
        },
        {
          project: mobile,
          view: view([plugin({ id: "roadmap", settings: form("B") })]),
        },
      ],
    });
    const byProject = Object.fromEntries(
      result.projectPlugins[0].projects.map((p) => [
        p.slug,
        p.settings?.values.title,
      ]),
    );
    expect(byProject).toEqual({ "web-app": "A", mobile: "B" });
  });

  it("leave out a plugin that is off in a project, and list it where it is on", () => {
    const result = area({
      projects: [
        {
          project: web,
          view: view([plugin({ id: "roadmap", on: false, settings: null })]),
        },
        { project: mobile, view: view([plugin({ id: "roadmap", on: true })]) },
      ],
    });
    expect(result.projectPlugins[0].projects.map((p) => p.slug)).toEqual([
      "mobile",
    ]);
  });

  it("are none for a plugin that is on in no project", () => {
    const result = area({
      projects: [
        {
          project: web,
          view: view([plugin({ id: "roadmap", on: false, settings: null })]),
        },
      ],
    });
    expect(result.projectPlugins).toEqual([]);
  });

  it("stand by their names, and their projects by theirs", () => {
    const result = area({
      projects: [
        {
          project: web,
          view: view([
            plugin({ id: "z", name: "Zeta" }),
            plugin({ id: "a", name: "Alpha" }),
          ]),
        },
        {
          project: project({ id: "p-3", slug: "api", name: "Api" }),
          view: view([plugin({ id: "z", name: "Zeta" })]),
        },
      ],
    });
    expect(result.projectPlugins.map((p) => p.id)).toEqual(["a", "z"]);
    expect(result.projectPlugins[1].projects.map((p) => p.name)).toEqual([
      "Api",
      "Web App",
    ]);
  });

  it("are the projects' alone for someone who may not set the workspace's up", () => {
    const result = area({
      workspace: null,
      projects: [{ project: web, view: view([plugin({ id: "roadmap" })]) }],
    });
    expect(result.plugins).toEqual([]);
    expect(result.projectPlugins.map((p) => p.id)).toEqual(["roadmap"]);
  });

  it("do not mix up with the workspace's own plugins of the same name", () => {
    const result = area({
      workspace: view([plugin({ id: "notes" })]),
      projects: [{ project: web, view: view([plugin({ id: "roadmap" })]) }],
    });
    expect(result.plugins.map((p) => p.id)).toEqual(["notes"]);
    expect(result.projectPlugins.map((p) => p.id)).toEqual(["roadmap"]);
  });
});

describe("the plugins the navigation lists", () => {
  const web = project();
  const result = area({
    workspace: view([
      plugin({ id: "a", name: "A" }),
      plugin({ id: "b", name: "B", settings: null }),
      plugin({ id: "c", name: "C" }),
    ]),
    projects: [
      {
        project: web,
        view: view([
          plugin({ id: "roadmap", name: "Roadmap" }),
          plugin({ id: "quiet", name: "Quiet", settings: null }),
        ]),
      },
    ],
  });

  it("are the ones that have settings, and not the ones that declare none", () => {
    expect(navPlugins(result).map((p) => p.id)).toEqual(["a", "c", "roadmap"]);
  });

  it("say whose they are: the workspace's first, then the ones set per project", () => {
    expect(navPlugins(result).map((p) => p.kind)).toEqual([
      "workspace",
      "workspace",
      "project",
    ]);
  });

  it("carry the plugin's name", () => {
    expect(navPlugins(result).map((p) => p.name)).toEqual([
      "A",
      "C",
      "Roadmap",
    ]);
  });

  it("are none when no plugin has settings", () => {
    expect(
      navPlugins(area({ workspace: view([plugin({ settings: null })]) })),
    ).toEqual([]);
  });

  it("list a plugin set per project once any project it is on in has something to set", () => {
    const mixed = area({
      projects: [
        {
          project: web,
          view: view([plugin({ id: "roadmap", settings: null })]),
        },
        {
          project: project({ id: "p-2", slug: "mobile", name: "Mobile" }),
          view: view([plugin({ id: "roadmap" })]),
        },
      ],
    });
    expect(navPlugins(mixed).map((p) => p.id)).toEqual(["roadmap"]);
  });
});

describe("one workspace plugin's page", () => {
  const result = area({
    workspace: view([
      plugin({ id: "a", name: "A" }),
      plugin({ id: "b", name: "B", settings: null }),
    ]),
    projects: [{ project: project(), view: view([plugin({ id: "roadmap" })]) }],
  });

  it("is the plugin with its form", () => {
    const page = settingsPageOf(result, "a");
    expect(page?.id).toBe("a");
    expect(page?.name).toBe("A");
    expect(page?.settings).toEqual(form());
  });

  it("is not there for a plugin that declares no settings", () => {
    expect(settingsPageOf(result, "b")).toBeNull();
  });

  it("is not there for a plugin that is off here, or that does not exist", () => {
    const off = area({
      workspace: view([plugin({ id: "a", on: false, settings: null })]),
    });
    expect(settingsPageOf(off, "a")).toBeNull();
    expect(settingsPageOf(result, "missing")).toBeNull();
    expect(settingsPageOf(result, "")).toBeNull();
  });

  it("is not there for a plugin that is set per project", () => {
    expect(settingsPageOf(result, "roadmap")).toBeNull();
  });

  it("is looked up by the id and by nothing else", () => {
    expect(settingsPageOf(result, "A")).toBeNull();
    expect(settingsPageOf(result, "a ")).toBeNull();
    expect(settingsPageOf(result, "constructor")).toBeNull();
  });
});

describe("the page of a plugin that is set per project", () => {
  const web = project();
  const mobile = project({ id: "p-2", slug: "mobile", name: "Mobile" });
  const result = area({
    workspace: view([plugin({ id: "a", name: "A" })]),
    projects: [
      {
        project: web,
        view: view([plugin({ id: "roadmap", name: "Roadmap" })]),
      },
      {
        project: mobile,
        view: view([plugin({ id: "roadmap", name: "Roadmap" })]),
      },
    ],
  });

  it("is the plugin with the projects to choose from", () => {
    const chooser = projectChooserOf(result, "roadmap");
    expect(chooser?.name).toBe("Roadmap");
    expect(chooser?.projects.map((p) => p.slug)).toEqual(["mobile", "web-app"]);
  });

  it("is not there for a plugin that declares no settings, or is not set per project, or does not exist", () => {
    const quiet = area({
      projects: [
        { project: web, view: view([plugin({ id: "quiet", settings: null })]) },
      ],
    });
    expect(projectChooserOf(quiet, "quiet")).toBeNull();
    expect(projectChooserOf(result, "a")).toBeNull();
    expect(projectChooserOf(result, "missing")).toBeNull();
  });

  it("is a project's page for a project the plugin is on in and this person may set up", () => {
    const page = projectPageOf(result, "roadmap", "web-app");
    expect(page?.plugin.id).toBe("roadmap");
    expect(page?.project.id).toBe("p-1");
    expect(page?.settings).toEqual(form());
  });

  it("is the page of the project asked for, not another", () => {
    expect(projectPageOf(result, "roadmap", "mobile")?.project.id).toBe("p-2");
    expect(projectPageOf(result, "roadmap", "web-app")?.project.id).toBe("p-1");
  });

  it("is not there for a project the plugin is not on in, or this person may not set up", () => {
    expect(projectPageOf(result, "roadmap", "vault")).toBeNull();
    expect(projectPageOf(result, "roadmap", "")).toBeNull();
    expect(projectPageOf(result, "roadmap", "Web-App")).toBeNull();
  });

  it("is not there for a plugin that does not exist or is the workspace's", () => {
    expect(projectPageOf(result, "missing", "web-app")).toBeNull();
    expect(projectPageOf(result, "a", "web-app")).toBeNull();
  });

  it("is not there for a plugin that declares no settings", () => {
    const quiet = area({
      projects: [
        { project: web, view: view([plugin({ id: "quiet", settings: null })]) },
      ],
    });
    expect(projectPageOf(quiet, "quiet", "web-app")).toBeNull();
  });
});

describe("what a plugin's address in the area shows", () => {
  const result = area({
    workspace: view([
      plugin({ id: "a", name: "A" }),
      plugin({ id: "quiet", name: "Quiet", settings: null }),
    ]),
    projects: [
      {
        project: project(),
        view: view([plugin({ id: "roadmap", name: "Roadmap" })]),
      },
    ],
  });

  it("is the form for a plugin of the workspace's own", () => {
    const page = pluginPageOf(result, "a");
    expect(page?.kind).toBe("settings");
    expect(page?.plugin.id).toBe("a");
    if (page?.kind === "settings") expect(page.plugin.settings).toEqual(form());
  });

  it("is the projects to choose from for a plugin that is set per project", () => {
    const page = pluginPageOf(result, "roadmap");
    expect(page?.kind).toBe("projects");
    expect(page?.plugin.id).toBe("roadmap");
    if (page?.kind === "projects") {
      expect(page.plugin.projects.map((p) => p.slug)).toEqual(["web-app"]);
    }
  });

  it("is not there for a plugin that declares nothing, or that does not exist", () => {
    expect(pluginPageOf(result, "quiet")).toBeNull();
    expect(pluginPageOf(result, "missing")).toBeNull();
    expect(pluginPageOf(result, "")).toBeNull();
  });

  it("is not there for a plugin the person may not set up: nothing of it is in the area", () => {
    const projectsOnly = area({
      workspace: null,
      projects: [
        { project: project(), view: view([plugin({ id: "roadmap" })]) },
      ],
    });
    expect(pluginPageOf(projectsOnly, "a")).toBeNull();
    expect(pluginPageOf(projectsOnly, "roadmap")?.kind).toBe("projects");
  });
});
