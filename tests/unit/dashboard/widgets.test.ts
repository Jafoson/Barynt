import { describe, expect, it } from "bun:test";
import {
  andFilters,
  BLOCK_TYPES,
  blockWidget,
  defaultWidgets,
  ELEMENTS,
  elementOf,
  elementOptions,
  elementsOf,
  fitSize,
  fitsSize,
  labelsOf,
  layoutKey,
  minSizeChoices,
  moveWidgetTo,
  newWidget,
  normalizeLinkUrl,
  normalizeWidget,
  notePagesSchema,
  offeredOn,
  parseWidgets,
  pickShortcuts,
  SIZE_SPAN,
  shownBlocks,
  shownElements,
  TEMPLATES,
  templateBlocks,
  toBlocks,
  WIDGET_SIZES,
  WIDGET_TYPES,
  WIDGETS,
  type Widget,
  widgetsSchema,
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

describe("Element settings (BARY-170)", () => {
  it("stores an element's own settings", () => {
    const widget: Widget = {
      id: "k",
      type: "kpi",
      size: "L",
      config: {
        elements: [
          { id: "t", kind: "trend", style: "pct", flag: true },
          { id: "m", kind: "miniList", value: 5, sort: "dueDate" },
          { id: "s", kind: "second", label: "dringend", minSize: "L" },
        ],
      },
    };
    expect(parseWidgets([widget])).toEqual([widget]);
  });

  it("rejects an unknown style or a too long label", () => {
    const kpi = (element: object) => ({
      id: "k",
      type: "kpi",
      size: "S",
      config: { elements: [{ id: "x", kind: "trend", ...element }] },
    });
    expect(parseWidgets([kpi({ style: "wavy" })])).toBeNull();
    expect(parseWidgets([kpi({ label: "x".repeat(41) })])).toBeNull();
  });

  it("hides an element below the size it can show in", () => {
    // By nature: a spark needs two columns, a mini list a second row.
    expect(fitsSize("kpi", { kind: "spark" }, "S")).toBe(false);
    expect(fitsSize("kpi", { kind: "spark" }, "M")).toBe(true);
    expect(fitsSize("kpi", { kind: "miniList" }, "M")).toBe(false);
    expect(fitsSize("kpi", { kind: "miniList" }, "W")).toBe(false);
    expect(fitsSize("kpi", { kind: "miniList" }, "L")).toBe(true);
    expect(fitsSize("kpi", { kind: "trend" }, "S")).toBe(true);
    // By choice — only ever higher than by nature.
    expect(fitsSize("kpi", { kind: "trend", minSize: "XL" }, "T")).toBe(true);
    expect(fitsSize("kpi", { kind: "trend", minSize: "XL" }, "L")).toBe(false);
    expect(fitsSize("kpi", { kind: "spark", minSize: "S" }, "S")).toBe(false);
    expect(minSizeChoices("kpi", "spark")).toEqual(["M", "L", "XL"]);
    const widget: Widget = {
      id: "k",
      type: "kpi",
      size: "S",
      config: {
        elements: [
          { id: "t", kind: "trend" },
          { id: "s", kind: "spark" },
        ],
      },
    };
    expect(shownElements(widget).map((e) => e.kind)).toEqual(["trend"]);
  });

  it("offers settings only where an element has some", () => {
    expect(elementOptions("kpi", "trend").map((o) => o.key)).toEqual([
      "style",
      "flag",
    ]);
    expect(elementOptions("matrix", "axes")).toEqual([]);
    // The same element, different settings per kind.
    expect(elementOptions("issues", "link").map((o) => o.key)).toEqual([
      "label",
    ]);
  });
});

describe("Blocks and templates (BARY-170)", () => {
  let n = 0;
  const id = () => `b${++n}`;
  const rule = (value: number) => ({
    op: "and" as const,
    rules: [{ field: "priority" as const, is: "gte" as const, value }],
  });

  it("every template validates as a custom widget", () => {
    for (const key of TEMPLATES) {
      const widget: Widget = {
        id: "w",
        type: "blocks",
        size: "L",
        config: { blocks: templateBlocks(key, id) },
      };
      expect(parseWidgets([widget])).not.toBeNull();
    }
    expect(templateBlocks("empty", id)).toEqual([]);
    expect(templateBlocks("sprint", id).map((b) => b.type)).toEqual([
      "progress",
      "kpi",
      "issues",
    ]);
  });

  it("rejects a block of a kind that can't be one, or a widget's field", () => {
    const blocks = (block: object) => [
      { id: "w", type: "blocks", size: "L", config: { blocks: [block] } },
    ];
    expect(
      parseWidgets(blocks({ id: "a", type: "members", config: {} })),
    ).toBeNull();
    expect(
      parseWidgets(blocks({ id: "a", type: "kpi", config: { title: "x" } })),
    ).toBeNull();
  });

  it("a block counts with the widget's filter and its own", () => {
    const widget: Widget = {
      id: "w",
      type: "blocks",
      size: "L",
      config: { filter: rule(2), accent: "red" },
    };
    const block = {
      id: "b",
      type: "kpi" as const,
      config: { metric: "open" as const, filter: rule(3) },
    };
    const as = blockWidget(widget, block);
    expect(as.type).toBe("kpi");
    expect(as.size).toBe("L");
    expect(as.config.filter).toEqual({ op: "and", rules: [rule(2), rule(3)] });
    expect(andFilters(undefined, rule(3))).toEqual(rule(3));
    expect(andFilters(rule(2), { op: "and", rules: [] })).toEqual(rule(2));
  });

  it("draws only the first block below size L", () => {
    const widget = (size: Widget["size"]): Widget => ({
      id: "w",
      type: "blocks",
      size,
      config: { blocks: templateBlocks("sprint", id) },
    });
    expect(shownBlocks(widget("M"))).toHaveLength(1);
    expect(shownBlocks(widget("W"))).toHaveLength(1);
    expect(shownBlocks(widget("L"))).toHaveLength(3);
    expect(shownBlocks(widget("XL"))).toHaveLength(3);
  });

  it("turns an older one-kind custom widget into one block", () => {
    const old: Widget = {
      id: "c",
      type: "kpi",
      size: "M",
      config: {
        title: "Dringend",
        metric: "urgent",
        filter: rule(3),
        background: "fill",
        accent: "red",
      },
    };
    const converted = toBlocks(old);
    expect(converted.type).toBe("blocks");
    expect(converted.config.title).toBe("Dringend");
    expect(converted.config.filter).toEqual(rule(3));
    // Blocks may hold charts — no `fill`.
    expect(converted.config.background).toBe("tint");
    expect(converted.config.blocks).toHaveLength(1);
    const [block] = converted.config.blocks ?? [];
    expect(block.type).toBe("kpi");
    expect(block.config.metric).toBe("urgent");
    // Its extras as they showed before.
    expect(block.config.elements?.map((e) => e.kind)).toEqual([
      "trend",
      "spark",
    ]);
    expect(parseWidgets([converted])).not.toBeNull();
    // Already blocks, or not a block kind: unchanged.
    expect(toBlocks(converted)).toBe(converted);
    const members: Widget = { id: "m", type: "members", size: "L", config: {} };
    expect(toBlocks(members)).toBe(members);
  });

  it("the gallery doesn't list the blocks kind itself", () => {
    expect(offeredOn("blocks", "project")).toBe(false);
    expect(BLOCK_TYPES.every((type) => offeredOn(type, "project"))).toBe(true);
  });
});

describe("Flow metrics (BARY-171)", () => {
  it("stores the flow widgets' settings", () => {
    const widgets = [
      {
        id: "b",
        type: "burnup",
        size: "XL",
        config: { burn: "down", targetDate: "2026-10-31" },
      },
      {
        id: "c",
        type: "cycle",
        size: "L",
        config: { cycleBy: "cycle", cycleView: "histogram" },
      },
      {
        id: "f",
        type: "cfd",
        size: "XL",
        config: { flowBy: "status", hideDone: true },
      },
      { id: "t", type: "timeInStatus", size: "L", config: {} },
    ];
    expect(parseWidgets(widgets)).toEqual(widgets as Widget[]);
  });

  it("rejects a target date that isn't a day", () => {
    expect(
      parseWidgets([
        {
          id: "b",
          type: "burnup",
          size: "XL",
          config: { burn: "down", targetDate: "31.10.2026" },
        },
      ]),
    ).toBeNull();
  });

  it("the new kinds are offered on every dashboard", () => {
    for (const kind of ["project", "workspace", "view"] as const) {
      expect(offeredOn("cfd", kind)).toBe(true);
      expect(offeredOn("timeInStatus", kind)).toBe(true);
    }
  });
});

describe("order of list widgets (BARY-182)", () => {
  const attention = (sort: string) => [
    { id: "w1", type: "attention", size: "L", config: { sort } },
  ];

  it("takes urgency, oldest and the issue orders, nothing else", () => {
    expect(widgetsSchema.safeParse(attention("urgency")).success).toBe(true);
    expect(widgetsSchema.safeParse(attention("dueDate")).success).toBe(true);
    expect(widgetsSchema.safeParse(attention("random")).success).toBe(false);
    expect(widgetsSchema.safeParse(attention("oldest")).success).toBe(true);
  });
});

describe("external links among the shortcuts (BARY-182)", () => {
  it("makes a typed address a web address", () => {
    expect(normalizeLinkUrl("figma.com/file/x")).toBe(
      "https://figma.com/file/x",
    );
    expect(normalizeLinkUrl(" https://github.com/a/b ")).toBe(
      "https://github.com/a/b",
    );
  });

  it("refuses anything that isn't one", () => {
    expect(normalizeLinkUrl("javascript:alert(1)")).toBeNull();
    expect(normalizeLinkUrl("mailto:a@b.de")).toBeNull();
    expect(normalizeLinkUrl("hello")).toBeNull();
    expect(normalizeLinkUrl("")).toBeNull();
  });

  const shortcuts = (config: object) => [
    { id: "w1", type: "shortcuts", size: "L", config },
  ];

  it("stores links and their place among the tiles", () => {
    const parsed = widgetsSchema.safeParse(
      shortcuts({
        shortcuts: ["board", "link:abc-1"],
        links: [
          {
            id: "abc-1",
            label: "Figma",
            url: "https://figma.com/",
            icon: "logos:figma",
          },
        ],
      }),
    );
    expect(parsed.success).toBe(true);
  });

  it("drops a link that isn't a web address", () => {
    const parsed = widgetsSchema.safeParse(
      shortcuts({
        links: [{ id: "x", label: "Bad", url: "javascript:alert(1)" }],
      }),
    );
    expect(parsed.success).toBe(false);
  });
});
