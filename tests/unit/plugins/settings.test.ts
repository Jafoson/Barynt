import { describe, expect, it } from "bun:test";
import {
  checkSettingValue,
  DEFAULT_TEXT_LENGTH,
  DEFAULT_TEXTAREA_LENGTH,
  defaultOf,
  MAX_SETTINGS_BYTES,
  resolveSettings,
  settingsOf,
  toFields,
  validateSettings,
} from "@/lib/plugins/settings";
import { validateManifest } from "@/lib/plugins/validate";

// The settings a plugin declares and the values people give them: every type and every rule,
// what is refused when it is saved and what a stored value falls back to when it no longer
// fits. Pure logic, no database. Definitions are made the way a plugin makes them, through
// the manifest, so what is tested is what the host reads.

function manifestWith(settings: unknown[]) {
  const result = validateManifest({
    manifestVersion: 1,
    id: "demo",
    name: "Demo",
    version: "1.0.0",
    description: "A demo",
    author: "Someone",
    license: "MIT",
    categories: ["other"],
    barynt: "^0.1.0",
    contributes: { settings },
  });
  if (!result.ok) throw new Error(result.issues[0]?.message);
  return result.manifest;
}
const defs = (...settings: unknown[]) => settingsOf(manifestWith(settings));
const one = (setting: Record<string, unknown>) => {
  const [def] = defs({ id: "s", label: "S", ...setting });
  if (!def) throw new Error("no definition");
  return def;
};

describe("the settings a manifest declares", () => {
  it("are listed in the order the manifest gives them, and none when it gives none", () => {
    const list = defs(
      { id: "b", type: "boolean", label: "B" },
      { id: "a", type: "text", label: "A" },
    );
    expect(list.map((d) => d.id)).toEqual(["b", "a"]);
    const bare = validateManifest({
      manifestVersion: 1,
      id: "demo",
      name: "Demo",
      version: "1.0.0",
      description: "A demo",
      author: "Someone",
      license: "MIT",
      categories: ["other"],
      barynt: "^0.1.0",
    });
    expect(bare.ok && settingsOf(bare.manifest)).toEqual([]);
  });
});

describe("a text", () => {
  const text = (more: Record<string, unknown> = {}) =>
    one({ type: "text", ...more });

  it("is text, and nothing else", () => {
    expect(checkSettingValue(text(), "hello")).toBeNull();
    for (const bad of [1, true, null, undefined, {}, ["a"]]) {
      expect(checkSettingValue(text(), bad)).toBe("must be text");
    }
  });

  it("is at most as long as it says, or 200 characters", () => {
    expect(
      checkSettingValue(text(), "a".repeat(DEFAULT_TEXT_LENGTH)),
    ).toBeNull();
    expect(checkSettingValue(text(), "a".repeat(DEFAULT_TEXT_LENGTH + 1))).toBe(
      `must be at most ${DEFAULT_TEXT_LENGTH} characters`,
    );
    expect(checkSettingValue(text({ maxLength: 5 }), "abcde")).toBeNull();
    expect(checkSettingValue(text({ maxLength: 5 }), "abcdef")).toBe(
      "must be at most 5 characters",
    );
  });

  it("is on one line, and has no control characters", () => {
    expect(checkSettingValue(text(), "a\nb")).toBe("must be on one line");
    expect(checkSettingValue(text(), "a\rb")).toBe("must be on one line");
    expect(checkSettingValue(text(), "a\u0000b")).toBe(
      "must not contain control characters",
    );
    expect(checkSettingValue(text(), "a\u007fb")).toBe(
      "must not contain control characters",
    );
    expect(checkSettingValue(text(), "a\tb")).toBeNull();
  });

  it("is a web address when it says url: http or https, without a user name or a password", () => {
    const url = text({ format: "url" });
    expect(checkSettingValue(url, "https://example.com/hook?a=1")).toBeNull();
    expect(checkSettingValue(url, "http://localhost:8080")).toBeNull();
    expect(checkSettingValue(url, "not a url")).toBe(
      "must be a full web address",
    );
    expect(checkSettingValue(url, "ftp://example.com")).toBe(
      "must be an http:// or https:// address",
    );
    expect(checkSettingValue(url, "javascript:alert(1)")).toBe(
      "must be an http:// or https:// address",
    );
    expect(checkSettingValue(url, "https://user:pw@example.com")).toBe(
      "must not contain a user name or a password",
    );
    expect(checkSettingValue(url, "https://user@example.com")).toBe(
      "must not contain a user name or a password",
    );
  });

  it("is an email address when it says email", () => {
    const email = text({ format: "email" });
    expect(checkSettingValue(email, "a@example.com")).toBeNull();
    for (const bad of ["a", "a@", "@b.com", "a b@c.com", "a@b"]) {
      expect(checkSettingValue(email, bad)).toBe("must be an email address");
    }
  });

  it("has no format check when it says none", () => {
    expect(checkSettingValue(text(), "anything at all")).toBeNull();
  });
});

describe("a long text", () => {
  const area = (more: Record<string, unknown> = {}) =>
    one({ type: "textarea", ...more });

  it("may have lines and tabs, is at most 1000 characters unless it says more, and has no other control characters", () => {
    expect(checkSettingValue(area(), "a\nb\r\nc\td")).toBeNull();
    expect(
      checkSettingValue(area(), "a".repeat(DEFAULT_TEXTAREA_LENGTH)),
    ).toBeNull();
    expect(
      checkSettingValue(area(), "a".repeat(DEFAULT_TEXTAREA_LENGTH + 1)),
    ).toBe(`must be at most ${DEFAULT_TEXTAREA_LENGTH} characters`);
    expect(
      checkSettingValue(area({ maxLength: 4000 }), "a".repeat(4000)),
    ).toBeNull();
    expect(checkSettingValue(area(), "a\u0007b")).toBe(
      "must not contain control characters",
    );
    expect(checkSettingValue(area(), 5)).toBe("must be text");
  });
});

describe("a number", () => {
  const number = (more: Record<string, unknown> = {}) =>
    one({ type: "number", ...more });

  it("is a finite number", () => {
    expect(checkSettingValue(number(), 3.5)).toBeNull();
    expect(checkSettingValue(number(), -2)).toBeNull();
    expect(checkSettingValue(number(), 0)).toBeNull();
    for (const bad of ["3", true, null, undefined, {}, Number.NaN, Infinity]) {
      expect(checkSettingValue(number(), bad)).toBe("must be a number");
    }
  });

  it("is within min and max, both included", () => {
    const bounded = number({ min: 1, max: 10 });
    expect(checkSettingValue(bounded, 1)).toBeNull();
    expect(checkSettingValue(bounded, 10)).toBeNull();
    expect(checkSettingValue(bounded, 0.9)).toBe("must be at least 1");
    expect(checkSettingValue(bounded, 10.1)).toBe("must be at most 10");
    expect(checkSettingValue(number({ min: 0 }), -1)).toBe(
      "must be at least 0",
    );
    expect(checkSettingValue(number({ max: 0 }), 1)).toBe("must be at most 0");
  });

  it("is whole when it says integer", () => {
    expect(checkSettingValue(number({ integer: true }), 4)).toBeNull();
    expect(checkSettingValue(number({ integer: true }), 4.5)).toBe(
      "must be a whole number",
    );
    expect(checkSettingValue(number({ integer: false }), 4.5)).toBeNull();
  });
});

describe("a yes or no", () => {
  it("is a boolean", () => {
    const flag = one({ type: "boolean" });
    expect(checkSettingValue(flag, true)).toBeNull();
    expect(checkSettingValue(flag, false)).toBeNull();
    for (const bad of ["true", 1, 0, null, undefined]) {
      expect(checkSettingValue(flag, bad)).toBe("must be yes or no");
    }
  });
});

describe("a choice", () => {
  const choice = one({
    type: "select",
    options: [
      { value: "board", label: "Board" },
      { value: "list", label: "List" },
    ],
  });

  it("is one of the choices, exactly", () => {
    expect(checkSettingValue(choice, "board")).toBeNull();
    expect(checkSettingValue(choice, "list")).toBeNull();
    for (const bad of ["Board", "grid", "", 1, null, undefined, ["board"]]) {
      expect(checkSettingValue(choice, bad)).toBe("must be one of the choices");
    }
  });

  it("does not take a name from Object.prototype for a choice", () => {
    expect(checkSettingValue(choice, "constructor")).toBe(
      "must be one of the choices",
    );
    expect(checkSettingValue(choice, "__proto__")).toBe(
      "must be one of the choices",
    );
  });
});

describe("the default", () => {
  it("is what the definition says, and a yes/no is off when it says nothing", () => {
    expect(defaultOf(one({ type: "text", default: "x" }))).toBe("x");
    expect(defaultOf(one({ type: "number", default: 0 }))).toBe(0);
    expect(defaultOf(one({ type: "boolean", default: true }))).toBe(true);
    expect(defaultOf(one({ type: "boolean" }))).toBe(false);
    expect(defaultOf(one({ type: "text" }))).toBeNull();
    expect(defaultOf(one({ type: "number" }))).toBeNull();
  });
});

describe("saving values", () => {
  const all = defs(
    { id: "title", type: "text", label: "Title", default: "Board" },
    { id: "note", type: "textarea", label: "Note" },
    {
      id: "limit",
      type: "number",
      label: "Limit",
      min: 1,
      max: 100,
      integer: true,
    },
    { id: "compact", type: "boolean", label: "Compact" },
    {
      id: "view",
      type: "select",
      label: "View",
      required: true,
      options: [
        { value: "board", label: "Board" },
        { value: "list", label: "List" },
      ],
      default: "board",
    },
    { id: "hook", type: "text", label: "Hook", required: true },
  );

  const issues = (input: unknown) => {
    const result = validateSettings(all, input);
    return result.ok ? [] : result.issues;
  };
  const valid = { hook: "https://example.com" };

  it("gives back what was set and differs from the default, and nothing else", () => {
    expect(
      validateSettings(all, {
        title: "Sprint",
        note: "Remember the milk",
        limit: 20,
        compact: true,
        view: "list",
        hook: "https://example.com",
      }),
    ).toEqual({
      ok: true,
      values: {
        title: "Sprint",
        note: "Remember the milk",
        limit: 20,
        compact: true,
        view: "list",
        hook: "https://example.com",
      },
    });
  });

  it("drops a value that is the default, so a changed default reaches everyone who never chose", () => {
    expect(
      validateSettings(all, {
        ...valid,
        title: "Board",
        view: "board",
        compact: false,
      }),
    ).toEqual({ ok: true, values: { hook: "https://example.com" } });
  });

  it("treats a missing value, null and an empty text as not set", () => {
    expect(validateSettings(all, valid)).toEqual({ ok: true, values: valid });
    expect(
      validateSettings(all, {
        ...valid,
        note: null,
        limit: undefined,
        title: "",
      }),
    ).toEqual({ ok: true, values: valid });
  });

  it("trims a long text too", () => {
    expect(validateSettings(all, { ...valid, note: "  hello \n" })).toEqual({
      ok: true,
      values: { ...valid, note: "hello" },
    });
  });

  it("does not take a name from Object.prototype for a value someone gave", () => {
    const odd = defs(
      { id: "constructor", type: "text", label: "C" },
      { id: "to-string", type: "text", label: "T" },
    );
    expect(validateSettings(odd, {})).toEqual({ ok: true, values: {} });
    expect(validateSettings(odd, { constructor: "x" })).toEqual({
      ok: true,
      values: { constructor: "x" },
    });
  });

  it("trims a text, and a text of spaces is not set", () => {
    expect(validateSettings(all, { ...valid, title: "  Sprint  " })).toEqual({
      ok: true,
      values: { ...valid, title: "Sprint" },
    });
    expect(issues({ ...valid, hook: "   " })).toEqual([
      { id: "hook", message: "is required" },
    ]);
  });

  it("does not let a required setting without a default be empty, and lets one with a default be", () => {
    expect(issues({})).toEqual([{ id: "hook", message: "is required" }]);
    // `view` is required and has a default: not set means the default.
    expect(issues({ ...valid, view: "" })).toEqual([]);
    expect(issues({ ...valid, hook: null })).toEqual([
      { id: "hook", message: "is required" },
    ]);
  });

  it("refuses a key that is not a setting of the plugin, and names it", () => {
    expect(issues({ ...valid, evil: "x" })).toEqual([
      { id: "evil", message: "is not a setting of this plugin" },
    ]);
    expect(issues({ ...valid, __proto__x: 1 })).toEqual([
      { id: "__proto__x", message: "is not a setting of this plugin" },
    ]);
  });

  it("refuses a value that does not fit, and names the setting and what is wrong", () => {
    expect(
      issues({ ...valid, limit: 0, view: "grid", compact: "yes", title: 5 }),
    ).toEqual([
      { id: "title", message: "must be text" },
      { id: "limit", message: "must be at least 1" },
      { id: "compact", message: "must be yes or no" },
      { id: "view", message: "must be one of the choices" },
    ]);
  });

  it("reports every problem at once, not the first", () => {
    expect(
      issues({ evil: 1, limit: "x", hook: "" })
        .map((i) => i.id)
        .sort(),
    ).toEqual(["evil", "hook", "limit"]);
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a text", "title"],
    ["a number", 5],
    ["a list", [{ title: "x" }]],
    ["a class instance", new Date()],
  ])("refuses %s as the set of values", (_n, input) => {
    expect(validateSettings(all, input)).toEqual({
      ok: false,
      issues: [{ id: "", message: "must be an object" }],
    });
  });

  it("takes an object without a prototype", () => {
    const bare = Object.assign(Object.create(null), valid);
    expect(validateSettings(all, bare)).toEqual({ ok: true, values: valid });
  });

  it("does not read a value off the prototype", () => {
    const inherited = Object.create({ hook: "https://example.com" });
    expect(validateSettings(all, inherited)).toEqual({
      ok: false,
      issues: [{ id: "", message: "must be an object" }],
    });
  });

  it("refuses more than it may keep, as a whole", () => {
    const big = defs(
      ...Array.from({ length: 20 }, (_, i) => ({
        id: `note-${i}`,
        type: "textarea",
        label: "N",
        maxLength: 4000,
      })),
    );
    const input = Object.fromEntries(big.map((d) => [d.id, "a".repeat(4000)]));
    expect(JSON.stringify(input).length).toBeGreaterThan(MAX_SETTINGS_BYTES);
    expect(validateSettings(big, input)).toEqual({
      ok: false,
      issues: [{ id: "", message: "is too large" }],
    });
    // The size is only said when nothing else is wrong: one problem at a time is enough.
    expect(validateSettings(big, { ...input, evil: 1 })).toEqual({
      ok: false,
      issues: [{ id: "evil", message: "is not a setting of this plugin" }],
    });
    const fits = Object.fromEntries(
      big.slice(0, 10).map((d) => [d.id, "a".repeat(4000)]),
    );
    expect(validateSettings(big, fits).ok).toBe(true);
  });

  it("has nothing to save for a plugin with no settings, and refuses anything sent", () => {
    expect(validateSettings([], {})).toEqual({ ok: true, values: {} });
    expect(validateSettings([], { a: 1 })).toEqual({
      ok: false,
      issues: [{ id: "a", message: "is not a setting of this plugin" }],
    });
  });
});

describe("reading values", () => {
  const all = defs(
    { id: "title", type: "text", label: "Title", default: "Board" },
    { id: "limit", type: "number", label: "Limit", min: 1 },
    { id: "compact", type: "boolean", label: "Compact" },
    {
      id: "view",
      type: "select",
      label: "View",
      options: [{ value: "board", label: "Board" }],
    },
  );

  it("is what is stored, and the default for what is not, and null where there is no default", () => {
    expect(
      resolveSettings(all, {
        title: "Sprint",
        limit: 5,
        compact: true,
        view: "board",
      }),
    ).toEqual({ title: "Sprint", limit: 5, compact: true, view: "board" });
    expect(resolveSettings(all, {})).toEqual({
      title: "Board",
      limit: null,
      compact: false,
      view: null,
    });
  });

  it("falls back to the default for a stored value that no longer fits, as after a plugin update", () => {
    expect(
      resolveSettings(all, {
        title: 7,
        limit: 0,
        compact: "yes",
        view: "grid",
      }),
    ).toEqual({ title: "Board", limit: null, compact: false, view: null });
  });

  it("has an entry for every setting, and none for a key that is not one", () => {
    expect(Object.keys(resolveSettings(all, { evil: 1 }))).toEqual([
      "title",
      "limit",
      "compact",
      "view",
    ]);
  });

  it.each([
    ["nothing", undefined],
    ["null", null],
    ["a text", "x"],
    ["a list", ["title"]],
  ])(
    "takes %s in the database for nothing stored, and does not throw",
    (_n, stored) => {
      expect(resolveSettings(all, stored).title).toBe("Board");
    },
  );

  it("does not read a value off the prototype", () => {
    const inherited = Object.create({ title: "Inherited" });
    expect(resolveSettings(all, inherited).title).toBe("Board");
  });
});

describe("what a form needs", () => {
  const list = defs(
    {
      id: "title",
      type: "text",
      label: { en: "Title", de: "Titel" },
      description: { en: "Shown on top", de: "Steht oben" },
      placeholder: { en: "Board", de: "Tafel" },
      format: "url",
      maxLength: 50,
      required: true,
      default: "https://a.example",
    },
    { id: "note", type: "textarea", label: "Note" },
    {
      id: "limit",
      type: "number",
      label: "Limit",
      min: 1,
      max: 9,
      integer: true,
    },
    { id: "compact", type: "boolean", label: "Compact" },
    {
      id: "view",
      type: "select",
      label: "View",
      options: [
        { value: "board", label: { en: "Board", de: "Tafel" } },
        { value: "list", label: "List" },
      ],
    },
  );

  it("has the words in the language asked for, and the fallback where there is none", () => {
    const de = toFields(list, "de");
    expect(de[0]).toMatchObject({
      label: "Titel",
      description: "Steht oben",
      placeholder: "Tafel",
    });
    expect(toFields(list, "fr")[0]).toMatchObject({ label: "Title" });
    expect(de[4]?.options).toEqual([
      { value: "board", label: "Tafel" },
      { value: "list", label: "List" },
    ]);
  });

  it("carries only what belongs to each type, and null or empty for the rest", () => {
    const [title, note, limit, compact, view] = toFields(list, "en");
    expect(title).toMatchObject({
      type: "text",
      format: "url",
      maxLength: 50,
      required: true,
      default: "https://a.example",
      min: null,
      max: null,
      integer: false,
      options: [],
    });
    expect(note).toMatchObject({
      type: "textarea",
      maxLength: DEFAULT_TEXTAREA_LENGTH,
      format: null,
      description: null,
      placeholder: null,
      required: false,
      default: null,
    });
    expect(limit).toMatchObject({
      type: "number",
      min: 1,
      max: 9,
      integer: true,
      maxLength: null,
      format: null,
    });
    // A yes/no is never required: it always has a value.
    expect(compact).toMatchObject({
      type: "boolean",
      required: false,
      default: false,
    });
    expect(view).toMatchObject({ type: "select", maxLength: null, min: null });
    expect(view?.options).toHaveLength(2);
  });

  it("says how long a text may be when the definition does not", () => {
    expect(
      toFields(defs({ id: "t", type: "text", label: "T" }), "en")[0]?.maxLength,
    ).toBe(DEFAULT_TEXT_LENGTH);
  });
});
