import { describe, expect, it } from "bun:test";
import { shouldCloseSheet } from "@/lib/utils/useSwipeToClose";

describe("shouldCloseSheet", () => {
  it("closes once dragged far enough down", () => {
    expect(shouldCloseSheet(101, 0)).toBe(true);
  });

  it("springs back after a short, slow drag", () => {
    expect(shouldCloseSheet(40, 0.1)).toBe(false);
    expect(shouldCloseSheet(100, 0)).toBe(false);
  });

  it("closes on a quick flick, however short", () => {
    expect(shouldCloseSheet(20, 0.9)).toBe(true);
  });

  it("doesn't close on an upward movement", () => {
    expect(shouldCloseSheet(0, -1)).toBe(false);
  });
});
