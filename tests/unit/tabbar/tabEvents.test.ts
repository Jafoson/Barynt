import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  OPEN_TAB_EVENT,
  type OpenTabDetail,
  openInBarayntTab,
} from "@/components/ui/layout/TabBar/tabEvents";

// Just enough of `window` for the event to travel on.
const target = new EventTarget();
const globals = globalThis as unknown as { window?: EventTarget };
let original: EventTarget | undefined;

beforeEach(() => {
  original = globals.window;
  globals.window = target;
});

afterEach(() => {
  globals.window = original;
});

describe("openInBarayntTab", () => {
  it("reports failure when no tab bar is listening", () => {
    expect(openInBarayntTab("/ws/issue/FUX-1")).toBe(false);
  });

  it("hands the path to a listening tab bar and reports success", () => {
    const received: string[] = [];
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<OpenTabDetail>).detail;
      received.push(detail.href);
      detail.handled = true;
    };
    target.addEventListener(OPEN_TAB_EVENT, listener);
    try {
      expect(openInBarayntTab("/ws/issue/FUX-1")).toBe(true);
      expect(received).toEqual(["/ws/issue/FUX-1"]);
    } finally {
      target.removeEventListener(OPEN_TAB_EVENT, listener);
    }
  });

  it("does not count a listener that doesn't take the request", () => {
    const listener = () => {};
    target.addEventListener(OPEN_TAB_EVENT, listener);
    try {
      expect(openInBarayntTab("/ws/issue/FUX-1")).toBe(false);
    } finally {
      target.removeEventListener(OPEN_TAB_EVENT, listener);
    }
  });
});
