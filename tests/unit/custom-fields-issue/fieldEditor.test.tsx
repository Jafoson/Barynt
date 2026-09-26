import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactElement } from "react";

// The popover that changes one answer. What matters: a choice and a person are picked from a list
// and the pick is the confirmation, a typed value is saved with the button, it starts from the
// answer that is there, an empty box clears, what cannot be saved says why (the same checks the
// server makes), and each box gets the limits of its own type. The editor uses no hooks of its own,
// so it is called as a function and its tree is read.

mock.module("next-intl", () => {
  const t = (key: string) => key;
  return { useTranslations: () => t };
});
mock.module("@/components/ui/atoms/Avatar/Avatar", () => ({
  Avatar: () => <i />,
}));

import { Input } from "@/components/ui/atoms/Input/Input";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { FieldEditor } from "@/features/custom-fields/components/FieldEditor/FieldEditor";
import type { CustomFieldRow } from "@/features/custom-fields/types";
import { ValuePopover } from "@/features/issues/components/ValuePopover/ValuePopover";
import type { CustomFieldConfig, FieldValue } from "@/lib/custom-fields/types";
import type { User } from "@/types";

// biome-ignore lint/suspicious/noExplicitAny: the props of whichever component the editor returned
type Node = ReactElement<Record<string, any>>;

function field(
  type: CustomFieldRow["type"],
  config: CustomFieldConfig = {},
): CustomFieldRow {
  return {
    id: "cf-1",
    key: "k",
    name: "The field",
    description: "",
    icon: null,
    type,
    config,
    position: 0,
    archived: false,
    pluginId: null,
    workspaceId: "w",
    projectId: null,
  };
}

const members = [
  { id: "u-ada", firstName: "Ada", lastName: "Lovelace", color: "#111" },
  { id: "u-grace", firstName: "Grace", lastName: "Hopper", color: "#222" },
] as User[];
const onSave = mock();
const close = mock();

beforeEach(() => {
  onSave.mockReset();
  close.mockReset();
});

const editor = (f: CustomFieldRow, value: FieldValue | null = null): Node =>
  FieldEditor({ field: f, value, members, onSave, close }) as Node;

/** The input the popover draws for a draft, as its render prop makes it, and the setter it was given. */
const drawn = (popover: Node, draft = "") => {
  const setText = mock();
  const input = (
    popover.props.children as (t: string, s: (t: string) => void) => Node
  )(draft, setText);
  return { input, setText };
};
const inputOf = (popover: Node, draft = ""): Node =>
  drawn(popover, draft).input;

describe("a choice", () => {
  const choice = field("select", {
    options: [
      { id: "prod", label: "Production", color: "#ff0000" },
      { id: "dev", label: "Development", color: null },
    ],
  });

  it("is a list of the options, after a way to say none, with the answer that is there picked", () => {
    const tree = editor(choice, "dev");
    expect(tree.type).toBe(SelectMenu);
    expect(
      tree.props.items.map((i: { value: unknown; label: string }) => [
        i.value,
        i.label,
      ]),
    ).toEqual([
      [null, "customFields.none"],
      ["prod", "Production"],
      ["dev", "Development"],
    ]);
    expect(tree.props.value).toBe("dev");
  });

  it("draws the option's color, and nothing for an option without one", () => {
    const items = editor(choice).props.items as { icon?: Node }[];
    expect(items[0].icon).toBeUndefined();
    expect(items[1].icon?.props.style).toEqual({ "--option-color": "#ff0000" });
    expect(items[2].icon).toBeUndefined();
  });

  it("saves the pick and closes: choosing is the confirmation", () => {
    editor(choice).props.onPick("prod");
    expect(onSave).toHaveBeenCalledWith("prod");
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("clears the answer when none is picked", () => {
    editor(choice, "prod").props.onPick(null);
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("is not searched: a choice is a short list", () => {
    expect(editor(choice).props.searchable).toBeFalsy();
  });

  it("closes without saving from the menu's own close", () => {
    editor(choice).props.onClose();
    expect(close).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});

describe("a person", () => {
  const person = field("user");

  it("is a searchable list of the members, after a way to say none", () => {
    const tree = editor(person, "u-grace");
    expect(tree.type).toBe(SelectMenu);
    expect(tree.props.searchable).toBe(true);
    expect(
      tree.props.items.map((i: { value: unknown; label: string }) => [
        i.value,
        i.label,
      ]),
    ).toEqual([
      [null, "customFields.none"],
      ["u-ada", "Ada Lovelace"],
      ["u-grace", "Grace Hopper"],
    ]);
    expect(tree.props.value).toBe("u-grace");
  });

  it("saves the pick and closes, or clears", () => {
    editor(person).props.onPick("u-ada");
    expect(onSave).toHaveBeenLastCalledWith("u-ada");
    editor(person, "u-ada").props.onPick(null);
    expect(onSave).toHaveBeenLastCalledWith(null);
    expect(close).toHaveBeenCalledTimes(2);
  });
});

describe("a typed answer", () => {
  const text = field("text", { maxLength: 5 });

  it("is saved with the button, from what is typed", () => {
    const tree = editor(text);
    expect(tree.type).toBe(ValuePopover);
    tree.props.onConfirm("Acme");
    expect(onSave).toHaveBeenCalledWith("Acme");
  });

  it("starts from the answer that is there", () => {
    expect(editor(text, "Acme").props.initialValue).toBe("Acme");
    expect(editor(text).props.initialValue).toBe("");
    expect(
      editor(field("number", { integer: false, min: null, max: null }), 0).props
        .initialValue,
    ).toBe("0");
  });

  it("offers Clear only while there is an answer to clear", () => {
    expect(editor(text).props.clearable).toBe(false);
    expect(editor(text, "Acme").props.clearable).toBe(true);
    expect(
      editor(field("number", { integer: false, min: null, max: null }), 0).props
        .clearable,
    ).toBe(true);
  });

  it("clears with null", () => {
    editor(text, "Acme").props.onClear();
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("saves an empty box as clearing", () => {
    editor(text, "Acme").props.onConfirm("   ");
    expect(onSave).toHaveBeenCalledWith(null);
  });

  it("saves a number as a number", () => {
    editor(
      field("number", { integer: false, min: null, max: null }),
    ).props.onConfirm("7");
    expect(onSave).toHaveBeenCalledWith(7);
  });

  it("says why an answer cannot be saved, the way the server would, and nothing for one that can", () => {
    const problem = editor(text).props.problem as (t: string) => string | null;
    expect(problem("Acme")).toBeNull();
    expect(problem("")).toBeNull();
    expect(problem("Acmecorp")).toBe("Must be at most 5 characters");
  });

  it("closes through the popover's own close", () => {
    expect(editor(text).props.close).toBe(close);
  });
});

describe("the box for each type", () => {
  it("is a text box with the field's length for a text", () => {
    const input = inputOf(editor(field("text", { maxLength: 40 })), "ab");
    expect(input.type).toBe(Input);
    expect(input.props.variant).toBe("text");
    expect(input.props.maxLength).toBe(40);
    expect(input.props.value).toBe("ab");
    expect(input.props.autoFocus).toBe(true);
    expect(input.props["aria-label"]).toBe("The field");
  });

  it("is an address box, without a length, for an address", () => {
    const input = inputOf(editor(field("url")));
    expect(input.props.variant).toBe("url");
    expect(input.props.maxLength).toBeUndefined();
  });

  it("is a day box for a day", () => {
    expect(inputOf(editor(field("date"))).props.variant).toBe("date");
  });

  it("is a number box with the field's range, and whole steps for whole numbers", () => {
    const input = inputOf(
      editor(field("number", { integer: true, min: 0, max: 10 })),
    );
    expect(input.props.variant).toBe("number");
    expect(input.props.step).toBe(1);
    expect(input.props.min).toBe(0);
    expect(input.props.max).toBe(10);
  });

  it("allows any step, and no limit where the field has none, for other numbers", () => {
    const input = inputOf(
      editor(field("number", { integer: false, min: null, max: null })),
    );
    expect(input.props.step).toBe("any");
    expect(input.props.min).toBeUndefined();
    expect(input.props.max).toBeUndefined();
  });

  it("keeps a limit of zero, which is a limit", () => {
    const input = inputOf(
      editor(field("number", { integer: false, min: 0, max: 0 })),
    );
    expect(input.props.min).toBe(0);
    expect(input.props.max).toBe(0);
  });

  it("hands what is typed to the popover's draft", () => {
    for (const type of ["text", "url", "date"] as const) {
      const { input, setText } = drawn(editor(field(type)));
      input.props.onChange({ target: { value: "typed" } });
      expect(setText).toHaveBeenCalledWith("typed");
    }
    const { input, setText } = drawn(
      editor(field("number", { integer: false, min: null, max: null })),
    );
    input.props.onChange({ target: { value: "12" } });
    expect(setText).toHaveBeenCalledWith("12");
  });
});
