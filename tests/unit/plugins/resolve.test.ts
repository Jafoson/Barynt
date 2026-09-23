import { describe, expect, it } from "bun:test";
import { valid } from "semver";
import {
  describeProblem,
  type PluginCandidate,
  type Problem,
  previewInstall,
  previewUninstall,
  resolvePlugins,
} from "@/lib/plugins/resolve";
import { BARYNT_VERSION } from "@/lib/version";

// Which installed plugins can load, and in what order. The registry asks this on
// install, on update and at start after a host upgrade, and what it answers
// decides what runs inside the app, so every way a plugin can be left out gets
// a test. Pure logic, no database.

const HOST = "1.4.0";

function plugin(
  id: string,
  {
    version = "1.0.0",
    barynt = ">=1.0.0 <2.0.0",
    dependencies = {},
  }: Partial<PluginCandidate> = {},
): PluginCandidate {
  return { id, version, barynt, dependencies };
}

function codes(problems: Map<string, Problem[]>, id: string): string[] {
  return (problems.get(id) ?? []).map((problem) => problem.code);
}

describe("the host version", () => {
  it("is the version in package.json and a valid SemVer version", () => {
    expect(valid(BARYNT_VERSION)).toBe(BARYNT_VERSION);
  });

  it("throws for a version that is not SemVer, that is a build defect", () => {
    expect(() => resolvePlugins([], "latest")).toThrow(TypeError);
  });
});

describe("compatibility with the host", () => {
  it.each([
    ">=1.0.0 <2.0.0",
    "^1.2.0",
    "~1.4",
    "1.x",
    "1.4.0",
    "^0.9.0 || ^1.0.0",
  ])("loads a plugin for %s on 1.4.0", (barynt) => {
    const { order, problems } = resolvePlugins([plugin("a", { barynt })], HOST);
    expect(order).toEqual(["a"]);
    expect(problems.size).toBe(0);
  });

  it.each([">=2.0.0", "^1.5.0", "~1.3", "^0.9.0", "<1.0.0"])(
    "leaves a plugin for %s out on 1.4.0 and says which range and host",
    (barynt) => {
      const { order, problems } = resolvePlugins(
        [plugin("a", { barynt })],
        HOST,
      );
      expect(order).toEqual([]);
      expect(problems.get("a")).toEqual([
        { code: "host-incompatible", range: barynt, host: HOST },
      ]);
    },
  );

  it("counts a pre-release of the host as its release", () => {
    // 1.5.0-rc.1 is the 1.5 line: a plugin for ^1.5.0 runs on it.
    expect(
      resolvePlugins([plugin("a", { barynt: "^1.5.0" })], "1.5.0-rc.1").order,
    ).toEqual(["a"]);
  });

  it("does not load plugins for 1.x into a pre-release of 2.0", () => {
    // Compared as written, 2.0.0-rc.1 would satisfy "<2.0.0".
    const result = resolvePlugins([plugin("a")], "2.0.0-rc.1");
    expect(result.order).toEqual([]);
    expect(codes(result.problems, "a")).toEqual(["host-incompatible"]);
  });

  it("checks every plugin on its own", () => {
    const result = resolvePlugins(
      [plugin("old", { barynt: "^0.9.0" }), plugin("new")],
      HOST,
    );
    expect(result.order).toEqual(["new"]);
    expect([...result.problems.keys()]).toEqual(["old"]);
  });
});

describe("dependencies", () => {
  it("load a plugin whose dependencies are installed in a fitting version", () => {
    const result = resolvePlugins(
      [
        plugin("calendar", { dependencies: { tracking: "^1.0.0" } }),
        plugin("tracking", { version: "1.2.0" }),
      ],
      HOST,
    );
    expect(result.order).toEqual(["tracking", "calendar"]);
    expect(result.problems.size).toBe(0);
  });

  it("name a dependency that is not installed", () => {
    const { order, problems } = resolvePlugins(
      [plugin("calendar", { dependencies: { tracking: "^1.0.0" } })],
      HOST,
    );
    expect(order).toEqual([]);
    expect(problems.get("calendar")).toEqual([
      { code: "dependency-missing", dependency: "tracking", range: "^1.0.0" },
    ]);
  });

  it("name a dependency in the wrong version, and which one is installed", () => {
    const { problems } = resolvePlugins(
      [
        plugin("calendar", { dependencies: { tracking: "^2.0.0" } }),
        plugin("tracking", { version: "1.2.0" }),
      ],
      HOST,
    );
    expect(problems.get("calendar")).toEqual([
      {
        code: "dependency-version",
        dependency: "tracking",
        range: "^2.0.0",
        installed: "1.2.0",
      },
    ]);
    // The dependency itself is fine and loads.
    expect(problems.has("tracking")).toBe(false);
  });

  it("do not accept a pre-release for a plain range", () => {
    const { problems } = resolvePlugins(
      [
        plugin("calendar", { dependencies: { tracking: "^1.0.0" } }),
        plugin("tracking", { version: "1.1.0-beta.1" }),
      ],
      HOST,
    );
    expect(codes(problems, "calendar")).toEqual(["dependency-version"]);
  });

  it("report every problem of a plugin, not only the first", () => {
    const { problems } = resolvePlugins(
      [
        plugin("calendar", {
          barynt: "^2.0.0",
          dependencies: { gone: "^1.0.0", tracking: "^9.0.0" },
        }),
        plugin("tracking"),
      ],
      HOST,
    );
    expect(codes(problems, "calendar")).toEqual([
      "host-incompatible",
      "dependency-missing",
      "dependency-version",
    ]);
  });

  it("leave a plugin out when its dependency cannot load, however deep", () => {
    // c needs b needs a, and a is not compatible with the host.
    const result = resolvePlugins(
      [
        plugin("a", { barynt: "^2.0.0" }),
        plugin("b", { dependencies: { a: "^1.0.0" } }),
        plugin("c", { dependencies: { b: "^1.0.0" } }),
        plugin("d"),
      ],
      HOST,
    );
    expect(result.order).toEqual(["d"]);
    expect(result.problems.get("b")).toEqual([
      { code: "dependency-unavailable", dependency: "a" },
    ]);
    expect(result.problems.get("c")).toEqual([
      { code: "dependency-unavailable", dependency: "b" },
    ]);
  });
});

describe("cycles", () => {
  it("leave out both plugins of a loop and name the members, once", () => {
    const { order, problems } = resolvePlugins(
      [
        plugin("a", { dependencies: { b: "^1.0.0" } }),
        plugin("b", { dependencies: { a: "^1.0.0" } }),
        plugin("free"),
      ],
      HOST,
    );
    expect(order).toEqual(["free"]);
    for (const id of ["a", "b"]) {
      expect(problems.get(id)).toEqual([
        { code: "dependency-cycle", members: ["a", "b"] },
      ]);
    }
  });

  it("find a loop of three", () => {
    const { problems } = resolvePlugins(
      [
        plugin("a", { dependencies: { b: "^1.0.0" } }),
        plugin("b", { dependencies: { c: "^1.0.0" } }),
        plugin("c", { dependencies: { a: "^1.0.0" } }),
      ],
      HOST,
    );
    for (const id of ["a", "b", "c"]) {
      expect(problems.get(id)).toEqual([
        { code: "dependency-cycle", members: ["a", "b", "c"] },
      ]);
    }
  });

  it("find a plugin that depends on itself", () => {
    // The manifest refuses this, but the resolver must not trust that.
    const { order, problems } = resolvePlugins(
      [plugin("a", { dependencies: { a: "^1.0.0" } })],
      HOST,
    );
    expect(order).toEqual([]);
    expect(problems.get("a")).toEqual([
      { code: "dependency-cycle", members: ["a"] },
    ]);
  });

  it("blame a plugin that only depends on a loop for its dependency, not for a cycle", () => {
    const { problems } = resolvePlugins(
      [
        plugin("a", { dependencies: { b: "^1.0.0" } }),
        plugin("b", { dependencies: { a: "^1.0.0" } }),
        plugin("user", { dependencies: { a: "^1.0.0" } }),
      ],
      HOST,
    );
    expect(problems.get("user")).toEqual([
      { code: "dependency-unavailable", dependency: "a" },
    ]);
  });

  it("find a loop that a diamond does not hide", () => {
    // top -> left, right -> bottom is not a loop; bottom -> top would make one.
    const diamond = [
      plugin("top", { dependencies: { left: "^1.0.0", right: "^1.0.0" } }),
      plugin("left", { dependencies: { bottom: "^1.0.0" } }),
      plugin("right", { dependencies: { bottom: "^1.0.0" } }),
    ];
    expect(
      resolvePlugins([...diamond, plugin("bottom")], HOST).problems.size,
    ).toBe(0);
    const looped = resolvePlugins(
      [...diamond, plugin("bottom", { dependencies: { top: "^1.0.0" } })],
      HOST,
    );
    expect(looped.order).toEqual([]);
    expect(codes(looped.problems, "bottom")).toEqual(["dependency-cycle"]);
  });
});

describe("load order", () => {
  it("puts dependencies before dependents", () => {
    const { order } = resolvePlugins(
      [
        plugin("c", { dependencies: { b: "^1.0.0" } }),
        plugin("b", { dependencies: { a: "^1.0.0" } }),
        plugin("a"),
      ],
      HOST,
    );
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("sorts plugins with no order between them by id", () => {
    const { order } = resolvePlugins(
      [plugin("zeta"), plugin("alpha"), plugin("mid")],
      HOST,
    );
    expect(order).toEqual(["alpha", "mid", "zeta"]);
  });

  it("does not depend on the order of the input", () => {
    const set = [
      plugin("app", { dependencies: { left: "^1.0.0", right: "^1.0.0" } }),
      plugin("left", { dependencies: { base: "^1.0.0" } }),
      plugin("right", { dependencies: { base: "^1.0.0" } }),
      plugin("base"),
      plugin("solo"),
    ];
    const expected = resolvePlugins(set, HOST).order;
    expect(expected).toEqual(["base", "left", "right", "app", "solo"]);
    expect(resolvePlugins([...set].reverse(), HOST).order).toEqual(expected);
    expect(
      resolvePlugins(
        [set[3], set[0], set[4], set[2], set[1]] as PluginCandidate[],
        HOST,
      ).order,
    ).toEqual(expected);
  });

  it("copes with a long chain", () => {
    const chain = Array.from({ length: 300 }, (_, i) =>
      plugin(
        `p${String(i).padStart(3, "0")}`,
        i === 0
          ? {}
          : {
              dependencies: {
                [`p${String(i - 1).padStart(3, "0")}`]: "^1.0.0",
              },
            },
      ),
    );
    const { order, problems } = resolvePlugins(chain, HOST);
    expect(problems.size).toBe(0);
    expect(order).toHaveLength(300);
    expect(order[0]).toBe("p000");
    expect(order[299]).toBe("p299");
  });

  it("lets the later entry win when an id appears twice", () => {
    const { order } = resolvePlugins(
      [plugin("a", { barynt: "^2.0.0" }), plugin("a")],
      HOST,
    );
    expect(order).toEqual(["a"]);
  });

  it("handles ids that are also names on Object.prototype", () => {
    const { order, problems } = resolvePlugins(
      [
        plugin("constructor", { dependencies: { "to-string": "^1.0.0" } }),
        plugin("to-string"),
      ],
      HOST,
    );
    expect(order).toEqual(["to-string", "constructor"]);
    expect(problems.size).toBe(0);
  });
});

describe("previewing an install or update", () => {
  const tracking = plugin("tracking", { version: "1.2.0" });
  const calendar = plugin("calendar", {
    dependencies: { tracking: "^1.0.0" },
  });

  it("says a compatible plugin can load and breaks nothing", () => {
    const preview = previewInstall([tracking], calendar, HOST);
    expect(preview).toEqual({ problems: [], breaks: [] });
  });

  it("says why a new plugin could not load", () => {
    const preview = previewInstall([], calendar, HOST);
    expect(preview.problems.map((problem) => problem.code)).toEqual([
      "dependency-missing",
    ]);
  });

  it("finds the plugins an update would break", () => {
    // tracking 2.0.0 leaves calendar's ^1.0.0 behind.
    const preview = previewInstall(
      [tracking, calendar],
      plugin("tracking", { version: "2.0.0" }),
      HOST,
    );
    expect(preview.problems).toEqual([]);
    expect(preview.breaks).toEqual(["calendar"]);
  });

  it("does not count a plugin that could not load before as broken", () => {
    const stuck = plugin("stuck", {
      barynt: "^3.0.0",
      dependencies: { tracking: "^1.0.0" },
    });
    const preview = previewInstall(
      [tracking, stuck],
      plugin("tracking", { version: "2.0.0" }),
      HOST,
    );
    expect(preview.breaks).toEqual([]);
  });

  it("finds the plugins that stop loading when one is removed, however deep", () => {
    const report = plugin("report", { dependencies: { calendar: "^1.0.0" } });
    expect(
      previewUninstall(
        [tracking, calendar, report, plugin("other")],
        "tracking",
        HOST,
      ),
    ).toEqual(["calendar", "report"]);
  });

  it("says nothing breaks when a plugin nobody needs is removed", () => {
    expect(previewUninstall([tracking, calendar], "calendar", HOST)).toEqual(
      [],
    );
  });
});

describe("the English text of a problem", () => {
  const all: Problem[] = [
    { code: "host-incompatible", range: "^2.0.0", host: "1.4.0" },
    { code: "dependency-missing", dependency: "tracking", range: "^1.0.0" },
    {
      code: "dependency-version",
      dependency: "tracking",
      range: "^2.0.0",
      installed: "1.2.0",
    },
    { code: "dependency-unavailable", dependency: "tracking" },
    { code: "dependency-cycle", members: ["a", "b"] },
  ];

  it.each(all)("says something specific for $code", (problem) => {
    const text = describeProblem(problem);
    expect(text.length).toBeGreaterThan(10);
    // Every value the code carries is in the text, so a log line stands alone.
    for (const value of Object.values(problem).flat()) {
      if (value !== problem.code) expect(text).toContain(String(value));
    }
  });
});
