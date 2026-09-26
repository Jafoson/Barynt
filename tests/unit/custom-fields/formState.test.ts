import { describe, expect, it } from "bun:test";
import {
  configOf,
  type FieldForm,
  groupIssues,
  initialForm,
  isDirty,
  optionUid,
  TYPE_CHOICES,
  toChangeInput,
  toCreateInput,
} from "@/features/custom-fields/formState";
import type { CustomFieldRow } from "@/features/custom-fields/types";
import type { CustomFieldConfig } from "@/lib/custom-fields/types";
import { CUSTOM_FIELD_TYPES } from "@/lib/custom-fields/types";

// What the form of a custom field holds while someone types, and what it hands to the action.

function row(
  type: CustomFieldRow["type"],
  config: CustomFieldConfig,
  more: Partial<CustomFieldRow> = {},
): CustomFieldRow {
  return {
    id: "f1",
    key: "customer",
    name: "Customer",
    description: "Who asked",
    icon: null,
    type,
    config,
    position: 0,
    archived: false,
    pluginId: null,
    workspaceId: "w1",
    projectId: null,
    ...more,
  };
}

const blank = (): FieldForm => initialForm();

describe("the form for a new field", () => {
  it("starts empty, as a text field with the length a text starts from", () => {
    expect(blank()).toEqual({
      name: "",
      key: "",
      type: "text",
      description: "",
      icon: null,
      maxLength: "200",
      integer: false,
      min: "",
      max: "",
      options: [],
    });
  });

  it("offers every type there is, in the type list's order", () => {
    expect(TYPE_CHOICES).toEqual(CUSTOM_FIELD_TYPES);
  });
});

describe("the form for a field that exists", () => {
  it("takes the name, key, type and description", () => {
    const form = initialForm(row("date", {}));
    expect(form).toMatchObject({
      name: "Customer",
      key: "customer",
      type: "date",
      description: "Who asked",
    });
  });

  it("shows a text field's limit", () => {
    expect(initialForm(row("text", { maxLength: 80 })).maxLength).toBe("80");
  });

  it("shows a number field's bounds as the text of their boxes, and an open end as an empty box", () => {
    const form = initialForm(
      row("number", { integer: true, min: 0, max: null }),
    );
    expect(form.integer).toBe(true);
    expect(form.min).toBe("0");
    expect(form.max).toBe("");
  });

  it("shows a bound of zero as 0, not as an empty box", () => {
    expect(
      initialForm(row("number", { integer: false, min: 0, max: 0 })).max,
    ).toBe("0");
  });

  it("keeps each option's id, label and color, so a rename leaves the id alone", () => {
    const form = initialForm(
      row("select", {
        options: [
          { id: "prod", label: "Production", color: "#ff0000" },
          { id: "dev", label: "Development", color: null },
        ],
      }),
    );
    expect(form.options.map(({ uid: _uid, ...option }) => option)).toEqual([
      { id: "prod", label: "Production", color: "#ff0000" },
      { id: "dev", label: "Development", color: null },
    ]);
  });

  it("gives each option a row key of its own", () => {
    const form = initialForm(
      row("select", {
        options: [
          { id: "a", label: "A", color: null },
          { id: "b", label: "B", color: null },
        ],
      }),
    );
    expect(new Set(form.options.map((option) => option.uid)).size).toBe(2);
  });

  it("does not carry a type's settings over to another type", () => {
    const form = initialForm(row("url", {}));
    expect(form.maxLength).toBe("200");
    expect(form.options).toEqual([]);
    expect(form.min).toBe("");
  });

  it("makes a new row key each time", () => {
    expect(optionUid()).not.toBe(optionUid());
  });
});

describe("the icon", () => {
  it("starts as none for a new field, and is the field's own for one that exists", () => {
    expect(blank().icon).toBeNull();
    expect(
      initialForm(row("text", { maxLength: 5 }, { icon: "lucide:flag" })).icon,
    ).toBe("lucide:flag");
    expect(initialForm(row("text", { maxLength: 5 })).icon).toBeNull();
  });

  it("goes into what a new field is created with, and into a change", () => {
    const form = { ...blank(), name: "N", icon: "lucide:star" };
    expect(toCreateInput(form).icon).toBe("lucide:star");
    expect(toChangeInput(form).icon).toBe("lucide:star");
    expect(toCreateInput({ ...form, icon: null }).icon).toBeNull();
    expect(toChangeInput({ ...form, icon: null }).icon).toBeNull();
  });

  it("counts as a change of the form", () => {
    const start = initialForm(row("text", { maxLength: 5 }));
    expect(isDirty(start, { ...start, icon: "lucide:star" })).toBe(true);
    expect(isDirty({ ...start, icon: "lucide:star" }, start)).toBe(true);
    expect(isDirty(start, { ...start, icon: null })).toBe(false);
  });
});

describe("the config a form is turned into", () => {
  it("sends a text field's limit as a number", () => {
    expect(configOf({ ...blank(), maxLength: "80" })).toEqual({
      maxLength: 80,
    });
  });

  it("sends nothing for a text field whose limit box is empty: the type's own start is used", () => {
    expect(configOf({ ...blank(), maxLength: "  " })).toEqual({});
  });

  it("sends text that is not a number as NaN, for the server to refuse", () => {
    expect(configOf({ ...blank(), maxLength: "abc" })).toEqual({
      maxLength: Number.NaN,
    });
  });

  it("sends a number field's bounds, an empty box as no limit and zero as zero", () => {
    expect(
      configOf({
        ...blank(),
        type: "number",
        integer: true,
        min: "0",
        max: " ",
      }),
    ).toEqual({ integer: true, min: 0, max: null });
    expect(
      configOf({ ...blank(), type: "number", min: "-1.5", max: "0" }),
    ).toEqual({ integer: false, min: -1.5, max: 0 });
  });

  it("sends an existing option with its id and a new one without", () => {
    const form: FieldForm = {
      ...blank(),
      type: "select",
      options: [
        { uid: "u1", id: "prod", label: "Prod", color: "#00ff00" },
        { uid: "u2", id: null, label: "Staging", color: null },
      ],
    };
    expect(configOf(form)).toEqual({
      options: [
        { id: "prod", label: "Prod", color: "#00ff00" },
        { label: "Staging", color: null },
      ],
    });
  });

  it("sends nothing for the types that allow nothing more than themselves", () => {
    for (const type of ["date", "user", "url"] as const) {
      expect(configOf({ ...blank(), type })).toEqual({});
    }
  });

  it("ignores what is left in the boxes of another type", () => {
    const form: FieldForm = {
      ...blank(),
      type: "date",
      maxLength: "5",
      min: "1",
      options: [{ uid: "u1", id: null, label: "x", color: null }],
    };
    expect(configOf(form)).toEqual({});
  });
});

describe("what a new field is created with", () => {
  it("hands over the name, description, type and config", () => {
    expect(
      toCreateInput({
        ...blank(),
        name: "Customer",
        description: "Who asked",
        type: "url",
      }),
    ).toEqual({
      name: "Customer",
      key: undefined,
      description: "Who asked",
      icon: null,
      type: "url",
      config: {},
    });
  });

  it("leaves the key out when it is empty or only spaces: the server makes it of the name", () => {
    expect(toCreateInput({ ...blank(), name: "N", key: "" }).key).toBe(
      undefined,
    );
    expect(toCreateInput({ ...blank(), name: "N", key: "  " }).key).toBe(
      undefined,
    );
  });

  it("sends the key as it was typed, without the spaces around it", () => {
    expect(toCreateInput({ ...blank(), name: "N", key: " my-key " }).key).toBe(
      "my-key",
    );
  });
});

describe("what changing a field hands over", () => {
  it("is the name, description and config, and never the key or the type", () => {
    const input = toChangeInput({
      ...blank(),
      name: "Client",
      key: "client",
      type: "number",
      description: "d",
      min: "1",
    });
    expect(input).toEqual({
      name: "Client",
      description: "d",
      icon: null,
      config: { integer: false, min: 1, max: null },
    });
    expect(Object.keys(input)).not.toContain("key");
    expect(Object.keys(input)).not.toContain("type");
  });
});

describe("whether the form was changed", () => {
  it("is not, when it is the form it started as", () => {
    const start = initialForm(row("text", { maxLength: 50 }));
    expect(isDirty(start, { ...start })).toBe(false);
  });

  it("is, when a box was edited", () => {
    const start = initialForm(row("text", { maxLength: 50 }));
    expect(isDirty(start, { ...start, name: "Other" })).toBe(true);
    expect(isDirty(start, { ...start, maxLength: "51" })).toBe(true);
  });

  it("is not, when it was changed and put back", () => {
    const start = initialForm(row("text", { maxLength: 50 }));
    const edited = { ...start, name: "Other" };
    expect(isDirty(start, { ...edited, name: start.name })).toBe(false);
  });

  it("does not count the row keys of the options, only what they say", () => {
    const start = initialForm(
      row("select", { options: [{ id: "a", label: "A", color: null }] }),
    );
    const same = {
      ...start,
      options: start.options.map((option) => ({ ...option, uid: "other" })),
    };
    expect(isDirty(start, same)).toBe(false);
  });

  it("is, when an option was added, renamed or taken away", () => {
    const start = initialForm(
      row("select", { options: [{ id: "a", label: "A", color: null }] }),
    );
    const [first] = start.options;
    expect(
      isDirty(start, {
        ...start,
        options: [
          ...start.options,
          { uid: "n", id: null, label: "", color: null },
        ],
      }),
    ).toBe(true);
    expect(
      isDirty(start, { ...start, options: [{ ...first, label: "AA" }] }),
    ).toBe(true);
    expect(isDirty(start, { ...start, options: [] })).toBe(true);
  });

  it("is, when only the order of the options changed", () => {
    const start = initialForm(
      row("select", {
        options: [
          { id: "a", label: "A", color: null },
          { id: "b", label: "B", color: null },
        ],
      }),
    );
    expect(
      isDirty(start, { ...start, options: [...start.options].reverse() }),
    ).toBe(true);
  });
});

describe("the problems the server names", () => {
  it("are grouped by the part of the form they belong to", () => {
    expect(
      groupIssues([
        { path: "name", message: "is required" },
        { path: "config", message: "needs an option" },
      ]),
    ).toEqual({ name: "Is required", config: "Needs an option" });
  });

  it("keeps the first problem of a part", () => {
    expect(
      groupIssues([
        { path: "name", message: "is required" },
        { path: "name", message: "is too long" },
      ]),
    ).toEqual({ name: "Is required" });
  });

  it("is empty for none, or for a reply without any", () => {
    expect(groupIssues([])).toEqual({});
    expect(groupIssues(undefined)).toEqual({});
  });

  it("does not take a part named like something every object has for one that was seen", () => {
    expect(groupIssues([{ path: "constructor", message: "is odd" }])).toEqual({
      constructor: "Is odd",
    });
  });
});
