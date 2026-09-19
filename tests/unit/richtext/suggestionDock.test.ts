import { describe, expect, it } from "bun:test";
import { dockPlacement } from "@/components/ui/layout/RichTextEditor/extensions/suggestionDock";

// A phone, keyboard up: 800px of layout, only the top 420px still visible.
const visible = { top: 0, height: 420 };
const layoutHeight = 800;

describe("dockPlacement", () => {
  it("goes below the caret when there's comfortable room", () => {
    const p = dockPlacement({
      caret: { top: 60, bottom: 80 },
      visible,
      layoutHeight,
    });
    expect(p.side).toBe("below");
    expect(p.top).toBe(86); // caret bottom + gap
    expect(p.bottom).toBeUndefined();
  });

  it("goes above the caret when the keyboard leaves too little room below", () => {
    const p = dockPlacement({
      caret: { top: 330, bottom: 350 },
      visible,
      layoutHeight,
    });
    expect(p.side).toBe("above");
    // Measured from the bottom of the layout viewport, up to the caret's top.
    expect(p.bottom).toBe(layoutHeight - 330 + 6);
    expect(p.top).toBeUndefined();
  });

  it("never lets the list use more than half of what's visible", () => {
    const p = dockPlacement({
      caret: { top: 10, bottom: 30 },
      visible,
      layoutHeight,
    });
    expect(p.maxHeight).toBeLessThanOrEqual(visible.height * 0.5);
  });

  it("caps the list to the room it actually has", () => {
    const p = dockPlacement({
      caret: { top: 200, bottom: 220 },
      visible: { top: 0, height: 400 },
      layoutHeight: 400,
    });
    // 400 - 220 - 6 = 174 below, 194 above: below wins on the tie-break of
    // "more room", and the list is capped to what is there.
    expect(p.maxHeight).toBeLessThanOrEqual(200);
  });

  it("keeps a usable minimum height on a tiny viewport", () => {
    const p = dockPlacement({
      caret: { top: 100, bottom: 120 },
      visible: { top: 0, height: 150 },
      layoutHeight: 150,
    });
    expect(p.maxHeight).toBeGreaterThanOrEqual(112);
  });

  it("measures against the visual viewport's offset when it has scrolled", () => {
    const p = dockPlacement({
      caret: { top: 500, bottom: 520 },
      visible: { top: 300, height: 420 },
      layoutHeight,
    });
    // Visible bottom is 720: 200 below (< 224 comfortable) vs 194 above.
    expect(p.side).toBe("below");
  });
});
