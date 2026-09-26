import { describe, expect, it } from "bun:test";
import { valueText } from "@/features/custom-fields/valueText";
import type {
  CustomFieldConfig,
  CustomFieldType,
} from "@/lib/custom-fields/types";

// One answer as a line of plain text, for the composer's chips.

const format = {
  number: (n: number) => `n:${n}`,
  day: (d: Date) => `d:${d.toISOString()}`,
};
const people = [{ id: "u1", firstName: "Ada", lastName: "Lovelace" }];
const field = (type: CustomFieldType, config: CustomFieldConfig = {}) => ({
  type,
  config,
});
const text = (f: ReturnType<typeof field>, value: string | number | null) =>
  valueText(f, value, people, format);

describe("an answer as text", () => {
  it("is nothing for no answer, whatever the type", () => {
    for (const type of [
      "text",
      "number",
      "select",
      "date",
      "user",
      "url",
    ] as const) {
      expect(text(field(type), null)).toBeNull();
    }
  });

  it("is a text or an address as it is", () => {
    expect(text(field("text"), "Acme")).toBe("Acme");
    expect(text(field("url"), "https://example.com")).toBe(
      "https://example.com",
    );
  });

  it("is a number in the reader's format, zero included", () => {
    expect(text(field("number"), 1500)).toBe("n:1500");
    expect(text(field("number"), 0)).toBe("n:0");
  });

  it("is a day read at noon UTC, so it never slips to another one", () => {
    expect(text(field("date"), "2026-09-26")).toBe(
      "d:2026-09-26T12:00:00.000Z",
    );
  });

  it("is a choice's label, and the stored id when the option is gone", () => {
    const choice = field("select", {
      options: [{ id: "prod", label: "Production", color: null }],
    });
    expect(text(choice, "prod")).toBe("Production");
    expect(text(choice, "old")).toBe("old");
  });

  it("is a person's name, and the stored id when the person is not in the list", () => {
    expect(text(field("user"), "u1")).toBe("Ada Lovelace");
    expect(text(field("user"), "u-gone")).toBe("u-gone");
  });
});
