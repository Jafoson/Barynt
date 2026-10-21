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
    ...FILTER_DOC_RECIPES.map((r) => [r.title, r.code]),
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
