import { describe, expect, it } from "bun:test";
import {
  FILTER_DOC_FIELDS,
  FILTER_DOC_FIRST_EXAMPLE,
  FILTER_DOC_GROUP_EXAMPLE,
  FILTER_DOC_OPS,
  FILTER_DOC_RECIPES,
} from "@/features/account/components/AccountApiKeys/filterDocsData";
import {
  FILTER_FIELD_KEYS,
  FILTER_OPS,
  parseIssueFilter,
} from "@/features/issues/filter";

// The filter guide in the API docs (BARY-172). Every example in it has to
// be a filter the server accepts — a doc example that 422s is worse than
// none.

describe("Filter docs", () => {
  const examples = [
    ["first example", FILTER_DOC_FIRST_EXAMPLE],
    ["group example", FILTER_DOC_GROUP_EXAMPLE],
    ...FILTER_DOC_RECIPES.map((r) => [
      typeof r.title === "string" ? r.title : r.title.en,
      r.code,
    ]),
  ] as const;

  for (const [name, code] of examples) {
    it(`"${name}" is a valid filter`, () => {
      expect(parseIssueFilter(JSON.parse(code))).not.toBeNull();
    });
  }

  it("documents every field and every operator", () => {
    expect(FILTER_DOC_FIELDS.map((f) => f.field)).toEqual([
      ...FILTER_FIELD_KEYS,
    ]);
    expect(Object.keys(FILTER_DOC_OPS).sort()).toEqual([...FILTER_OPS].sort());
  });
});

describe("API docs translations", () => {
  /** Every `{ en, de }` text anywhere in a docs data value. */
  function texts(value: unknown, out: { en: string; de: string }[] = []) {
    if (Array.isArray(value)) for (const v of value) texts(v, out);
    else if (value && typeof value === "object") {
      const o = value as Record<string, unknown>;
      if (typeof o.en === "string" && typeof o.de === "string") {
        out.push(o as { en: string; de: string });
      } else for (const v of Object.values(o)) texts(v, out);
    }
    return out;
  }

  it("every text has an English and a German version", async () => {
    const modules = await Promise.all([
      import("@/features/account/components/AccountApiKeys/apiDocsData"),
      import("@/features/account/components/AccountMcp/mcpDocsData"),
      import("@/features/account/components/AccountApiKeys/filterDocsData"),
      import("@/features/account/components/AccountApiKeys/basicsDocsData"),
    ]);
    const all = modules.flatMap((m) => texts(Object.values(m)));
    expect(all.length).toBeGreaterThan(150);
    for (const text of all) {
      expect(text.en.trim()).not.toBe("");
      expect(text.de.trim()).not.toBe("");
    }
  });
});
