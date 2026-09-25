import { describe, expect, it, mock } from "bun:test";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The controls of a plugin's settings. Static markup shows which control each type gets and
// which limits the browser is given from the same field the server checks. What matters: a
// value that cannot be saved mostly cannot be typed (length, range, address), a field with a
// default is never marked required (an empty box means the default), a choice always has a way
// to be left alone or must be made, and a problem shows under its own setting.

mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));
mock.module("next-intl", () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key;
  return { useTranslations: () => t };
});

import type { FormState } from "@/features/plugins/components/PluginSettings/formState";
import { SettingsFields } from "@/features/plugins/components/PluginSettings/SettingsFields";
import type { SettingField } from "@/lib/plugins/settings";

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

function render(
  fields: SettingField[],
  state: FormState = {},
  more: { errors?: Record<string, string>; disabled?: boolean } = {},
): string {
  return renderToStaticMarkup(
    <SettingsFields
      fields={fields}
      state={state}
      errors={more.errors ?? {}}
      disabled={more.disabled ?? false}
      idPrefix="p"
      onChange={() => {}}
    />,
  );
}

/** What the line under a field says, or `null` when it says nothing. */
function hint(html: string): string | null {
  return html.match(/class="feedback hint(?:Text)?">([^<]*)</)?.[1] ?? null;
}

/** The opening tag of the first element with this id, so attributes are read from one control. */
function tag(html: string, id: string): string {
  const match = html.match(new RegExp(`<[a-z]+[^>]*\\bid="${id}"[^>]*>`));
  if (!match) throw new Error(`no element with id ${id} in ${html}`);
  return match[0];
}

describe("a line of text", () => {
  it("is a text box with the label, the value, the length and the placeholder", () => {
    const html = render([field({ maxLength: 40, placeholder: "Name it" })], {
      title: "Hello",
    });
    const input = tag(html, "p-title");
    expect(input).toContain("<input");
    expect(input).toContain('type="text"');
    expect(input).toContain('value="Hello"');
    expect(input).toContain('maxLength="40"');
    expect(input).toContain('placeholder="Name it"');
    expect(html).toContain(">Title</label>");
  });

  it("asks the browser for an address or an email where the manifest says so", () => {
    const url = render([field({ id: "u", format: "url" })], { u: "" });
    expect(tag(url, "p-u")).toContain('type="url"');
    const email = render([field({ id: "e", format: "email" })], { e: "" });
    expect(tag(email, "p-e")).toContain('type="email"');
  });

  it("does not let the browser fill it in", () => {
    expect(tag(render([field()], { title: "" }), "p-title")).toContain(
      'autoComplete="off"',
    );
  });

  it("is required where it must be filled, and only there", () => {
    const must = render([field({ required: true })], { title: "" });
    expect(tag(must, "p-title")).toContain("required");
    const optional = render([field()], { title: "" });
    expect(tag(optional, "p-title")).not.toContain("required");
  });

  it("is not required when it has a default, because an empty box means the default", () => {
    const html = render([field({ required: true, default: "Untitled" })], {
      title: "",
    });
    expect(tag(html, "p-title")).not.toContain("required");
    expect(hint(html)).toBe("default:Untitled");
  });

  it("is disabled while a save is running", () => {
    const html = render([field()], { title: "" }, { disabled: true });
    expect(tag(html, "p-title")).toContain("disabled");
  });
});

describe("what a field says under its label", () => {
  it("is what the manifest says it is for", () => {
    const html = render([field({ description: "Shown in the header" })], {
      title: "",
    });
    expect(hint(html)).toBe("Shown in the header");
  });

  it("says a field that must be filled is required", () => {
    const html = render([field({ required: true })], { title: "" });
    expect(hint(html)).toBe("required");
  });

  it("says the default, so someone knows what an empty box means", () => {
    const html = render([field({ default: "Untitled" })], { title: "" });
    expect(hint(html)).toBe("default:Untitled");
  });

  it("puts the three together, in that order", () => {
    const html = render(
      [field({ description: "For the header", required: true })],
      { title: "" },
    );
    expect(hint(html)).toBe("For the header · required");
    const withDefault = render(
      [field({ description: "For the header", default: "Untitled" })],
      { title: "" },
    );
    expect(hint(withDefault)).toBe("For the header · default:Untitled");
  });

  it("says nothing when there is nothing to say", () => {
    expect(hint(render([field()], { title: "" }))).toBeNull();
  });

  it("shows the problem instead of the hint, under the field, and marks the field", () => {
    const html = render(
      [field({ description: "For the header" })],
      { title: "x" },
      { errors: { title: "Must be at most 3 characters" } },
    );
    expect(html).toContain("Must be at most 3 characters");
    expect(html).not.toContain("For the header");
    expect(tag(html, "p-title")).toContain('aria-invalid="true"');
  });

  it("shows a problem only under the setting it is about", () => {
    const html = render(
      [field({ id: "a", label: "A" }), field({ id: "b", label: "B" })],
      { a: "", b: "" },
      { errors: { b: "Is required" } },
    );
    expect(html.match(/Is required/g)).toHaveLength(1);
    expect(tag(html, "p-a")).not.toContain("aria-invalid");
    expect(tag(html, "p-b")).toContain("aria-invalid");
  });

  it("does not take a setting called constructor for one that has a problem", () => {
    const html = render([field({ id: "constructor" })], { constructor: "" });
    expect(tag(html, "p-constructor")).not.toContain("aria-invalid");
    expect(html).not.toContain("function");
  });
});

describe("a long text", () => {
  it("is a text area of four lines with the length and the placeholder", () => {
    const html = render(
      [
        field({
          id: "notes",
          type: "textarea",
          maxLength: 1000,
          placeholder: "Write here",
        }),
      ],
      { notes: "a\nb" },
    );
    const area = tag(html, "p-notes");
    expect(area).toContain("<textarea");
    expect(area).toContain('rows="4"');
    expect(area).toContain('maxLength="1000"');
    expect(area).toContain('placeholder="Write here"');
    expect(html).toContain(">a\nb</textarea>");
  });

  it("says what it is for, shows its problem and is disabled while a save runs, like every field", () => {
    const area = field({
      id: "n",
      type: "textarea",
      description: "Longer notes",
    });
    const described = render([area], { n: "" });
    expect(hint(described)).toBe("Longer notes");
    expect(tag(described, "p-n")).toContain('aria-describedby="p-n-hint"');
    expect(described).toContain('id="p-n-hint"');
    const broken = render([area], { n: "" }, { errors: { n: "Too long" } });
    expect(broken).toContain("Too long");
    expect(tag(broken, "p-n")).toContain('aria-invalid="true"');
    expect(tag(broken, "p-n")).toContain('aria-describedby="p-n-error"');
    expect(tag(render([area], { n: "" }, { disabled: true }), "p-n")).toContain(
      "disabled",
    );
  });

  it("is required only where it must be filled", () => {
    const must = render(
      [field({ id: "n", type: "textarea", required: true })],
      { n: "" },
    );
    expect(tag(must, "p-n")).toContain("required");
    const optional = render([field({ id: "n", type: "textarea" })], { n: "" });
    expect(tag(optional, "p-n")).not.toContain("required");
  });
});

describe("a number", () => {
  it("is a number box with its range, and any decimal unless it is a whole number", () => {
    const html = render(
      [field({ id: "n", type: "number", maxLength: null, min: 1, max: 9 })],
      { n: "5" },
    );
    const input = tag(html, "p-n");
    expect(input).toContain('type="number"');
    expect(input).toContain('min="1"');
    expect(input).toContain('max="9"');
    expect(input).toContain('step="any"');
    expect(input).toContain('value="5"');
  });

  it("is required only where it must be filled, and says so", () => {
    const num = (more: Partial<SettingField>) =>
      field({ id: "n", type: "number", maxLength: null, ...more });
    const must = render([num({ required: true })], { n: "" });
    expect(tag(must, "p-n")).toContain("required");
    expect(hint(must)).toBe("required");
    expect(tag(render([num({})], { n: "" }), "p-n")).not.toContain("required");
  });

  it("says what it is for, shows its problem and is disabled while a save runs", () => {
    const num = field({
      id: "n",
      type: "number",
      maxLength: null,
      description: "How many",
    });
    expect(hint(render([num], { n: "" }))).toBe("How many");
    const broken = render([num], { n: "" }, { errors: { n: "Too big" } });
    expect(broken).toContain("Too big");
    expect(tag(broken, "p-n")).toContain('aria-invalid="true"');
    expect(tag(render([num], { n: "" }, { disabled: true }), "p-n")).toContain(
      "disabled",
    );
  });

  it("steps by one for a whole number", () => {
    const html = render(
      [field({ id: "n", type: "number", maxLength: null, integer: true })],
      { n: "" },
    );
    expect(tag(html, "p-n")).toContain('step="1"');
  });

  it("has no range the manifest did not give, and lets a zero bound through", () => {
    const html = render([field({ id: "n", type: "number", maxLength: null })], {
      n: "",
    });
    expect(tag(html, "p-n")).not.toContain("min=");
    expect(tag(html, "p-n")).not.toContain("max=");
    const zero = render(
      [field({ id: "n", type: "number", maxLength: null, min: 0, max: 0 })],
      { n: "" },
    );
    expect(tag(zero, "p-n")).toContain('min="0"');
    expect(tag(zero, "p-n")).toContain('max="0"');
  });
});

describe("a choice", () => {
  const options = [
    { value: "a", label: "Alpha" },
    { value: "b", label: "Beta" },
  ];
  const choice = (more: Partial<SettingField> = {}) =>
    field({ id: "c", type: "select", maxLength: null, options, ...more });

  it("lists the choices by their labels, with the value it has now selected", () => {
    const html = render([choice({ default: "a" })], { c: "b" });
    expect(html).toContain('<option value="a">Alpha</option>');
    expect(html).toContain('<option value="b" selected="">Beta</option>');
  });

  it("has no empty choice when it has a default: an empty one would mean the default anyway", () => {
    const html = render([choice({ default: "a" })], { c: "a" });
    expect(html).not.toContain('<option value="">');
    expect(tag(html, "p-c")).not.toContain("required");
  });

  it("can be left alone when it has no default and does not have to be set", () => {
    const html = render([choice()], { c: "" });
    expect(html).toContain('<option value="" selected="">notSet</option>');
    expect(html).not.toContain("disabled");
    expect(tag(html, "p-c")).not.toContain("required");
  });

  it("has to be chosen when it is required and has no default", () => {
    const html = render([choice({ required: true })], { c: "" });
    expect(html).toContain(
      '<option value="" disabled="" selected="">choose</option>',
    );
    expect(tag(html, "p-c")).toContain("required");
  });

  it("says the default by its label", () => {
    const html = render([choice({ default: "b" })], { c: "b" });
    expect(hint(html)).toBe("default:Beta");
  });

  it("shows its problem under it and marks it", () => {
    const html = render(
      [choice({ default: "a" })],
      { c: "a" },
      { errors: { c: "Must be one of the choices" } },
    );
    expect(html).toContain("Must be one of the choices");
    expect(tag(html, "p-c")).toContain('aria-invalid="true"');
    expect(tag(html, "p-c")).toContain('aria-describedby="p-c-error"');
    expect(html).toContain('id="p-c-error"');
  });

  it("is disabled while a save is running", () => {
    const html = render(
      [choice({ default: "a" })],
      { c: "a" },
      { disabled: true },
    );
    expect(tag(html, "p-c")).toContain("disabled");
  });
});

describe("a yes/no", () => {
  const flag = (more: Partial<SettingField> = {}) =>
    field({
      id: "on",
      type: "boolean",
      maxLength: null,
      default: false,
      ...more,
    });

  it("is a checkbox with the label next to it, ticked when it is on", () => {
    const on = render([flag({ label: "Enabled" })], { on: true });
    expect(tag(on, "p-on")).toContain('type="checkbox"');
    expect(tag(on, "p-on")).toContain("checked");
    expect(on).toContain("<span>Enabled</span>");
    const off = render([flag()], { on: false });
    expect(tag(off, "p-on")).not.toContain("checked");
  });

  it("says what it is for, and says no default: the box is the default", () => {
    const html = render([flag({ description: "Turns it on", default: true })], {
      on: true,
    });
    expect(html).toContain('<span class="checkHint">Turns it on</span>');
    expect(html).not.toContain("default:");
  });

  it("shows a problem under it", () => {
    const html = render(
      [flag()],
      { on: false },
      { errors: { on: "Must be yes or no" } },
    );
    expect(html).toContain("Must be yes or no");
  });

  it("is disabled while a save is running", () => {
    const html = render([flag()], { on: false }, { disabled: true });
    expect(tag(html, "p-on")).toContain("disabled");
  });
});

describe("a field the state has nothing for yet", () => {
  it("shows an empty box, not the word undefined, and a yes/no that is off", () => {
    const html = render(
      [field({ id: "a" }), field({ id: "b", type: "textarea" })],
      {},
    );
    expect(tag(html, "p-a")).toContain('value=""');
    expect(html).toContain("></textarea>");
    const flagOff = render(
      [field({ id: "y", type: "boolean", maxLength: null })],
      {},
    );
    expect(tag(flagOff, "p-y")).not.toContain("checked");
  });
});

describe("the form as a whole", () => {
  it("draws every field, in the order the manifest lists them, with ids that are its own", () => {
    const html = render(
      [
        field({ id: "first", label: "First" }),
        field({
          id: "second",
          type: "boolean",
          label: "Second",
          maxLength: null,
        }),
        field({ id: "third", type: "textarea", label: "Third" }),
      ],
      { first: "", second: false, third: "" },
    );
    const order = ["p-first", "p-second", "p-third"].map((id) =>
      html.indexOf(`id="${id}"`),
    );
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it("draws nothing for a plugin with no settings", () => {
    expect(render([])).not.toContain("<input");
  });
});

describe("what typing does", () => {
  /** Every element in the tree the component returned that has a change handler, by its id. */
  function handlers(
    fields: SettingField[],
    onChange: (id: string, value: string | boolean) => void,
  ): Record<string, (event: unknown) => void> {
    const found: Record<string, (event: unknown) => void> = {};
    const visit = (node: ReactNode): void => {
      if (Array.isArray(node)) {
        for (const child of node) visit(child);
        return;
      }
      if (!node || typeof node !== "object" || !("props" in node)) return;
      const element = node as ReactElement<{
        id?: string;
        onChange?: (event: unknown) => void;
        children?: ReactNode;
      }>;
      if (element.props.id && element.props.onChange) {
        found[element.props.id] = element.props.onChange;
      }
      visit(element.props.children);
    };
    visit(
      SettingsFields({
        fields,
        state: {},
        errors: {},
        disabled: false,
        idPrefix: "p",
        onChange,
      }),
    );
    return found;
  }

  const typed = (value: string) => ({ target: { value } });
  const ticked = (checked: boolean) => ({ target: { checked } });

  it("tells which setting changed and to what, for a text, a long text, a number and a choice", () => {
    const changes: [string, string | boolean][] = [];
    const on = handlers(
      [
        field({ id: "a" }),
        field({ id: "b", type: "textarea" }),
        field({ id: "c", type: "number", maxLength: null }),
        field({ id: "d", type: "select", maxLength: null }),
      ],
      (id, value) => changes.push([id, value]),
    );
    on["p-a"](typed("one"));
    on["p-b"](typed("two\nlines"));
    on["p-c"](typed("3"));
    on["p-d"](typed("choice"));
    expect(changes).toEqual([
      ["a", "one"],
      ["b", "two\nlines"],
      ["c", "3"],
      ["d", "choice"],
    ]);
  });

  it("tells whether a yes/no is ticked, as a boolean", () => {
    const changes: [string, string | boolean][] = [];
    const on = handlers(
      [field({ id: "y", type: "boolean", maxLength: null })],
      (id, value) => changes.push([id, value]),
    );
    on["p-y"](ticked(true));
    on["p-y"](ticked(false));
    expect(changes).toEqual([
      ["y", true],
      ["y", false],
    ]);
  });
});
