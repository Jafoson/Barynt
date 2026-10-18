import { describe, expect, it } from "bun:test";
import {
  defaultWidgets,
  ELEMENTS,
  elementOf,
  elementsOf,
  fitSize,
  labelsOf,
  layoutKey,
  moveWidgetTo,
  newWidget,
  normalizeWidget,
  notePagesSchema,
  parseWidgets,
  pickShortcuts,
  SIZE_SPAN,
  WIDGET_SIZES,
  WIDGET_TYPES,
  WIDGETS,
  type Widget,
} from "@/features/dashboard/widgets";

// The dashboard's widget registry (BARY-169). Pure data and arithmetic — the
// kind of code whose bugs show months later: a stored layout from an older
// registry that suddenly fails to load, or a size a kind can't draw.

describe("The registry", () => {
  it("describes every kind, with a default size it offers", () => {
    for (const type of WIDGET_TYPES) {
      const def = WIDGETS[type];
      expect(def.type).toBe(type);
      expect(def.sizes.length).toBeGreaterThan(0);
      expect(def.sizes).toContain(def.size);
    }
  });

  it("lists every kind's sizes small to large", () => {
    for (const type of WIDGET_TYPES) {
      const ranks = WIDGETS[type].sizes.map((s) => WIDGET_SIZES.indexOf(s));
      expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
    }
  });

  it("lets only kinds without data colors take a full background", () => {
    const fill = WIDGET_TYPES.filter((type) => WIDGETS[type].fill);
    expect(fill.sort()).toEqual(["kpi", "note", "progress"]);
  });

  it("gives the tall size two columns and four rows", () => {
    expect(SIZE_SPAN.T).toEqual({ cols: 2, rows: 4 });
    expect(SIZE_SPAN.XL).toEqual({ cols: 4, rows: 2 });
  });
});

describe("Defaults", () => {
  const all = [
    ["project", "all"],
    ["project", "mine"],
    ["workspace", "all"],
    ["workspace", "mine"],
    ["view", "all"],
  ] as const;

  for (const [kind, scope] of all) {
    it(`builds a valid ${kind} dashboard (${scope})`, () => {
      const widgets = defaultWidgets(kind, scope);
      expect(parseWidgets(widgets)).toEqual(widgets);
      expect(new Set(widgets.map((w) => w.id)).size).toBe(widgets.length);
    });

    it(`fills whole rows of eight columns (${kind}, ${scope})`, () => {
      const cells = defaultWidgets(kind, scope).reduce(
        (sum, w) => sum + SIZE_SPAN[w.size].cols * SIZE_SPAN[w.size].rows,
        0,
      );
      expect(cells % 8).toBe(0);
    });
  }

  it("has no about card on a view", () => {
    expect(defaultWidgets("view").some((w) => w.type === "about")).toBe(false);
  });
});

describe("Reading stored widgets", () => {
  it("rejects what doesn't validate", () => {
    expect(parseWidgets(null)).toBeNull();
    expect(
      parseWidgets([{ id: "a", type: "nope", size: "S", config: {} }]),
    ).toBeNull();
    expect(
      parseWidgets([
        { id: "a", type: "kpi", size: "S", config: {} },
        { id: "a", type: "kpi", size: "S", config: {} },
      ]),
    ).toBeNull();
  });

  it("brings a size the kind doesn't offer to the nearest one", () => {
    expect(fitSize("age", "XL")).toBe("L");
    expect(fitSize("about", "S")).toBe("M");
    expect(fitSize("flow", "L")).toBe("L");
  });

  it("turns a full background into a tint where it isn't allowed", () => {
    const widget: Widget = {
      id: "x",
      type: "distribution",
      size: "L",
      config: { background: "fill" },
    };
    expect(normalizeWidget(widget).config.background).toBe("tint");
  });
});

describe("Editing", () => {
  const list = ["a", "b", "c", "d"].map((id) => newWidget("kpi", id));
  const ids = (widgets: Widget[]) => widgets.map((w) => w.id);

  it("moves a widget to where another one sits", () => {
    expect(ids(moveWidgetTo(list, "a", "c"))).toEqual(["b", "c", "a", "d"]);
    expect(ids(moveWidgetTo(list, "d", "a"))).toEqual(["d", "a", "b", "c"]);
  });

  it("leaves the list alone for unknown ids", () => {
    expect(moveWidgetTo(list, "x", "a")).toBe(list);
    expect(moveWidgetTo(list, "a", "a")).toBe(list);
  });

  it("keys the shared and the personal layout apart", () => {
    expect(layoutKey({ kind: "project", id: "p1" }, null)).toBe("project:p1");
    expect(layoutKey({ kind: "project", id: "p1" }, "u1")).toBe(
      "project:p1:u1",
    );
  });
});

describe("Shortcuts", () => {
  const offered = [
    { key: "board" as const, default: true },
    { key: "list" as const, default: false },
    { key: "settings" as const, default: true },
  ];

  it("shows the default tiles while nothing is chosen", () => {
    expect(pickShortcuts(offered, undefined).map((s) => s.key)).toEqual([
      "board",
      "settings",
    ]);
  });

  it("keeps the chosen order and drops what isn't offered", () => {
    expect(
      pickShortcuts(offered, ["settings", "inbox", "board"]).map((s) => s.key),
    ).toEqual(["settings", "board"]);
  });
});

describe("Notes", () => {
  it("never carry their text in a layout — it's private", () => {
    const widget = {
      id: "n",
      type: "note",
      size: "M",
      config: { text: "geheim", pages: [{ id: "a", text: "geheim" }] },
    };
    const [read] = parseWidgets([widget]) ?? [];
    expect(read.config).toEqual({});
  });

  it("store pages as documents, older ones as text", () => {
    const doc = { type: "doc", content: [{ type: "paragraph" }] };
    expect(notePagesSchema.safeParse([{ id: "a", doc }]).success).toBe(true);
    expect(notePagesSchema.safeParse([{ id: "a", text: "alt" }]).success).toBe(
      true,
    );
    expect(notePagesSchema.safeParse([]).success).toBe(false);
  });
});

describe("Measures and time series (BARY-170)", () => {
  it("accepts a measure, a time axis and a split", () => {
    const widget = {
      id: "f",
      type: "flow",
      size: "XL",
      config: {
        measure: "storyPoints",
        timeBy: "closed",
        splitBy: "priority",
        seriesChart: "stacked",
      },
    };
    expect(parseWidgets([widget])).toEqual([widget as Widget]);
  });

  it("rejects an unknown measure", () => {
    expect(
      parseWidgets([
        { id: "k", type: "kpi", size: "S", config: { measure: "money" } },
      ]),
    ).toBeNull();
  });
});

describe("Elements (BARY-170)", () => {
  const kpi = (config: Widget["config"] = {}): Widget => ({
    id: "k",
    type: "kpi",
    size: "M",
    config,
  });

  it("gives an untouched widget today's look", () => {
    expect(elementsOf(kpi()).map((e) => e.kind)).toEqual(["trend", "spark"]);
    expect(labelsOf({ id: "f", type: "flow", size: "XL", config: {} })).toEqual(
      { legend: true, axes: true, values: true },
    );
  });

  it("honors the older label switches", () => {
    const flow: Widget = {
      id: "f",
      type: "flow",
      size: "XL",
      config: { labels: { legend: false, axes: true, values: false } },
    };
    expect(elementsOf(flow).map((e) => e.kind)).toEqual(["axes"]);
  });

  it("shows due dates for a list sorted by them", () => {
    const list: Widget = {
      id: "l",
      type: "issues",
      size: "L",
      config: { sort: "dueDate" },
    };
    expect(elementsOf(list).map((e) => e.kind)).toEqual(["col_dueDate"]);
  });

  it("keeps the stored order and drops what the kind doesn't offer", () => {
    const widget = kpi({
      elements: [
        { id: "a", kind: "goal", value: 25 },
        { id: "b", kind: "heatmap" },
        { id: "c", kind: "trend" },
      ],
    });
    expect(elementsOf(widget).map((e) => e.kind)).toEqual(["goal", "trend"]);
    expect(elementOf(widget, "goal")?.value).toBe(25);
    expect(elementOf(widget, "spark")).toBeUndefined();
  });

  it("an empty list means no elements, not the defaults", () => {
    expect(elementsOf(kpi({ elements: [] }))).toEqual([]);
  });

  it("stores elements with their values and rejects bad ones", () => {
    const widget = kpi({
      elements: [
        { id: "g", kind: "goal", value: 20 },
        {
          id: "s",
          kind: "second",
          filter: { op: "and", rules: [] },
        },
      ],
    });
    expect(parseWidgets([widget])).toEqual([widget]);
    expect(
      parseWidgets([kpi({ elements: [{ id: "x", kind: "nope" as "goal" }] })]),
    ).toBeNull();
    expect(
      parseWidgets([
        kpi({ elements: [{ id: "d", kind: "goal", date: "18.10.2026" }] }),
      ]),
    ).toBeNull();
  });

  it("every offered element is a known kind, once per widget kind", () => {
    for (const defs of Object.values(ELEMENTS)) {
      const kinds = (defs ?? []).map((d) => d.kind);
      expect(new Set(kinds).size).toBe(kinds.length);
    }
  });
});
