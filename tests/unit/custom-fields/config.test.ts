import { describe, expect, it } from "bun:test";
import {
  defaultFieldConfig,
  deriveFieldKey,
  fieldConfigOrDefault,
  isFieldKey,
  newOptionId,
  normalizeOptions,
  parseDefinition,
  parseFieldConfig,
} from "@/lib/custom-fields/config";
import {
  CUSTOM_FIELD_TYPE_ICONS,
  CUSTOM_FIELD_TYPES,
  DEFAULT_TEXT_LENGTH,
  isCustomFieldType,
  MAX_FIELD_DESCRIPTION_LENGTH,
  MAX_FIELD_KEY_LENGTH,
  MAX_FIELD_NAME_LENGTH,
  MAX_OPTION_LABEL_LENGTH,
  MAX_SELECT_OPTIONS,
  MAX_TEXT_LENGTH,
  VALUE_COLUMN,
} from "@/lib/custom-fields/types";

// What a field's definition is made of, checked and put in its normal form. What matters: input is
// untrusted, so every check reports and none throws; a type allows only what it has (the rest is
// refused, not ignored); an option keeps its id when it is renamed, and gets one that is its own;
// and what is stored and read back never makes an issue unreadable.

describe("the types of field", () => {
  it("are text, number, choice, day, member and address", () => {
    expect([...CUSTOM_FIELD_TYPES]).toEqual([
      "text",
      "number",
      "select",
      "date",
      "user",
      "url",
    ]);
  });

  it("are recognised by name, and nothing else is", () => {
    for (const type of CUSTOM_FIELD_TYPES)
      expect(isCustomFieldType(type)).toBe(true);
    for (const other of [
      "",
      "Text",
      "boolean",
      "constructor",
      "toString",
      null,
      undefined,
      1,
      {},
      ["text"],
    ]) {
      expect(isCustomFieldType(other)).toBe(false);
    }
  });

  it("each have an icon, and only they do", () => {
    expect(Object.keys(CUSTOM_FIELD_TYPE_ICONS).sort()).toEqual(
      [...CUSTOM_FIELD_TYPES].sort(),
    );
    for (const icon of Object.values(CUSTOM_FIELD_TYPE_ICONS)) {
      expect(icon).toMatch(/^lucide:[a-z-]+$/);
    }
  });

  it("keep their value in the column of their kind", () => {
    expect(VALUE_COLUMN).toEqual({
      text: "text",
      url: "text",
      select: "text",
      number: "number",
      date: "date",
      user: "userId",
    });
  });
});

describe("what a type starts from", () => {
  it("is a length for a text, an open range for a number, no options for a choice, nothing for the rest", () => {
    expect(defaultFieldConfig("text")).toEqual({
      maxLength: DEFAULT_TEXT_LENGTH,
    });
    expect(defaultFieldConfig("number")).toEqual({
      integer: false,
      min: null,
      max: null,
    });
    expect(defaultFieldConfig("select")).toEqual({ options: [] });
    for (const type of ["date", "user", "url"] as const) {
      expect(defaultFieldConfig(type)).toEqual({});
    }
  });

  it("is a new object each time, so one field's edit cannot reach another", () => {
    const a = defaultFieldConfig("select");
    const b = defaultFieldConfig("select");
    expect(a).not.toBe(b);
    expect(a.options).not.toBe(b.options);
  });
});

describe("the options of a choice", () => {
  const ok = (input: unknown) => {
    const result = normalizeOptions(input);
    if (!result.ok) throw new Error(result.message);
    return result.options;
  };
  const bad = (input: unknown) => {
    const result = normalizeOptions(input);
    if (result.ok) throw new Error("expected a problem");
    return result.message;
  };

  it("get an id made of their label, and no color unless they have one", () => {
    expect(
      ok([{ label: "Staging" }, { label: "Production", color: "#FF0000" }]),
    ).toEqual([
      { id: "staging", label: "Staging", color: null },
      { id: "production", label: "Production", color: "#ff0000" },
    ]);
  });

  it("keep the id they have, whatever their label now says", () => {
    expect(ok([{ id: "prod", label: "Live" }])).toEqual([
      { id: "prod", label: "Live", color: null },
    ]);
  });

  it("do not give a new option the id of one that is kept, wherever it stands in the list", () => {
    const options = ok([
      { label: "Staging" },
      { id: "staging", label: "Old staging" },
    ]);
    expect(options.map((o) => o.id)).toEqual(["staging-2", "staging"]);
  });

  it("number the ids of options whose labels make the same slug", () => {
    const options = ok([{ label: "A b" }, { label: "A-b" }, { label: "a_b" }]);
    expect(options.map((o) => o.id)).toEqual(["a-b", "a-b-2", "a-b-3"]);
  });

  it("trim their labels", () => {
    expect(ok([{ label: "  Staging  " }])[0].label).toBe("Staging");
  });

  it("need a list with something in it, and at most so many", () => {
    expect(bad("x")).toContain("list");
    expect(bad(undefined)).toContain("list");
    expect(bad([])).toContain("at least one");
    const many = Array.from({ length: MAX_SELECT_OPTIONS + 1 }, (_, i) => ({
      label: `o${i}`,
    }));
    expect(bad(many)).toContain(`${MAX_SELECT_OPTIONS}`);
    expect(ok(many.slice(0, MAX_SELECT_OPTIONS))).toHaveLength(
      MAX_SELECT_OPTIONS,
    );
  });

  it("are objects with a label, and nothing else but an id and a color", () => {
    expect(bad(["Staging"])).toContain("object");
    expect(bad([null])).toContain("object");
    expect(bad([{}])).toContain("label");
    expect(bad([{ label: "   " }])).toContain("label");
    expect(bad([{ label: 5 }])).toContain("label");
    expect(bad([{ label: "A", extra: 1 }])).toContain('"extra"');
  });

  it("have a label of one line and a limit of length", () => {
    expect(bad([{ label: "a".repeat(MAX_OPTION_LABEL_LENGTH + 1) }])).toContain(
      "characters",
    );
    expect(bad([{ label: "two\nlines" }])).toContain("one line");
    expect(ok([{ label: "a".repeat(MAX_OPTION_LABEL_LENGTH) }])).toHaveLength(
      1,
    );
  });

  it("are not there twice, whatever the case of the label", () => {
    expect(bad([{ label: "Live" }, { label: "live" }])).toContain("twice");
  });

  it("are not there twice, whichever spelling comes first", () => {
    expect(bad([{ label: "live" }, { label: "Live" }])).toContain("twice");
    expect(bad([{ label: "LIVE" }, { label: "live" }])).toContain("twice");
  });

  it("do not share an id", () => {
    expect(
      bad([
        { id: "a", label: "A" },
        { id: "a", label: "B" },
      ]),
    ).toContain("twice");
  });

  it("have an id of lowercase letters, digits and dashes", () => {
    for (const id of [
      "Upper",
      "with space",
      "",
      "-lead",
      "a".repeat(33),
      5,
      "__proto__",
    ]) {
      expect(bad([{ id, label: "A" }])).toContain("id");
    }
    expect(ok([{ id: "a".repeat(32), label: "A" }])).toHaveLength(1);
    expect(ok([{ id: "0-9", label: "A" }])).toHaveLength(1);
  });

  it("have no id at all when it is null: it is made, like for an option without one", () => {
    expect(ok([{ id: null, label: "A" }])[0].id).toBe("a");
  });

  it("have a color as #rrggbb or none", () => {
    for (const color of ["red", "#fff", "#gggggg", "ff0000", 5]) {
      expect(bad([{ label: "A", color }])).toContain("color");
    }
    expect(ok([{ label: "A", color: null }])[0].color).toBeNull();
    expect(ok([{ label: "A", color: "#AbCdEf" }])[0].color).toBe("#abcdef");
  });

  it("make an id for a label of no letters, and never an empty one", () => {
    const options = ok([{ label: "???" }, { label: "!!!" }]);
    expect(options.map((o) => o.id)).toEqual(["option", "option-2"]);
  });

  it("do not let an option called __proto__ or constructor break the list", () => {
    const options = ok([{ label: "constructor" }, { label: "__proto__" }]);
    expect(options.map((o) => o.label)).toEqual(["constructor", "__proto__"]);
    expect(new Set(options.map((o) => o.id)).size).toBe(2);
  });
});

describe("an id for a new option", () => {
  it("is the label as a slug, and the label's own letters only", () => {
    expect(newOptionId("Über Prod", new Set())).toBe("ber-prod");
    expect(newOptionId("Hello World!", new Set())).toBe("hello-world");
  });

  it("is numbered while it is taken", () => {
    expect(newOptionId("A", new Set(["a"]))).toBe("a-2");
    expect(newOptionId("A", new Set(["a", "a-2"]))).toBe("a-3");
  });

  it("is short enough to be an id, with room for the number", () => {
    const id = newOptionId("x".repeat(100), new Set());
    expect(id.length).toBeLessThanOrEqual(28);
    expect(
      newOptionId("x".repeat(100), new Set([id])).length,
    ).toBeLessThanOrEqual(32);
  });

  it("is option, for a label that is no letters", () => {
    expect(newOptionId("", new Set())).toBe("option");
    expect(newOptionId("---", new Set())).toBe("option");
  });
});

describe("the config of a type", () => {
  const ok = (type: Parameters<typeof parseFieldConfig>[0], raw: unknown) => {
    const result = parseFieldConfig(type, raw);
    if (!result.ok) throw new Error(result.message);
    return result.config;
  };
  const bad = (type: Parameters<typeof parseFieldConfig>[0], raw: unknown) => {
    const result = parseFieldConfig(type, raw);
    if (result.ok) throw new Error("expected a problem");
    return result.message;
  };

  it("is the type's defaults when nothing is said", () => {
    expect(ok("text", undefined)).toEqual({ maxLength: DEFAULT_TEXT_LENGTH });
    expect(ok("text", null)).toEqual({ maxLength: DEFAULT_TEXT_LENGTH });
    expect(ok("number", {})).toEqual({ integer: false, min: null, max: null });
    expect(ok("date", undefined)).toEqual({});
    expect(ok("user", {})).toEqual({});
    expect(ok("url", null)).toEqual({});
  });

  it("must be an object", () => {
    for (const raw of ["x", 1, true, [], [1]]) {
      for (const type of CUSTOM_FIELD_TYPES) {
        expect(bad(type, raw)).toContain("object");
      }
    }
  });

  it("refuses a setting the type does not have, rather than ignoring it", () => {
    expect(bad("text", { maxLength: 10, min: 1 })).toContain('"min"');
    expect(bad("number", { maxLength: 10 })).toContain('"maxLength"');
    expect(
      bad("select", { options: [{ label: "A" }], integer: true }),
    ).toContain('"integer"');
    for (const type of ["date", "user", "url"] as const) {
      expect(bad(type, { anything: 1 })).toContain('"anything"');
    }
  });

  describe("of a text", () => {
    it("has a length from 1 to the limit, whole", () => {
      expect(ok("text", { maxLength: 1 })).toEqual({ maxLength: 1 });
      expect(ok("text", { maxLength: MAX_TEXT_LENGTH })).toEqual({
        maxLength: MAX_TEXT_LENGTH,
      });
      for (const maxLength of [
        0,
        -1,
        1.5,
        MAX_TEXT_LENGTH + 1,
        "10",
        NaN,
        Infinity,
      ]) {
        expect(bad("text", { maxLength })).toContain("length");
      }
    });
  });

  describe("of a number", () => {
    it("says whole numbers only, and a range, both optional", () => {
      expect(ok("number", { integer: true, min: 1, max: 5 })).toEqual({
        integer: true,
        min: 1,
        max: 5,
      });
      expect(ok("number", { min: -2.5 })).toEqual({
        integer: false,
        min: -2.5,
        max: null,
      });
      expect(ok("number", { max: 0 })).toEqual({
        integer: false,
        min: null,
        max: 0,
      });
    });

    it("keeps a bound of zero", () => {
      expect(ok("number", { min: 0, max: 0 })).toEqual({
        integer: false,
        min: 0,
        max: 0,
      });
    });

    it("has a range made of numbers, the smallest not above the largest", () => {
      for (const bound of ["1", NaN, Infinity, {}, true]) {
        expect(bad("number", { min: bound })).toContain("numbers");
        expect(bad("number", { max: bound })).toContain("numbers");
      }
      expect(bad("number", { min: 5, max: 1 })).toContain("above");
      expect(ok("number", { min: 3, max: 3 })).toEqual({
        integer: false,
        min: 3,
        max: 3,
      });
    });

    it("needs whole bounds when only whole numbers are allowed", () => {
      expect(bad("number", { integer: true, min: 0.5 })).toContain("whole");
      expect(bad("number", { integer: true, max: 2.5 })).toContain("whole");
      expect(bad("number", { integer: true, max: 2 ** 60 })).toContain("whole");
    });

    it("says whole numbers only as yes or no", () => {
      expect(bad("number", { integer: "yes" })).toContain("yes or no");
      expect(bad("number", { integer: 1 })).toContain("yes or no");
    });
  });

  describe("of a choice", () => {
    it("is its options, with ids", () => {
      expect(ok("select", { options: [{ label: "A" }] })).toEqual({
        options: [{ id: "a", label: "A", color: null }],
      });
    });

    it("has to say its options", () => {
      expect(bad("select", {})).toContain("list");
      expect(bad("select", undefined)).toContain("list");
      expect(bad("select", { options: [] })).toContain("at least one");
    });

    it("passes on what is wrong with an option", () => {
      expect(bad("select", { options: [{ label: "" }] })).toContain("label");
    });
  });
});

describe("a config read from the database", () => {
  it("is what was stored, in its normal form", () => {
    expect(fieldConfigOrDefault("text", { maxLength: 50 })).toEqual({
      maxLength: 50,
    });
    expect(
      fieldConfigOrDefault("select", {
        options: [{ id: "a", label: "A", color: null }],
      }),
    ).toEqual({
      options: [{ id: "a", label: "A", color: null }],
    });
  });

  it("is the type's defaults where what was stored is no config any more", () => {
    expect(fieldConfigOrDefault("text", { maxLength: 0 })).toEqual({
      maxLength: DEFAULT_TEXT_LENGTH,
    });
    expect(fieldConfigOrDefault("number", "junk")).toEqual({
      integer: false,
      min: null,
      max: null,
    });
    expect(fieldConfigOrDefault("select", null)).toEqual({ options: [] });
    expect(fieldConfigOrDefault("select", { options: "x" })).toEqual({
      options: [],
    });
    expect(fieldConfigOrDefault("url", { old: true })).toEqual({});
  });

  it("never throws", () => {
    for (const stored of [undefined, null, 1, "x", [], {}, { options: null }]) {
      for (const type of CUSTOM_FIELD_TYPES) {
        expect(() => fieldConfigOrDefault(type, stored)).not.toThrow();
      }
    }
  });
});

describe("a field's key", () => {
  it("is made of the name, the way an address is made of a title", () => {
    expect(deriveFieldKey("Customer number")).toBe("customer-number");
    expect(deriveFieldKey("  Umgebung / Env  ")).toBe("umgebung-env");
  });

  it("starts with a letter: a name that starts with a digit gets field- in front", () => {
    expect(deriveFieldKey("9 lives")).toBe("field-9-lives");
    expect(deriveFieldKey("2FA")).toBe("field-2fa");
    expect(deriveFieldKey("-dash first")).toBe("dash-first");
  });

  it("has at least two characters, and is never empty", () => {
    expect(deriveFieldKey("A")).toBe("field-a");
    expect(deriveFieldKey("???")).toBe("field-x");
    expect(deriveFieldKey("")).toBe("field-x");
  });

  it("is short enough, and does not end in a dash", () => {
    const key = deriveFieldKey(`${"ab ".repeat(30)}`);
    expect(key.length).toBeLessThanOrEqual(MAX_FIELD_KEY_LENGTH);
    expect(key.endsWith("-")).toBe(false);
    expect(isFieldKey(key)).toBe(true);
  });

  it("does not end in a dash where it was cut", () => {
    const key = deriveFieldKey(`${"a".repeat(MAX_FIELD_KEY_LENGTH - 1)} b`);
    expect(key).toBe("a".repeat(MAX_FIELD_KEY_LENGTH - 1));
    expect(isFieldKey(key)).toBe(true);
  });

  it("is always one that passes the check", () => {
    for (const name of [
      "Kunde",
      "9 lives",
      "A",
      "x-y",
      "ÄÖÜ",
      "constructor",
      "   ",
      "a".repeat(80),
    ]) {
      expect(isFieldKey(deriveFieldKey(name))).toBe(true);
    }
  });

  it("is lowercase letters, digits and single dashes, starting with a letter", () => {
    for (const key of ["ab", "customer-number", "a1", "a-1-b"])
      expect(isFieldKey(key)).toBe(true);
    for (const key of [
      "a",
      "1a",
      "-a",
      "a-",
      "a--b",
      "A",
      "a b",
      "a_b",
      "",
      "a".repeat(MAX_FIELD_KEY_LENGTH + 1),
      null,
      5,
    ]) {
      expect(isFieldKey(key)).toBe(false);
    }
    expect(isFieldKey("a".repeat(MAX_FIELD_KEY_LENGTH))).toBe(true);
  });
});

describe("a definition", () => {
  const ok = (input: Parameters<typeof parseDefinition>[0]) => {
    const result = parseDefinition(input);
    if (!result.ok) throw new Error(JSON.stringify(result.issues));
    return result.definition;
  };
  const issues = (input: Parameters<typeof parseDefinition>[0]) => {
    const result = parseDefinition(input);
    if (result.ok) throw new Error("expected problems");
    return result.issues;
  };

  it("is a name, a key, a description, a type and its config, all in their normal form", () => {
    expect(ok({ name: "  Customer number ", type: "text" })).toEqual({
      name: "Customer number",
      key: "customer-number",
      description: "",
      icon: null,
      type: "text",
      config: { maxLength: DEFAULT_TEXT_LENGTH },
    });
  });

  it("has the icon of its type unless it is given one of the list", () => {
    expect(ok({ name: "N", type: "text" }).icon).toBeNull();
    expect(ok({ name: "N", type: "text", icon: "lucide:flag" }).icon).toBe(
      "lucide:flag",
    );
  });

  it("takes nothing, null and an empty text as no icon", () => {
    for (const none of [undefined, null, ""]) {
      expect(ok({ name: "N", type: "text", icon: none }).icon).toBeNull();
    }
  });

  it("refuses an icon that is not on the list, or not text, saying which part it is about", () => {
    for (const bad of [
      "lucide:nonexistent",
      "flag",
      "mdi:home",
      5,
      {},
      [],
      true,
    ]) {
      expect(issues({ name: "N", type: "text", icon: bad })).toEqual([
        { path: "icon", message: "is not one of the icons" },
      ]);
    }
  });

  it("reports the icon together with the other problems", () => {
    const found = issues({ name: "", type: "nope", icon: "x" });
    expect(found.map((i) => i.path).sort()).toEqual(["icon", "name", "type"]);
  });

  it("keeps the key it is given, and the description, trimmed", () => {
    expect(
      ok({
        name: "Kunde",
        key: "cust",
        description: "  Who pays  ",
        type: "url",
      }),
    ).toMatchObject({
      key: "cust",
      description: "Who pays",
      type: "url",
      config: {},
    });
  });

  it("makes the key of the name when it is empty, null or left out", () => {
    for (const key of [undefined, null, ""]) {
      expect(ok({ name: "Env", key, type: "date" }).key).toBe("env");
    }
  });

  it("passes the type's config on, checked", () => {
    expect(
      ok({ name: "Env", type: "select", config: { options: [{ label: "A" }] } })
        .config,
    ).toEqual({
      options: [{ id: "a", label: "A", color: null }],
    });
    expect(
      issues({ name: "Env", type: "select", config: { options: [] } }),
    ).toEqual([
      { path: "config", message: expect.stringContaining("at least one") },
    ]);
  });

  it("needs a name of one line and at most so long", () => {
    for (const name of [
      "",
      "   ",
      undefined,
      null,
      5,
      "a".repeat(MAX_FIELD_NAME_LENGTH + 1),
      "two\nlines",
    ]) {
      expect(
        issues({ name, type: "text" }).some((i) => i.path === "name"),
      ).toBe(true);
    }
    expect(
      ok({ name: "a".repeat(MAX_FIELD_NAME_LENGTH), type: "text" }).name,
    ).toHaveLength(MAX_FIELD_NAME_LENGTH);
  });

  it("needs a key that is a key", () => {
    for (const key of ["A", "a", "with space", "-a", 5, {}]) {
      expect(
        issues({ name: "Env", key, type: "text" }).some(
          (i) => i.path === "key",
        ),
      ).toBe(true);
    }
  });

  it("has a description of text, at most so long", () => {
    expect(
      issues({ name: "Env", type: "text", description: 5 }).some(
        (i) => i.path === "description",
      ),
    ).toBe(true);
    expect(
      issues({
        name: "Env",
        type: "text",
        description: "a".repeat(MAX_FIELD_DESCRIPTION_LENGTH + 1),
      }).some((i) => i.path === "description"),
    ).toBe(true);
    expect(
      ok({
        name: "Env",
        type: "text",
        description: "a".repeat(MAX_FIELD_DESCRIPTION_LENGTH),
      }).description,
    ).toHaveLength(MAX_FIELD_DESCRIPTION_LENGTH);
  });

  it("may have a description of several lines", () => {
    expect(
      ok({ name: "Env", type: "text", description: "one\ntwo" }).description,
    ).toBe("one\ntwo");
  });

  it("takes a description that is null as none", () => {
    expect(
      ok({ name: "Env", type: "text", description: null }).description,
    ).toBe("");
  });

  it("has a description without control characters", () => {
    for (const description of ["bell\u0007", "tab\there", "nul\u0000"]) {
      expect(
        issues({ name: "Env", type: "text", description }).some(
          (i) => i.path === "description",
        ),
      ).toBe(true);
    }
  });

  it("has a type that is one of the types", () => {
    for (const type of ["boolean", "", undefined, null, 1, "Text"]) {
      expect(issues({ name: "Env", type }).some((i) => i.path === "type")).toBe(
        true,
      );
    }
  });

  it("gives every problem at once, each with its part", () => {
    const found = issues({ name: "", key: "X", description: 5, type: "nope" });
    expect(found.map((i) => i.path).sort()).toEqual([
      "description",
      "key",
      "name",
      "type",
    ]);
  });

  it("does not make a key of a name that is not there", () => {
    expect(issues({ name: "", type: "text" }).map((i) => i.path)).toEqual([
      "name",
    ]);
  });
});
