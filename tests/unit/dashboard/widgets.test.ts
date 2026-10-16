import { describe, expect, it } from "bun:test";
import {
  defaultWidgets,
  fitSize,
  layoutKey,
  moveWidgetTo,
  newWidget,
  normalizeWidget,
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
  for (const kind of ["project", "workspace", "view"] as const) {
    it(`builds a valid ${kind} dashboard`, () => {
      const widgets = defaultWidgets(kind);
      expect(parseWidgets(widgets)).toEqual(widgets);
      expect(new Set(widgets.map((w) => w.id)).size).toBe(widgets.length);
    });
  }

  it("fills whole rows of eight columns", () => {
    const cells = defaultWidgets("project").reduce(
      (sum, w) => sum + SIZE_SPAN[w.size].cols * SIZE_SPAN[w.size].rows,
      0,
    );
    expect(cells % 8).toBe(0);
  });

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
    expect(fitSize("kpi", "XL")).toBe("M");
    expect(fitSize("matrix", "S")).toBe("L");
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
