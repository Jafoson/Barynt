import { describe, expect, it, mock } from "bun:test";
import {
  defaultText,
  groupIssues,
  initialState,
  isDirty,
  mustFill,
  type SaveWords,
  saveForm,
  toSubmit,
} from "@/features/plugins/components/PluginSettings/formState";
import type { SettingField, SettingsForm } from "@/lib/plugins/settings";

// What a settings form holds while someone types and what it hands to the action. Pure: the
// conversions and the answer to a failed save are tested here, without a page. What matters: an
// empty box is "not set" and never quietly a `0`, a yes/no is always a boolean, and what the
// server says about a setting ends up under that setting and nowhere else.

function field(more: Partial<SettingField> = {}): SettingField {
  return {
    id: "title",
    type: "text",
    label: "Title",
    description: null,
    required: false,
    placeholder: null,
    format: null,
    maxLength: 200,
    min: null,
    max: null,
    integer: false,
    options: [],
    default: null,
    ...more,
  };
}
const number = (more: Partial<SettingField> = {}) =>
  field({ id: "limit", type: "number", maxLength: null, ...more });
const flag = (more: Partial<SettingField> = {}) =>
  field({
    id: "on",
    type: "boolean",
    maxLength: null,
    default: false,
    ...more,
  });

describe("the state a form starts with", () => {
  it("shows a text as it is stored, and an empty box for one that is not set", () => {
    const form: SettingsForm = {
      fields: [field({ id: "a" }), field({ id: "b" })],
      values: { a: "Hello", b: null },
    };
    expect(initialState(form)).toEqual({ a: "Hello", b: "" });
  });

  it("shows a value the read side left out as an empty box, not as the word undefined", () => {
    expect(initialState({ fields: [field({ id: "a" })], values: {} })).toEqual({
      a: "",
    });
  });

  it("keeps a number as the text a box shows, and a zero as 0", () => {
    const form: SettingsForm = {
      fields: [number({ id: "n" }), number({ id: "z" }), number({ id: "e" })],
      values: { n: 12.5, z: 0, e: null },
    };
    expect(initialState(form)).toEqual({ n: "12.5", z: "0", e: "" });
  });

  it("keeps a choice as its value", () => {
    const form: SettingsForm = {
      fields: [field({ id: "c", type: "select", maxLength: null })],
      values: { c: "b" },
    };
    expect(initialState(form)).toEqual({ c: "b" });
  });

  it("keeps a yes/no as a boolean: true only for true", () => {
    const form: SettingsForm = {
      fields: [flag({ id: "y" }), flag({ id: "n" }), flag({ id: "m" })],
      values: { y: true, n: false },
    };
    expect(initialState(form)).toEqual({ y: true, n: false, m: false });
  });

  it("does not take a setting called like an object's own key for something it inherited", () => {
    const form: SettingsForm = {
      fields: [field({ id: "constructor" })],
      values: {},
    };
    expect(initialState(form)).toEqual({ constructor: "" });
  });
});

describe("what the action is given", () => {
  it("is one entry for each field, the whole form", () => {
    const fields = [field({ id: "a" }), number({ id: "n" }), flag({ id: "y" })];
    expect(toSubmit(fields, { a: "x", n: "3", y: true })).toEqual({
      a: "x",
      n: 3,
      y: true,
    });
  });

  it("turns an empty or blank number box into null, not into 0", () => {
    const fields = [number({ id: "a" }), number({ id: "b" })];
    expect(toSubmit(fields, { a: "", b: "   " })).toEqual({ a: null, b: null });
  });

  it("reads a number from what the box says, a decimal and a negative included", () => {
    const fields = [
      number({ id: "a" }),
      number({ id: "b" }),
      number({ id: "c" }),
    ];
    expect(toSubmit(fields, { a: " 7 ", b: "1.5", c: "-2" })).toEqual({
      a: 7,
      b: 1.5,
      c: -2,
    });
  });

  it("leaves what is not a number as one the server refuses, not a 0", () => {
    const values = toSubmit([number({ id: "a" })], { a: "abc" });
    expect(Number.isNaN(values.a)).toBe(true);
  });

  it("does not cut a number off at the first letter: 12abc is not 12", () => {
    const values = toSubmit([number({ id: "a" })], { a: "12abc" });
    expect(Number.isNaN(values.a)).toBe(true);
  });

  it("passes a text on as it is: the server trims it", () => {
    expect(toSubmit([field({ id: "a" })], { a: "  x  " })).toEqual({
      a: "  x  ",
    });
  });

  it("gives a boolean for a yes/no, false for one the state has no boolean for", () => {
    const fields = [flag({ id: "a" }), flag({ id: "b" })];
    expect(toSubmit(fields, { a: true, b: "true" })).toEqual({
      a: true,
      b: false,
    });
  });

  it("gives an empty text for a field the state has nothing for", () => {
    expect(
      toSubmit([field({ id: "a" }), field({ id: "b", type: "select" })], {}),
    ).toEqual({
      a: "",
      b: "",
    });
  });
});

describe("whether something was changed", () => {
  it("is not, while every field is what it started as", () => {
    expect(isDirty({ a: "x", b: true }, { a: "x", b: true })).toBe(false);
  });

  it("is, for one text, one yes/no", () => {
    expect(isDirty({ a: "x", b: true }, { a: "y", b: true })).toBe(true);
    expect(isDirty({ a: "x", b: true }, { a: "x", b: false })).toBe(true);
  });

  it("is not for a form with nothing in it", () => {
    expect(isDirty({}, {})).toBe(false);
  });
});

describe("the problems the server named", () => {
  it("gives one line by setting, the first, starting with a capital", () => {
    const { byField, whole } = groupIssues([
      { id: "a", message: "must be at least 3" },
      { id: "a", message: "must be a number" },
      { id: "b", message: "is required" },
    ]);
    expect(byField).toEqual({ a: "Must be at least 3", b: "Is required" });
    expect(whole).toEqual([]);
  });

  it("sets apart what is about the values as a whole", () => {
    const { byField, whole } = groupIssues([
      { id: "", message: "is too large" },
      { id: "a", message: "must be a number" },
    ]);
    expect(byField).toEqual({ a: "Must be a number" });
    expect(whole).toEqual(["is too large"]);
  });

  it("copes with a setting called constructor, and with no issues at all", () => {
    expect(
      groupIssues([{ id: "constructor", message: "is required" }]).byField,
    ).toEqual({ constructor: "Is required" });
    expect(groupIssues(undefined)).toEqual({ byField: {}, whole: [] });
    expect(groupIssues([])).toEqual({ byField: {}, whole: [] });
  });
});

describe("whether a box has to be filled", () => {
  it("does, when the manifest says required and there is no default", () => {
    expect(mustFill(field({ required: true }))).toBe(true);
  });

  it("does not, when it is not required", () => {
    expect(mustFill(field({ required: false }))).toBe(false);
  });

  it("does not, when it has a default: an empty box means the default", () => {
    expect(mustFill(field({ required: true, default: "x" }))).toBe(false);
    expect(mustFill(number({ required: true, default: 0 }))).toBe(false);
  });
});

describe("a default, as a hint says it", () => {
  it("is its text or number", () => {
    expect(defaultText(field({ default: "abc" }))).toBe("abc");
    expect(defaultText(number({ default: 5 }))).toBe("5");
    expect(defaultText(number({ default: 0 }))).toBe("0");
  });

  it("is the label of the choice, not its value", () => {
    const select = field({
      type: "select",
      options: [
        { value: "a", label: "Alpha" },
        { value: "b", label: "Beta" },
      ],
      default: "b",
    });
    expect(defaultText(select)).toBe("Beta");
  });

  it("is nothing for a choice the list no longer has", () => {
    const select = field({
      type: "select",
      options: [{ value: "a", label: "Alpha" }],
      default: "gone",
    });
    expect(defaultText(select)).toBeNull();
  });

  it("is nothing where there is none, or it is empty, or it is a yes/no", () => {
    expect(defaultText(field({ default: null }))).toBeNull();
    expect(defaultText(field({ default: "" }))).toBeNull();
    expect(defaultText(flag({ default: true }))).toBeNull();
    expect(defaultText(flag({ default: false }))).toBeNull();
  });
});

describe("saving the form", () => {
  const words: SaveWords = {
    saveFailed: "could not be saved",
    notValid: "not valid",
    tooLarge: "too large",
  };
  const form: SettingsForm = {
    fields: [field({ id: "a" }), number({ id: "n" })],
    values: { a: "x", n: 1 },
  };
  const state = { a: "y", n: "2" };

  it("gives the action the whole form, and is saved when it says ok", async () => {
    const save = mock(async (_values: unknown) => ({ ok: true as const }));
    expect(await saveForm(form, state, save, words)).toEqual({ saved: true });
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ a: "y", n: 2 });
  });

  it("puts a problem with a setting under that setting, and says some are not valid", async () => {
    const save = async () => ({
      error: "Some settings are not valid.",
      issues: [{ id: "n", message: "must be at least 3" }],
    });
    expect(await saveForm(form, state, save, words)).toEqual({
      saved: false,
      errors: { n: "Must be at least 3" },
      failure: "not valid",
    });
  });

  it("says the values are too large together in words", async () => {
    const save = async () => ({
      error: "Some settings are not valid.",
      issues: [{ id: "", message: "is too large" }],
    });
    expect(await saveForm(form, state, save, words)).toEqual({
      saved: false,
      errors: {},
      failure: "too large",
    });
  });

  it("says not valid for any other problem with the values as a whole", async () => {
    const save = async () => ({
      error: "Some settings are not valid.",
      issues: [{ id: "", message: "must be an object" }],
    });
    expect(await saveForm(form, state, save, words)).toEqual({
      saved: false,
      errors: {},
      failure: "not valid",
    });
  });

  it("names every whole-set problem, one after the other", async () => {
    const save = async () => ({
      error: "Some settings are not valid.",
      issues: [
        { id: "", message: "is too large" },
        { id: "", message: "must be an object" },
      ],
    });
    expect((await saveForm(form, state, save, words)).saved).toBe(false);
    expect(await saveForm(form, state, save, words)).toMatchObject({
      failure: "too large not valid",
    });
  });

  it("names the whole-set problem and the setting's own together", async () => {
    const save = async () => ({
      error: "Some settings are not valid.",
      issues: [
        { id: "", message: "is too large" },
        { id: "a", message: "is required" },
      ],
    });
    expect(await saveForm(form, state, save, words)).toEqual({
      saved: false,
      errors: { a: "Is required" },
      failure: "too large",
    });
  });

  it("shows the server's own sentence when no setting is at fault", async () => {
    const save = async () => ({
      error: "Switch the plugin on in this workspace first.",
    });
    expect(await saveForm(form, state, save, words)).toEqual({
      saved: false,
      errors: {},
      failure: "Switch the plugin on in this workspace first.",
    });
  });

  it("shows the server's sentence when the issues list is empty", async () => {
    const save = async () => ({ error: "Unknown plugin.", issues: [] });
    expect(await saveForm(form, state, save, words)).toEqual({
      saved: false,
      errors: {},
      failure: "Unknown plugin.",
    });
  });

  it("says it could not be saved when the action throws, and never shows the error", async () => {
    const save = async () => {
      throw new Error("ECONNRESET at 10.0.0.1");
    };
    const outcome = await saveForm(form, state, save, words);
    expect(outcome).toEqual({
      saved: false,
      errors: {},
      failure: "could not be saved",
    });
    expect(JSON.stringify(outcome)).not.toContain("ECONNRESET");
  });
});
