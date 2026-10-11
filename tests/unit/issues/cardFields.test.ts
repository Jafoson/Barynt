import { describe, expect, it } from "bun:test";
import {
  CARD_FIELD_KEYS,
  isCardFieldKey,
  visibleCardFields,
} from "@/features/issues/card-fields";

describe("visibleCardFields() (BARY-33)", () => {
  it("shows everything when nothing is hidden", () => {
    const visible = visibleCardFields([]);
    expect(visible.has("priority")).toBe(true);
    expect(visible.has("labels")).toBe(true);
    expect(visible.has("storyPoints")).toBe(true);
    expect(visible.has("dueDate")).toBe(true);
    expect(visible.size).toBe(CARD_FIELD_KEYS.length);
  });

  it("hides exactly what's listed", () => {
    const visible = visibleCardFields(["dueDate", "storyPoints"]);
    expect(visible.has("dueDate")).toBe(false);
    expect(visible.has("storyPoints")).toBe(false);
    expect(visible.has("priority")).toBe(true);
    expect(visible.has("labels")).toBe(true);
  });

  it("ignores keys it doesn't know — a stale or future field key isn't a bug", () => {
    const visible = visibleCardFields(["not-a-real-field"]);
    expect(visible.size).toBe(CARD_FIELD_KEYS.length);
  });
});

describe("isCardFieldKey() (BARY-33)", () => {
  it("accepts every real key", () => {
    expect(isCardFieldKey("priority")).toBe(true);
    expect(isCardFieldKey("dueDate")).toBe(true);
  });

  it("rejects anything else — including detail-only fields like 'status'", () => {
    expect(isCardFieldKey("not-a-real-field")).toBe(false);
    expect(isCardFieldKey("status")).toBe(false);
  });
});

describe("custom field entries", () => {
  it("tell a custom field apart from a built-in key", async () => {
    const { customCardFieldEntry, hiddenCustomFieldIds, isCardFieldEntry } =
      await import("@/features/issues/card-fields");
    expect(customCardFieldEntry("cf_1")).toBe("cf:cf_1");
    expect(isCardFieldEntry("cf:cf_1")).toBe(true);
    expect(isCardFieldEntry("labels")).toBe(true);
    expect(isCardFieldEntry("cf:")).toBe(false);
    expect(isCardFieldEntry("nonsense")).toBe(false);
    expect([...hiddenCustomFieldIds(["labels", "cf:cf_1", "cf:cf_2"])]).toEqual(
      ["cf_1", "cf_2"],
    );
  });
});
