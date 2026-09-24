import { describe, expect, it } from "bun:test";
import {
  categoryCounts,
  filterEntries,
  hueOf,
  initials,
  pickFeatured,
  releasedOf,
} from "@/features/plugins/storeView";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";

// What the store page does with the catalog: search, filter, count, feature. Pure.

function entry(id: string, more: Partial<CatalogEntry> = {}): CatalogEntry {
  return {
    key: `s/${id}`,
    storeId: "s",
    storeName: "Official",
    official: true,
    id,
    name: id,
    description: `The ${id} plugin`,
    author: "Someone",
    license: "MIT",
    homepage: null,
    repository: null,
    categories: ["other"],
    keywords: [],
    capabilities: [],
    scope: "WORKSPACE",
    hasCode: false,
    barynt: "^0.1.0",
    compatible: true,
    offered: "1.0.0",
    versions: [
      {
        version: "1.0.0",
        released: "2026-01-01",
        changelog: null,
        revoked: false,
        revokedReason: null,
      },
    ],
    installed: null,
    ...more,
  };
}

const installed = { version: "1.0.0", fromThisStore: true, update: null };

describe("searching", () => {
  const entries = [
    entry("notes", {
      name: "Notes",
      description: "Write notes next to issues",
      keywords: ["text", "writing"],
      author: "Mara Velez",
    }),
    entry("gantt", {
      name: "Gantt chart",
      description: "Plans projects",
      categories: ["planning"],
      storeName: "Acme",
    }),
  ];
  const find = (query: string) =>
    filterEntries(entries, { query, category: null, view: "discover" }).map(
      (e) => e.id,
    );

  it("finds by name, id, description, author, keyword, category and store, in any case", () => {
    expect(find("NOTES")).toEqual(["notes"]);
    expect(find("gantt-chart")).toEqual([]);
    expect(find("gantt")).toEqual(["gantt"]);
    expect(find("timeline")).toEqual([]);
    expect(find("plans")).toEqual(["gantt"]);
    expect(find("velez")).toEqual(["notes"]);
    expect(find("writing")).toEqual(["notes"]);
    expect(find("planning")).toEqual(["gantt"]);
    expect(find("acme")).toEqual(["gantt"]);
  });

  it("needs every word, in any order and any place", () => {
    expect(find("notes mara")).toEqual(["notes"]);
    expect(find("mara notes")).toEqual(["notes"]);
    expect(find("notes acme")).toEqual([]);
  });

  it("shows everything for an empty search, or one of spaces", () => {
    expect(find("")).toEqual(["notes", "gantt"]);
    expect(find("   ")).toEqual(["notes", "gantt"]);
  });

  it("does not treat what is typed as a pattern", () => {
    expect(find(".*")).toEqual([]);
    expect(find("(")).toEqual([]);
  });
});

describe("the view and the category", () => {
  const entries = [
    entry("a-plugin", { categories: ["planning"], installed }),
    entry("b-plugin", { categories: ["planning", "reporting"] }),
    entry("c-plugin", { categories: ["reporting"], installed }),
  ];
  const ids = (
    category: string | null,
    view: "discover" | "installed",
    query = "",
  ) => filterEntries(entries, { query, category, view }).map((e) => e.id);

  it("shows everything to discover, and only what is installed under installed", () => {
    expect(ids(null, "discover")).toEqual(["a-plugin", "b-plugin", "c-plugin"]);
    expect(ids(null, "installed")).toEqual(["a-plugin", "c-plugin"]);
  });

  it("narrows to a category, an entry being in as many as it lists", () => {
    expect(ids("planning", "discover")).toEqual(["a-plugin", "b-plugin"]);
    expect(ids("reporting", "discover")).toEqual(["b-plugin", "c-plugin"]);
    expect(ids("security", "discover")).toEqual([]);
  });

  it("combines the view, the category and the search", () => {
    expect(ids("reporting", "installed")).toEqual(["c-plugin"]);
    expect(ids("planning", "discover", "b-")).toEqual(["b-plugin"]);
  });
});

describe("counting the categories", () => {
  const entries = [
    entry("a-plugin", { categories: ["planning", "other"], installed }),
    entry("b-plugin", { categories: ["planning"] }),
    entry("c-plugin", { categories: ["reporting"] }),
    entry("d-plugin", { categories: ["reporting"] }),
    entry("e-plugin", { categories: ["automation"] }),
  ];

  it("counts each category once for each entry in it, most first, then by id", () => {
    expect(categoryCounts(entries, { query: "", view: "discover" })).toEqual([
      { category: "planning", count: 2 },
      { category: "reporting", count: 2 },
      { category: "automation", count: 1 },
      { category: "other", count: 1 },
    ]);
  });

  it("leaves out categories nothing is in", () => {
    const counted = categoryCounts(entries, {
      query: "",
      view: "discover",
    }).map((c) => c.category);
    expect(counted).not.toContain("security");
  });

  it("counts what the view and the search leave, so a chip never promises more than the list shows", () => {
    expect(categoryCounts(entries, { query: "", view: "installed" })).toEqual([
      { category: "other", count: 1 },
      { category: "planning", count: 1 },
    ]);
    expect(
      categoryCounts(entries, { query: "c-plugin", view: "discover" }),
    ).toEqual([{ category: "reporting", count: 1 }]);
  });
});

describe("what to feature", () => {
  const dated = (
    id: string,
    released: string | null,
    more: Partial<CatalogEntry> = {},
  ) =>
    entry(id, {
      versions: [
        {
          version: "1.0.0",
          released,
          changelog: null,
          revoked: false,
          revokedReason: null,
        },
      ],
      ...more,
    });

  it("is the three most recently released, newest first, ties by name", () => {
    const entries = [
      dated("old-plugin", "2026-01-01"),
      dated("newest", "2026-09-20"),
      dated("beta-plugin", "2026-09-01", { name: "Beta" }),
      dated("alpha-plugin", "2026-09-01", { name: "Alpha" }),
      dated("middle", "2026-05-05"),
    ];
    expect(pickFeatured(entries).map((e) => e.id)).toEqual([
      "newest",
      "alpha-plugin",
      "beta-plugin",
    ]);
  });

  it("leaves out what could not be installed: incompatible, all withdrawn, or without a date", () => {
    const entries = [
      dated("fine-one", "2026-01-01"),
      dated("no-fit", "2026-09-20", { compatible: false }),
      dated("gone", "2026-09-19", { offered: null }),
      dated("undated", null),
      dated("fine-two", "2026-01-02"),
    ];
    expect(pickFeatured(entries, 2).map((e) => e.id)).toEqual([
      "fine-two",
      "fine-one",
    ]);
  });

  it("is nothing when there are too few entries for it to mean anything", () => {
    expect(
      pickFeatured([
        dated("a-plugin", "2026-01-01"),
        dated("b-plugin", "2026-01-02"),
      ]),
    ).toEqual([]);
    expect(
      pickFeatured(
        [dated("a-plugin", "2026-01-01"), dated("b-plugin", "2026-01-02")],
        2,
      ),
    ).toHaveLength(2);
  });

  it("says when the version on offer was released", () => {
    expect(releasedOf(dated("a-plugin", "2026-03-04"))).toBe("2026-03-04");
    expect(releasedOf(dated("a-plugin", null))).toBeNull();
    expect(
      releasedOf(
        entry("a-plugin", {
          offered: "2.0.0",
          versions: [
            {
              version: "2.0.0",
              released: "2026-08-08",
              changelog: null,
              revoked: false,
              revokedReason: null,
            },
            {
              version: "1.0.0",
              released: "2026-01-01",
              changelog: null,
              revoked: false,
              revokedReason: null,
            },
          ],
        }),
      ),
    ).toBe("2026-08-08");
    expect(releasedOf(entry("a-plugin", { offered: null }))).toBeNull();
  });
});

describe("an avatar", () => {
  it.each([
    ["GitHub Sync", "GS"],
    ["Notes", "NO"],
    ["gantt-chart", "GC"],
    ["a", "A"],
    ["  spaced   out  name ", "SO"],
    ["", "?"],
    ["   ", "?"],
    ["Zeiterfassung", "ZE"],
  ])("has the letters for %j: %s", (name, letters) => {
    expect(initials(name)).toBe(letters);
  });

  it("has a colour that stays the same for the same id, from 0 to 359", () => {
    expect(hueOf("notes")).toBe(hueOf("notes"));
    for (const id of ["a", "notes", "gantt-chart", "x".repeat(200)]) {
      const hue = hueOf(id);
      expect(hue).toBeGreaterThanOrEqual(0);
      expect(hue).toBeLessThan(360);
    }
  });

  it("differs between ids that are not alike", () => {
    expect(
      new Set(
        ["notes", "gantt", "board", "wiki", "tracker", "calendar"].map(hueOf),
      ).size,
    ).toBeGreaterThan(3);
  });
});
