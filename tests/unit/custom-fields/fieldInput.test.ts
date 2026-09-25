import { describe, expect, it } from "bun:test";
import {
  draftOf,
  problemOfDraft,
  valueOfDraft,
} from "@/features/custom-fields/fieldInput";
import type {
  CustomFieldConfig,
  CustomFieldType,
} from "@/lib/custom-fields/types";

// What a box beside a field holds while someone types, and what it says as an answer.

const field = (type: CustomFieldType, config: CustomFieldConfig = {}) => ({
  type,
  config,
});
const text = field("text", { maxLength: 5 });
const number = field("number", { integer: true, min: 0, max: 10 });
const choice = field("select", {
  options: [{ id: "prod", label: "Prod", color: null }],
});

describe("the text a box starts with", () => {
  it("is the answer as text, and empty for none", () => {
    expect(draftOf("Acme")).toBe("Acme");
    expect(draftOf(42)).toBe("42");
    expect(draftOf(null)).toBe("");
  });

  it("shows a zero as 0, not as an empty box", () => {
    expect(draftOf(0)).toBe("0");
  });
});

describe("what a box says as an answer", () => {
  it("clears the field when it is empty or only spaces", () => {
    for (const type of ["text", "number", "date", "url"] as const) {
      expect(valueOfDraft(field(type), "")).toBeNull();
      expect(valueOfDraft(field(type), "   ")).toBeNull();
    }
  });

  it("is the text as typed for everything but a number: the checks trim it", () => {
    expect(valueOfDraft(text, " Acme ")).toBe(" Acme ");
    expect(valueOfDraft(field("date"), "2026-09-26")).toBe("2026-09-26");
    expect(valueOfDraft(field("url"), "https://example.com")).toBe(
      "https://example.com",
    );
  });

  it("is a number for a number field, zero included", () => {
    expect(valueOfDraft(number, "7")).toBe(7);
    expect(valueOfDraft(number, "0")).toBe(0);
    expect(valueOfDraft(number, "-2.5")).toBe(-2.5);
  });

  it("is NaN for text that is not a number, for the checks to refuse", () => {
    expect(valueOfDraft(number, "abc")).toBeNaN();
  });
});

describe("why a box cannot be saved", () => {
  it("is nothing for an answer that fits, and for an empty box (it clears)", () => {
    expect(problemOfDraft(text, "Acme")).toBeNull();
    expect(problemOfDraft(text, "")).toBeNull();
    expect(problemOfDraft(number, "5")).toBeNull();
    expect(problemOfDraft(number, "")).toBeNull();
  });

  it("says what is wrong, as a sentence that starts with a capital", () => {
    expect(problemOfDraft(text, "Acmecorp")).toBe(
      "Must be at most 5 characters",
    );
    expect(problemOfDraft(number, "11")).toBe("Must be at most 10");
    expect(problemOfDraft(number, "-1")).toBe("Must be at least 0");
    expect(problemOfDraft(number, "1.5")).toBe("Must be a whole number");
  });

  it("refuses text that is not a number", () => {
    expect(problemOfDraft(number, "abc")).toBe("Must be a number");
  });

  it("refuses an address that is not a web address, and a day that does not exist", () => {
    expect(problemOfDraft(field("url"), "ftp://example.com")).toBe(
      "Must be an http:// or https:// address",
    );
    expect(problemOfDraft(field("date"), "2026-02-30")).toBe(
      "Must be a day as YYYY-MM-DD",
    );
    expect(problemOfDraft(field("date"), "2026-02-28")).toBeNull();
  });

  it("agrees with the server: what it refuses, the server refuses", () => {
    expect(problemOfDraft(choice, "staging")).toBe(
      "Must be one of the options",
    );
    expect(problemOfDraft(choice, "prod")).toBeNull();
  });
});
