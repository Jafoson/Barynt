import { describe, expect, it } from "bun:test";
import {
  type CardCustomFields,
  cardEntries,
  MAX_SHOWN_CUSTOM_FIELDS,
  NO_CARD_FIELDS,
  sanitizeShownFields,
  shownAmong,
} from "@/features/custom-fields/cardFields";
import type { CustomFieldRow } from "@/features/custom-fields/types";

// The custom fields a board card or list row shows: what a client may ask for, and what one card shows.

function field(id: string): CustomFieldRow {
  return {
    id,
    key: id,
    name: id,
    description: "",
    icon: null,
    type: "text",
    config: { maxLength: 20 },
    position: 0,
    archived: false,
    pluginId: null,
    workspaceId: "w",
    projectId: null,
  };
}

describe("what a client asks to have shown", () => {
  it("is the list of ids, each once, in the order given", () => {
    expect(sanitizeShownFields(["b", "a", "b", "c"])).toEqual(["b", "a", "c"]);
  });

  it("is nothing for what is not a list", () => {
    for (const nonsense of [null, undefined, "a", 5, { a: 1 }]) {
      expect(sanitizeShownFields(nonsense)).toEqual([]);
    }
  });

  it("leaves out what is not an id: not text, empty, or longer than an id can be", () => {
    expect(
      sanitizeShownFields(["a", 5, null, {}, "", "x".repeat(65), "b"]),
    ).toEqual(["a", "b"]);
    expect(sanitizeShownFields(["x".repeat(64)])).toEqual(["x".repeat(64)]);
  });

  it("keeps at most as many as a card can show, the first ones", () => {
    const many = Array.from({ length: 20 }, (_, i) => `f${i}`);
    const kept = sanitizeShownFields(many);
    expect(kept).toHaveLength(MAX_SHOWN_CUSTOM_FIELDS);
    expect(kept).toEqual(many.slice(0, MAX_SHOWN_CUSTOM_FIELDS));
  });

  it("counts an id once against the limit, however often it comes", () => {
    const repeated = [
      ...Array(10).fill("a"),
      ...Array.from({ length: MAX_SHOWN_CUSTOM_FIELDS - 1 }, (_, i) => `f${i}`),
    ];
    expect(sanitizeShownFields(repeated)).toHaveLength(MAX_SHOWN_CUSTOM_FIELDS);
  });
});

describe("the chosen ids that still exist", () => {
  it("are the ones among the fields, in the order they were chosen", () => {
    expect(
      shownAmong(["c", "a", "gone"], [field("a"), field("b"), field("c")]),
    ).toEqual(["c", "a"]);
  });

  it("are none when the fields are none", () => {
    expect(shownAmong(["a"], [])).toEqual([]);
    expect(shownAmong([], [field("a")])).toEqual([]);
  });
});

describe("what one card shows", () => {
  const custom: CardCustomFields = {
    fields: [field("a"), field("b"), field("c")],
    values: { i1: { c: "third", a: "first" }, i2: { b: 0 } },
  };

  it("is the shown fields the issue has an answer to, in the fields' order", () => {
    expect(cardEntries(custom, "i1").map((e) => [e.field.id, e.value])).toEqual(
      [
        ["a", "first"],
        ["c", "third"],
      ],
    );
  });

  it("keeps an answer of zero", () => {
    expect(cardEntries(custom, "i2").map((e) => [e.field.id, e.value])).toEqual(
      [["b", 0]],
    );
  });

  it("is nothing for an issue with no answers, and for nothing shown", () => {
    expect(cardEntries(custom, "i3")).toEqual([]);
    expect(cardEntries(NO_CARD_FIELDS, "i1")).toEqual([]);
  });

  it("leaves out an answer to a field that is not shown", () => {
    const some: CardCustomFields = {
      fields: [field("a")],
      values: { i1: { a: "x", hidden: "y" } },
    };
    expect(cardEntries(some, "i1").map((e) => e.field.id)).toEqual(["a"]);
  });

  it("does not mistake what every object has for an answer", () => {
    const odd: CardCustomFields = {
      fields: [field("constructor"), field("toString")],
      values: { i1: {} },
    };
    expect(cardEntries(odd, "i1")).toEqual([]);
  });
});

describe("how many a card can show", () => {
  it("is six", () => {
    expect(MAX_SHOWN_CUSTOM_FIELDS).toBe(6);
  });
});

describe("nothing shown", () => {
  it("is no fields and no answers", () => {
    expect(NO_CARD_FIELDS).toEqual({ fields: [], values: {} });
  });
});
