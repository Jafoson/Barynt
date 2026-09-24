import { describe, expect, it } from "bun:test";
import { authorName, resolveText } from "@/lib/plugins/localized";

// What a manifest says in words: one text or one per language, an author as a name
// or an object. Pure logic.

describe("a text in a language", () => {
  it("is a plain text as it is, whatever the language", () => {
    expect(resolveText("Calendar", "de")).toBe("Calendar");
  });

  it("takes the exact language first", () => {
    const value = { en: "Colour", "en-GB": "Colour (UK)", de: "Farbe" };
    expect(resolveText(value, "en-GB")).toBe("Colour (UK)");
  });

  it("falls back from a regional language to its language", () => {
    expect(resolveText({ en: "Calendar", de: "Kalender" }, "de-CH")).toBe(
      "Kalender",
    );
  });

  it("falls back to English, which every manifest has, whatever else comes first", () => {
    expect(resolveText({ de: "Kalender", en: "Calendar" }, "fr")).toBe(
      "Calendar",
    );
  });

  it("takes any text there is when English is missing, rather than nothing", () => {
    expect(resolveText({ de: "Kalender" } as never, "fr")).toBe("Kalender");
  });

  it("is empty for an object without a text", () => {
    expect(resolveText({} as never, "en")).toBe("");
  });

  it("does not treat the language `constructor` as one it knows", () => {
    expect(resolveText({ en: "Calendar" }, "constructor")).toBe("Calendar");
  });
});

describe("an author", () => {
  it("is the name when it is written as a name", () => {
    expect(authorName("Mara Velez")).toBe("Mara Velez");
  });

  it("is the name of an object, without the address or the link", () => {
    expect(
      authorName({
        name: "Mara Velez",
        email: "mara@example.com",
        url: "https://example.com",
      }),
    ).toBe("Mara Velez");
  });
});
