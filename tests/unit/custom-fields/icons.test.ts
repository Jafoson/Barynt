import { describe, expect, it } from "bun:test";
import {
  CUSTOM_FIELD_ICONS,
  fieldIcon,
  isFieldIcon,
} from "@/lib/custom-fields/icons";
import {
  CUSTOM_FIELD_TYPE_ICONS,
  CUSTOM_FIELD_TYPES,
} from "@/lib/custom-fields/types";

// The icons a custom field can be given.

describe("the list of icons", () => {
  it("has no icon twice", () => {
    expect(new Set(CUSTOM_FIELD_ICONS).size).toBe(CUSTOM_FIELD_ICONS.length);
  });

  it("is all lucide icons, named as the icon bundle reads them", () => {
    for (const icon of CUSTOM_FIELD_ICONS) {
      expect(icon).toMatch(/^lucide:[a-z0-9]+(?:-[a-z0-9]+)*$/);
    }
  });

  it("has room for a picker, not a wall", () => {
    expect(CUSTOM_FIELD_ICONS.length).toBeGreaterThanOrEqual(24);
    expect(CUSTOM_FIELD_ICONS.length).toBeLessThanOrEqual(80);
  });
});

describe("whether something is an icon of the list", () => {
  it("is for every icon of the list", () => {
    for (const icon of CUSTOM_FIELD_ICONS) expect(isFieldIcon(icon)).toBe(true);
  });

  it("is not for anything else", () => {
    for (const other of [
      "lucide:nonexistent",
      "flag",
      "",
      null,
      undefined,
      5,
      {},
      ["lucide:flag"],
    ]) {
      expect(isFieldIcon(other)).toBe(false);
    }
  });
});

describe("the icon a field is drawn with", () => {
  it("is the one it was given", () => {
    expect(fieldIcon({ type: "text", icon: "lucide:flag" })).toBe(
      "lucide:flag",
    );
  });

  it("is the one of its type without one", () => {
    for (const type of CUSTOM_FIELD_TYPES) {
      expect(fieldIcon({ type, icon: null })).toBe(
        CUSTOM_FIELD_TYPE_ICONS[type],
      );
      expect(fieldIcon({ type })).toBe(CUSTOM_FIELD_TYPE_ICONS[type]);
    }
  });

  it("is the one of its type for a stored icon that is no longer on the list", () => {
    expect(fieldIcon({ type: "date", icon: "lucide:gone" })).toBe(
      CUSTOM_FIELD_TYPE_ICONS.date,
    );
  });
});
