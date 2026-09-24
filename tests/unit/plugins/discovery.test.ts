import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type DiscoveredPlugin,
  defaultPluginsDir,
  discoverPlugins,
  MAX_MANIFEST_BYTES,
  PLUGINS_DIR_ENV,
  pluginsDirSetting,
} from "@/lib/plugins/discovery";

// The plugin directory is outside the host's control: names, symlinks and files
// in it come from whoever installed something. These tests build real
// directories in a temporary folder and check that discovery finds what is
// there, reports what is wrong and never throws. No database.

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-plugins-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

function manifestFor(id: string, version: string, extra = {}) {
  return {
    manifestVersion: 1,
    id,
    name: id,
    version,
    description: "A test plugin",
    author: "Someone",
    license: "MIT",
    categories: ["other"],
    barynt: "^0.1.0",
    ...extra,
  };
}

/** Writes `<root>/<id>/<version>/barynt-plugin.json`. */
async function install(
  id: string,
  version: string,
  manifest: unknown = manifestFor(id, version),
) {
  const dir = join(root, id, version);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "barynt-plugin.json"), JSON.stringify(manifest));
  return dir;
}

function issuesOf(plugin: DiscoveredPlugin | undefined): string[] {
  if (!plugin || plugin.ok) throw new Error("expected an invalid plugin");
  return plugin.issues;
}

describe("the plugin directory setting", () => {
  const HOME = "/home/barynt";

  it("has a default, so nothing has to be set: under the home directory", () => {
    expect(pluginsDirSetting({}, HOME)).toEqual({
      dir: "/home/barynt/.barynt/plugins",
      implicit: true,
    });
  });

  it("uses the default too for a variable that is empty or only spaces", () => {
    for (const value of ["", "   ", "\n"]) {
      expect(pluginsDirSetting({ [PLUGINS_DIR_ENV]: value }, HOME)).toEqual({
        dir: "/home/barynt/.barynt/plugins",
        implicit: true,
      });
    }
  });

  it("takes an absolute path as named, not as the default", () => {
    expect(
      pluginsDirSetting({ [PLUGINS_DIR_ENV]: " /data/plugins " }, HOME),
    ).toEqual({ dir: "/data/plugins", implicit: false });
    expect(pluginsDirSetting({ [PLUGINS_DIR_ENV]: "/plugins" }, null)).toEqual({
      dir: "/plugins",
      implicit: false,
    });
  });

  it("refuses a relative path, and does not fall back to the default: a value meant to say something is not quietly replaced", () => {
    const setting = pluginsDirSetting({ [PLUGINS_DIR_ENV]: "plugins" }, HOME);
    expect(setting.dir).toBeNull();
    expect("problem" in setting && setting.problem).toContain("absolute");
    expect("problem" in setting && setting.problem).toContain('"plugins"');
  });

  it.each([
    ["no home directory", null],
    ["an empty one", ""],
    ["a relative one", "home/barynt"],
  ])(
    "is off, with the reason, when there is %s to put a default under",
    (_name, home) => {
      const setting = pluginsDirSetting({}, home);
      expect(setting.dir).toBeNull();
      expect("problem" in setting && setting.problem).toContain(
        PLUGINS_DIR_ENV,
      );
    },
  );

  it("does not need the default when the directory is named, even without a home", () => {
    expect(
      pluginsDirSetting({ [PLUGINS_DIR_ENV]: "/data/plugins" }, null),
    ).toEqual({ dir: "/data/plugins", implicit: false });
  });

  it("reads the real environment and home directory when nothing is passed", () => {
    const setting = pluginsDirSetting();
    // Whatever this machine has: an absolute directory, or off with a reason.
    if (setting.dir === null) expect("problem" in setting).toBe(true);
    else expect(setting.dir.startsWith("/")).toBe(true);
  });

  it("puts the default under the home directory, not the working directory", () => {
    expect(defaultPluginsDir("/home/x")).toBe("/home/x/.barynt/plugins");
    expect(defaultPluginsDir("/root")).toBe("/root/.barynt/plugins");
    expect(defaultPluginsDir(null)).toBeNull();
    expect(defaultPluginsDir("")).toBeNull();
    expect(defaultPluginsDir(".")).toBeNull();
  });
});

describe("finding plugins", () => {
  it("finds a plugin and its manifest", async () => {
    const dir = await install("calendar", "1.0.0");
    const { plugins, issues } = await discoverPlugins(root);
    expect(issues).toEqual([]);
    expect(plugins).toHaveLength(1);
    const [found] = plugins;
    expect(found).toMatchObject({
      id: "calendar",
      version: "1.0.0",
      dir,
      ok: true,
    });
    expect(found?.ok && found.manifest.name).toBe("calendar");
  });

  it("finds an empty or missing directory without a plugin", async () => {
    expect(await discoverPlugins(root)).toEqual({
      plugins: [],
      issues: [],
      rootMissing: false,
    });
    const missing = await discoverPlugins(join(root, "nope"));
    expect(missing.plugins).toEqual([]);
    expect(missing.issues).toHaveLength(1);
    expect(missing.issues[0]).toContain("ENOENT");
  });

  it("says when the directory itself does not exist, and not for anything else", async () => {
    expect((await discoverPlugins(join(root, "nope"))).rootMissing).toBe(true);
    expect((await discoverPlugins(root)).rootMissing).toBe(false);
    // A file where the directory should be is a different problem: it exists.
    const file = join(root, "a-file");
    await writeFile(file, "x");
    const notADirectory = await discoverPlugins(file);
    expect(notADirectory.rootMissing).toBe(false);
    expect(notADirectory.issues).toHaveLength(1);
  });

  it("does not call a missing plugin directory inside the root a missing root", async () => {
    await install("calendar", "1.0.0");
    await rm(join(root, "calendar", "1.0.0"), { recursive: true });
    const found = await discoverPlugins(root);
    expect(found.rootMissing).toBe(false);
  });

  it("sorts by id and then by version as SemVer, not as text", async () => {
    await install("zeta", "1.0.0");
    await install("alpha", "1.10.0");
    await install("alpha", "1.2.0");
    await install("alpha", "1.9.0");
    const { plugins } = await discoverPlugins(root);
    expect(plugins.map((p) => `${p.id}@${p.version}`)).toEqual([
      "alpha@1.2.0",
      "alpha@1.9.0",
      "alpha@1.10.0",
      "zeta@1.0.0",
    ]);
  });

  it("ignores hidden and _ entries and plain files without a word", async () => {
    await install("calendar", "1.0.0");
    await install(".staging", "1.0.0");
    await install("_disabled", "1.0.0");
    await mkdir(join(root, "calendar", ".tmp"), { recursive: true });
    await writeFile(join(root, "README.md"), "hello");
    await writeFile(join(root, "calendar", "notes.txt"), "hello");
    const { plugins, issues } = await discoverPlugins(root);
    expect(issues).toEqual([]);
    expect(plugins.map((p) => p.id)).toEqual(["calendar"]);
  });
});

describe("names that are no plugin", () => {
  it.each(["Foo", "foo bar", "a--b", "a_b", "äb", "core", "x"])(
    "reports the directory %j as not a valid plugin id",
    async (name) => {
      await mkdir(join(root, name), { recursive: true });
      const { plugins, issues } = await discoverPlugins(root);
      expect(plugins).toEqual([]);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain("not a valid plugin id");
    },
  );

  it.each(["1.0", "v1.0.0", "1.0.0+build", "latest", "01.0.0"])(
    "reports the version directory %j",
    async (name) => {
      await mkdir(join(root, "calendar", name), { recursive: true });
      const { plugins, issues } = await discoverPlugins(root);
      expect(plugins).toEqual([]);
      expect(issues).toHaveLength(1);
      expect(issues[0]).toContain("not a valid plugin version");
    },
  );

  it("does not follow a symlink, whether for a plugin or for a version", async () => {
    const elsewhere = await mkdtemp(join(tmpdir(), "barynt-elsewhere-"));
    try {
      await mkdir(join(elsewhere, "1.0.0"), { recursive: true });
      await writeFile(
        join(elsewhere, "1.0.0", "barynt-plugin.json"),
        JSON.stringify(manifestFor("linked", "1.0.0")),
      );
      await symlink(elsewhere, join(root, "linked"));
      await mkdir(join(root, "other"), { recursive: true });
      await symlink(join(elsewhere, "1.0.0"), join(root, "other", "1.0.0"));

      const { plugins, issues } = await discoverPlugins(root);
      expect(plugins).toEqual([]);
      expect(issues).toHaveLength(2);
      for (const issue of issues) expect(issue).toContain("symlink");
    } finally {
      await rm(elsewhere, { recursive: true, force: true });
    }
  });
});

describe("a manifest that is not right", () => {
  it("reports a missing manifest and keeps the plugin listed", async () => {
    await mkdir(join(root, "calendar", "1.0.0"), { recursive: true });
    const { plugins } = await discoverPlugins(root);
    expect(plugins).toHaveLength(1);
    expect(issuesOf(plugins[0])).toEqual(["barynt-plugin.json: is missing"]);
  });

  it("reports broken JSON and an invalid manifest with the field", async () => {
    const dir = await install("calendar", "1.0.0");
    await writeFile(join(dir, "barynt-plugin.json"), "{ not json");
    await install("tracking", "1.0.0", {
      ...manifestFor("tracking", "1.0.0"),
      license: "?",
    });
    const { plugins } = await discoverPlugins(root);
    expect(issuesOf(plugins.find((p) => p.id === "calendar"))[0]).toContain(
      "JSON",
    );
    expect(issuesOf(plugins.find((p) => p.id === "tracking"))[0]).toContain(
      "license",
    );
  });

  it("refuses a manifest that is too large without reading it", async () => {
    const dir = await install("calendar", "1.0.0");
    await writeFile(
      join(dir, "barynt-plugin.json"),
      " ".repeat(MAX_MANIFEST_BYTES + 1),
    );
    const { plugins } = await discoverPlugins(root);
    expect(issuesOf(plugins[0])[0]).toContain("larger than");
  });

  it("refuses a manifest that is a directory or a symlink", async () => {
    const dir = await install("calendar", "1.0.0");
    await rm(join(dir, "barynt-plugin.json"));
    await mkdir(join(dir, "barynt-plugin.json"));
    const linked = await install("tracking", "1.0.0");
    await rm(join(linked, "barynt-plugin.json"));
    await symlink(join(dir, ".."), join(linked, "barynt-plugin.json"));
    const { plugins } = await discoverPlugins(root);
    for (const plugin of plugins) {
      expect(issuesOf(plugin)).toEqual([
        "barynt-plugin.json: is not a regular file",
      ]);
    }
  });

  it("refuses a manifest whose id or version differs from its directory", async () => {
    // The directory names are what the host trusts for paths; a manifest must not claim another.
    await install("calendar", "1.0.0", manifestFor("something-else", "2.0.0"));
    const { plugins } = await discoverPlugins(root);
    expect(issuesOf(plugins[0])).toEqual([
      'id: the manifest says "something-else" but the directory is "calendar"',
      'version: the manifest says "2.0.0" but the directory is "1.0.0"',
    ]);
  });

  it("does not let one broken plugin hide the others", async () => {
    await install("broken", "1.0.0", { nope: true });
    await install("fine", "1.0.0");
    await mkdir(join(root, "Bad Name"), { recursive: true });
    const { plugins, issues } = await discoverPlugins(root);
    expect(plugins.map((p) => `${p.id}:${p.ok}`)).toEqual([
      "broken:false",
      "fine:true",
    ]);
    expect(issues).toHaveLength(1);
  });
});

describe("hostile directories", () => {
  it("never throws when the directory is a file", async () => {
    const file = join(root, "afile");
    await writeFile(file, "x");
    const { plugins, issues } = await discoverPlugins(file);
    expect(plugins).toEqual([]);
    expect(issues).toHaveLength(1);
  });

  it("reports only the error code, not a message with the path in it", async () => {
    const { issues } = await discoverPlugins(join(root, "nope"));
    expect(issues[0]).toMatch(/cannot be read \(ENOENT\)$/);
  });
});
