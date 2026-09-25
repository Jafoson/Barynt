import { describe, expect, it } from "bun:test";
import {
  type CustomFieldConfig,
  type CustomFieldType,
  MAX_URL_LENGTH,
  type ValueColumns,
} from "@/lib/custom-fields/types";
import { fromColumns, sameValue, toColumns } from "@/lib/custom-fields/value";

// One issue's answer to a field, turned into what the database keeps and back. What matters: an
// empty answer is "no value" (never zero, never an empty text), each type takes only its own kind
// of value and keeps it in the column of its kind, a day never slips to another one, and what is
// read back is what was written.

const field = (type: CustomFieldType, config: CustomFieldConfig = {}) => ({
  type,
  config,
});
const text = (maxLength = 20) => field("text", { maxLength });
const number = (
  more: { integer?: boolean; min?: number | null; max?: number | null } = {},
) => field("number", { integer: false, min: null, max: null, ...more });
const choice = field("select", {
  options: [
    { id: "staging", label: "Staging", color: null },
    { id: "prod", label: "Production", color: "#ff0000" },
  ],
});

const ok = (f: ReturnType<typeof field>, input: unknown) => {
  const result = toColumns(f, input);
  if (!result.ok) throw new Error(result.message);
  return result.columns;
};
const bad = (f: ReturnType<typeof field>, input: unknown) => {
  const result = toColumns(f, input);
  if (result.ok)
    throw new Error(
      `expected a problem, got ${JSON.stringify(result.columns)}`,
    );
  return result.message;
};
const only = (key: keyof ValueColumns, value: unknown): ValueColumns => ({
  text: null,
  number: null,
  date: null,
  userId: null,
  [key]: value,
});

describe("no value", () => {
  it("is null, undefined, an empty text or one of spaces, whatever the type", () => {
    for (const f of [
      text(),
      number(),
      choice,
      field("date"),
      field("user"),
      field("url"),
    ]) {
      for (const input of [null, undefined, "", "   ", "\t\n"]) {
        expect(ok(f, input)).toBeNull();
      }
    }
  });

  it("is not zero, not false and not an empty list", () => {
    expect(ok(number(), 0)).toEqual(only("number", 0));
    expect(bad(text(), 0)).toContain("text");
    expect(bad(text(), false)).toContain("text");
    expect(bad(text(), [])).toContain("text");
  });
});

describe("a text", () => {
  it("is one trimmed line in the text column", () => {
    expect(ok(text(), "  hello  ")).toEqual(only("text", "hello"));
  });

  it("is at most as long as the field says, counted after trimming", () => {
    expect(ok(text(5), "12345")).toEqual(only("text", "12345"));
    expect(ok(text(5), "  12345  ")).toEqual(only("text", "12345"));
    expect(bad(text(5), "123456")).toContain("at most 5");
  });

  it("is one line, without control characters", () => {
    expect(bad(text(), "two\nlines")).toContain("one line");
    expect(bad(text(), "bell\u0007")).toContain("one line");
    expect(bad(text(), "nul\u0000")).toContain("one line");
    expect(ok(text(), "café ünï 日本語 🙂")).toEqual(
      only("text", "café ünï 日本語 🙂"),
    );
  });

  it("is text: a number or an object is not turned into one", () => {
    for (const input of [1, true, {}, ["a"], () => "x"])
      expect(bad(text(), input)).toContain("text");
  });
});

describe("an address", () => {
  const url = field("url");

  it("is an http or https address, trimmed, in the text column", () => {
    expect(ok(url, "  https://example.com/a?b=1#c  ")).toEqual(
      only("text", "https://example.com/a?b=1#c"),
    );
    expect(ok(url, "http://example.com")).toEqual(
      only("text", "http://example.com"),
    );
  });

  it("is refused with another scheme", () => {
    for (const input of [
      "ftp://example.com",
      "javascript:alert(1)",
      "data:text/html,x",
      "file:///etc/passwd",
      "mailto:a@b.c",
    ]) {
      expect(bad(url, input)).toContain("http");
    }
  });

  it("is refused with a user name or a password in it", () => {
    expect(bad(url, "https://user@example.com")).toContain("user name");
    expect(bad(url, "https://user:secret@example.com")).toContain("user name");
  });

  it("is refused when it is no address", () => {
    for (const input of [
      "example.com",
      "not a url",
      "//example.com",
      "https://",
    ]) {
      expect(bad(url, input)).toContain("web address");
    }
  });

  it("is refused one character over the limit, and fine at it", () => {
    const base = "https://e.co/";
    expect(
      ok(url, base + "a".repeat(MAX_URL_LENGTH - base.length)),
    ).not.toBeNull();
    expect(
      bad(url, base + "a".repeat(MAX_URL_LENGTH - base.length + 1)),
    ).toContain("at most");
  });

  it("is refused when it is too long, and when it has a newline", () => {
    expect(
      bad(url, `https://example.com/${"a".repeat(MAX_URL_LENGTH)}`),
    ).toContain("at most");
    expect(bad(url, "https://example.com/\nx")).toContain("one line");
    expect(
      ok(url, `https://e.co/${"a".repeat(MAX_URL_LENGTH - 13)}`),
    ).not.toBeNull();
  });

  it("is text", () => {
    expect(bad(url, 5)).toContain("text");
  });
});

describe("a number", () => {
  it("is a finite number in the number column, a decimal and a negative one too", () => {
    expect(ok(number(), 42)).toEqual(only("number", 42));
    expect(ok(number(), -1.5)).toEqual(only("number", -1.5));
    expect(ok(number(), 0)).toEqual(only("number", 0));
  });

  it("is never a text that looks like one, NaN or infinity", () => {
    for (const input of [
      "42",
      "1e3",
      NaN,
      Infinity,
      -Infinity,
      true,
      {},
      [1],
    ]) {
      expect(bad(number(), input)).toContain("number");
    }
  });

  it("is a whole number where the field says so", () => {
    expect(ok(number({ integer: true }), 3)).toEqual(only("number", 3));
    expect(bad(number({ integer: true }), 3.5)).toContain("whole");
    expect(bad(number({ integer: true }), 2 ** 60)).toContain("whole");
  });

  it("is within the range the field says, the bounds themselves included", () => {
    const f = number({ min: 1, max: 5 });
    expect(ok(f, 1)).toEqual(only("number", 1));
    expect(ok(f, 5)).toEqual(only("number", 5));
    expect(bad(f, 0.99)).toContain("at least 1");
    expect(bad(f, 5.01)).toContain("at most 5");
  });

  it("has a bound of zero like any other", () => {
    expect(bad(number({ min: 0 }), -1)).toContain("at least 0");
    expect(bad(number({ max: 0 }), 1)).toContain("at most 0");
    expect(ok(number({ min: 0, max: 0 }), 0)).toEqual(only("number", 0));
  });

  it("has no range unless the field says one", () => {
    expect(ok(number(), -1e300)).toEqual(only("number", -1e300));
  });
});

describe("a choice", () => {
  it("is the id of one of the options, in the text column", () => {
    expect(ok(choice, "prod")).toEqual(only("text", "prod"));
    expect(ok(choice, "staging")).toEqual(only("text", "staging"));
  });

  it("is not the label, another case or an id that is not there", () => {
    for (const input of [
      "Production",
      "PROD",
      "dev",
      "constructor",
      "__proto__",
      "toString",
    ]) {
      expect(bad(choice, input)).toContain("options");
    }
  });

  it("is a text", () => {
    for (const input of [1, true, {}, ["prod"]])
      expect(bad(choice, input)).toContain("options");
  });

  it("cannot be chosen where the field has no options", () => {
    expect(bad(field("select", { options: [] }), "prod")).toContain("options");
  });
});

describe("a day", () => {
  const date = field("date");

  it("is YYYY-MM-DD, stored at noon UTC in the date column", () => {
    expect(ok(date, "2026-09-25")).toEqual(
      only("date", new Date("2026-09-25T12:00:00.000Z")),
    );
  });

  it("is trimmed", () => {
    expect(ok(date, " 2026-01-05 ")).toEqual(
      only("date", new Date("2026-01-05T12:00:00.000Z")),
    );
  });

  it("is a day that exists: the 29th of February only in a leap year", () => {
    expect(ok(date, "2028-02-29")).not.toBeNull();
    expect(bad(date, "2026-02-29")).toContain("YYYY-MM-DD");
    expect(bad(date, "2026-13-01")).toContain("YYYY-MM-DD");
    expect(bad(date, "2026-04-31")).toContain("YYYY-MM-DD");
    expect(bad(date, "2026-00-10")).toContain("YYYY-MM-DD");
    expect(bad(date, "2026-01-00")).toContain("YYYY-MM-DD");
  });

  it("is a real year: four digits, not one that the calendar reads as 1900 and something", () => {
    expect(bad(date, "0099-01-01")).toContain("YYYY-MM-DD");
    expect(bad(date, "0000-01-01")).toContain("YYYY-MM-DD");
    expect(ok(date, "1999-12-31")).not.toBeNull();
    expect(ok(date, "9999-12-31")).not.toBeNull();
  });

  it("is written in that one way", () => {
    for (const input of [
      "25.09.2026",
      "2026/09/25",
      "2026-9-25",
      "2026-09-25T10:00:00Z",
      "26-09-25",
      1790000000000,
      {},
    ]) {
      expect(bad(date, input)).toContain("YYYY-MM-DD");
    }
  });

  it("does not slip to another day with the reader's zone: it is the same instant everywhere", () => {
    const columns = ok(date, "2026-03-29");
    expect(columns?.date?.toISOString()).toBe("2026-03-29T12:00:00.000Z");
  });
});

describe("a member", () => {
  const user = field("user");

  it("is an id, trimmed, in the user column", () => {
    expect(ok(user, " u1 ")).toEqual(only("userId", "u1"));
  });

  it("is a text of a sane length, without control characters", () => {
    for (const input of [1, {}, "x".repeat(101), "a\nb", "a\u0000"]) {
      expect(bad(user, input)).toContain("id");
    }
    expect(ok(user, "x".repeat(100))).not.toBeNull();
  });
});

describe("what is read back", () => {
  const row = (more: Partial<ValueColumns>): ValueColumns => ({
    text: null,
    number: null,
    date: null,
    userId: null,
    ...more,
  });

  it("is the column of the type: a text, an address and a choice their text, a number its number, a member their id", () => {
    expect(fromColumns("text", row({ text: "hi" }))).toBe("hi");
    expect(fromColumns("url", row({ text: "https://e.co" }))).toBe(
      "https://e.co",
    );
    expect(fromColumns("select", row({ text: "prod" }))).toBe("prod");
    expect(fromColumns("number", row({ number: 3.5 }))).toBe(3.5);
    expect(fromColumns("user", row({ userId: "u1" }))).toBe("u1");
  });

  it("is a day as YYYY-MM-DD", () => {
    expect(
      fromColumns("date", row({ date: new Date("2026-09-25T12:00:00.000Z") })),
    ).toBe("2026-09-25");
  });

  it("is null for a column that is not there at all, not undefined", () => {
    expect(fromColumns("text", {} as ValueColumns)).toBeNull();
    expect(fromColumns("date", {} as ValueColumns)).toBeNull();
  });

  it("is a number that is zero, not nothing", () => {
    expect(fromColumns("number", row({ number: 0 }))).toBe(0);
  });

  it("is a text that is empty, not nothing: it is what was stored", () => {
    expect(fromColumns("text", row({ text: "" }))).toBe("");
  });

  it("is null where the column of the type is empty, whatever another column holds", () => {
    expect(fromColumns("text", row({ number: 5, userId: "u1" }))).toBeNull();
    expect(fromColumns("number", row({ text: "5" }))).toBeNull();
    expect(fromColumns("date", row({ text: "2026-01-01" }))).toBeNull();
    expect(fromColumns("user", row({ text: "u1" }))).toBeNull();
  });

  it("is what was written, for every type", () => {
    const cases: [ReturnType<typeof field>, unknown, unknown][] = [
      [text(), "  hello ", "hello"],
      [field("url"), "https://example.com", "https://example.com"],
      [number({ integer: true }), 7, 7],
      [number(), -0.25, -0.25],
      [choice, "prod", "prod"],
      [field("date"), "2028-02-29", "2028-02-29"],
      [field("user"), "u42", "u42"],
    ];
    for (const [f, input, expected] of cases) {
      const columns = ok(f, input);
      expect(columns).not.toBeNull();
      expect(fromColumns(f.type, columns as ValueColumns)).toBe(
        expected as never,
      );
    }
  });
});

describe("whether two answers are the same", () => {
  it("is when they are equal, and null, undefined are the same absence", () => {
    expect(sameValue("a", "a")).toBe(true);
    expect(sameValue(3, 3)).toBe(true);
    expect(sameValue(null, undefined)).toBe(true);
    expect(sameValue(undefined, undefined)).toBe(true);
  });

  it("is not for another value, and not for a text and the number it looks like", () => {
    expect(sameValue("a", "b")).toBe(false);
    expect(sameValue("3", 3)).toBe(false);
    expect(sameValue(0, null)).toBe(false);
    expect(sameValue("", null)).toBe(false);
  });
});
