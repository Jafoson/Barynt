import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactElement, ReactNode } from "react";

// The custom fields on an issue's detail view. What matters: an issue with no fields shows nothing,
// the sidebar gets bare rows and the main column a section of its own, each row is the field's name
// and its answer, only whoever may edit the issue gets a way to change it (and everyone else gets an
// address as a link), a change is its own request whose refusal shows beside its own row and goes
// with the next one that works, and the row is off while its request runs. No DOM: the hooks are
// small stand-ins that keep their state in a list, and each row is called as a function. Own
// process: it replaces `react`'s hooks.

const actualReact = await import("react");
const hooks = {
  slots: [] as unknown[],
  cursor: 0,
  pending: false,
  started: [] as Promise<unknown>[],
};
mock.module("react", () => ({
  ...actualReact,
  default: actualReact,
  useState: (initial: unknown) => {
    const at = hooks.cursor++;
    if (!(at in hooks.slots)) {
      hooks.slots[at] =
        typeof initial === "function" ? (initial as () => unknown)() : initial;
    }
    const set = (next: unknown) => {
      hooks.slots[at] =
        typeof next === "function"
          ? (next as (current: unknown) => unknown)(hooks.slots[at])
          : next;
    };
    return [hooks.slots[at], set];
  },
  useTransition: () => [
    hooks.pending,
    (callback: () => Promise<unknown>) => {
      hooks.started.push(Promise.resolve(callback()));
    },
  ],
}));
mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));
mock.module("next-intl", () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key;
  return { useTranslations: () => t, useFormatter: () => ({}) };
});
mock.module("@/components/ui/atoms/Avatar/Avatar", () => ({
  Avatar: () => <i />,
}));

import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { FieldEditor } from "@/features/custom-fields/components/FieldEditor/FieldEditor";
import { FieldValueView } from "@/features/custom-fields/components/FieldValueView/FieldValueView";
import type {
  CustomFieldRow,
  FieldValueResult,
  IssueFieldEntry,
} from "@/features/custom-fields/types";
import { IssueCustomFields } from "@/features/issues/components/IssueDetail/components/IssueCustomFields";
import type { CustomFieldConfig, FieldValue } from "@/lib/custom-fields/types";
import type { IssueDetail, User } from "@/types";

// biome-ignore lint/suspicious/noExplicitAny: the props of whatever component the tree holds
type Node = ReactElement<Record<string, any>>;

function field(
  id: string,
  type: CustomFieldRow["type"] = "text",
  config: CustomFieldConfig = { maxLength: 200 },
  more: Partial<CustomFieldRow> = {},
): CustomFieldRow {
  return {
    id,
    key: `key-${id}`,
    name: `Field ${id}`,
    description: "",
    type,
    config,
    position: 0,
    archived: false,
    pluginId: null,
    workspaceId: "w",
    projectId: null,
    ...more,
  };
}

const members = [
  { id: "u1", firstName: "Ada", lastName: "L", color: "#000" },
] as User[];
const onField = mock(
  async (_id: string, _value: unknown): Promise<FieldValueResult> => ({
    ok: true,
    changed: true,
  }),
);

let entries: IssueFieldEntry[] = [];
let canEdit = true;
let layout: "aside" | "column" = "aside";

const issue = (): IssueDetail =>
  ({
    customFields: entries,
    access: { canEdit },
  }) as unknown as IssueDetail;

function tree(): ReactNode {
  return IssueCustomFields({ issue: issue(), members, layout, onField });
}

function elements(node: ReactNode, into: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, into);
  } else if (node && typeof node === "object" && "props" in node) {
    const element = node as Node;
    into.push(element);
    elements(element.props.children as ReactNode, into);
  }
  return into;
}

/** The rows the section made, as elements of the row component. */
const rowElements = () =>
  elements(tree()).filter(
    (e) => typeof e.type === "function" && e.type.name === "FieldRow",
  );
/** One row, called as a function so its hooks run against the stand-ins. */
function renderRow(index = 0): Node {
  const el = rowElements()[index];
  hooks.cursor = 0;
  return (el.type as (props: unknown) => ReactNode)(el.props) as Node;
}
const settled = async () => {
  while (hooks.started.length > 0) await Promise.all(hooks.started.splice(0));
};
const alertOf = (row: Node) =>
  elements(row).find((e) => e.props.role === "alert")?.props.children;

beforeEach(() => {
  hooks.slots = [];
  hooks.cursor = 0;
  hooks.pending = false;
  hooks.started = [];
  entries = [{ field: field("a"), value: "Acme" }];
  canEdit = true;
  layout = "aside";
  onField.mockReset();
  onField.mockResolvedValue({ ok: true, changed: true });
});

describe("the section", () => {
  it("shows nothing for an issue without fields, in either layout", () => {
    entries = [];
    expect(tree()).toBeNull();
    layout = "column";
    expect(tree()).toBeNull();
  });

  it("is bare rows in the sidebar, one per field in the fields' order", () => {
    entries = [
      { field: field("b"), value: null },
      { field: field("a"), value: "x" },
    ];
    const all = elements(tree());
    expect(all.some((e) => e.type === "section")).toBe(false);
    expect(rowElements().map((e) => e.props.entry.field.id)).toEqual([
      "b",
      "a",
    ]);
    // A row is known by its field, so a change in the list keeps each row's own state.
    expect(rowElements().map((e) => e.key)).toEqual(["b", "a"]);
  });

  it("is a section with a header of its own in the main column", () => {
    layout = "column";
    const all = elements(tree());
    expect(all.find((e) => e.type === "section")).toBeDefined();
    expect(all.find((e) => e.type === "h3")?.props.children).toBe(
      "customFields.title",
    );
    expect(rowElements()).toHaveLength(1);
  });

  it("hands each row who may edit, the members and the way to set a field", () => {
    const props = rowElements()[0].props;
    expect(props.canEdit).toBe(true);
    expect(props.members).toBe(members);
    expect(props.onField).toBe(onField);
    canEdit = false;
    expect(rowElements()[0].props.canEdit).toBe(false);
  });
});

describe("a row", () => {
  it("has the field's name, and its description for whoever hovers", () => {
    entries = [
      {
        field: field(
          "a",
          "text",
          { maxLength: 9 },
          { description: "Who asked" },
        ),
        value: null,
      },
    ];
    const label = elements(renderRow()).find(
      (e) => e.type === "span" && e.props.title,
    );
    expect(label?.props.title).toBe("Who asked");
    expect(label?.props.children).toBe("Field a");
  });

  it("has no hover text when the field has no description", () => {
    const spans = elements(renderRow()).filter((e) => e.type === "span");
    expect(spans[0].props.title).toBeUndefined();
  });

  it("shows the answer and offers a way to change it to whoever may edit", () => {
    const row = renderRow();
    const picker = elements(row).find((e) => e.type === InlinePicker);
    expect(picker).toBeDefined();
    const trigger = picker?.props.trigger as Node;
    expect(trigger.type).toBe("button");
    expect(trigger.props["data-field-nav"]).toBe(true);
    const view = elements(trigger).find((e) => e.type === FieldValueView);
    expect(view?.props.value).toBe("Acme");
    expect(view?.props.link).toBeUndefined();
    expect(picker?.props.title).toBe("Field a");
    expect(picker?.props.stop).toBe(true);
  });

  it("makes the popover for a person's list narrower than the one for a typed answer or a choice", () => {
    const widthOf = (type: CustomFieldRow["type"]) => {
      entries = [{ field: field("a", type, {}), value: null }];
      return elements(renderRow()).find((e) => e.type === InlinePicker)?.props
        .width;
    };
    expect(widthOf("user")).toBe(220);
    expect(widthOf("text")).toBe(240);
    expect(widthOf("select")).toBe(240);
  });

  it("puts the editor in the popover, with the answer and the way to save it", async () => {
    const picker = elements(renderRow()).find((e) => e.type === InlinePicker);
    const close = mock();
    const body = (picker?.props.children as (c: () => void) => Node)(close);
    expect(body.type).toBe(FieldEditor);
    expect(body.props.value).toBe("Acme");
    expect(body.props.members).toBe(members);
    expect(body.props.close).toBe(close);
  });

  it("shows only the answer, and an address as a link, to whoever may not edit", () => {
    canEdit = false;
    entries = [{ field: field("a", "url", {}), value: "https://example.com" }];
    const row = renderRow();
    const all = elements(row);
    expect(all.some((e) => e.type === InlinePicker)).toBe(false);
    expect(all.some((e) => e.type === "button")).toBe(false);
    expect(all.find((e) => e.type === FieldValueView)?.props.link).toBe(true);
  });

  it("turns the button off while its request runs", () => {
    hooks.pending = true;
    const picker = elements(renderRow()).find((e) => e.type === InlinePicker);
    expect((picker?.props.trigger as Node).props.disabled).toBe(true);
    hooks.pending = false;
    const idle = elements(renderRow()).find((e) => e.type === InlinePicker);
    expect((idle?.props.trigger as Node).props.disabled).toBe(false);
  });
});

describe("an address", () => {
  beforeEach(() => {
    entries = [
      { field: field("a", "url", {}), value: "https://example.com/x" },
    ];
  });

  it("gets a link beside it that opens in a new tab, named after the field", () => {
    const link = elements(renderRow()).find((e) => e.type === "a");
    expect(link?.props.href).toBe("https://example.com/x");
    expect(link?.props.target).toBe("_blank");
    expect(link?.props.rel).toBe("noopener noreferrer");
    expect(link?.props["aria-label"]).toBe("customFields.openLink:Field a");
  });

  it("has no link while there is no address", () => {
    entries = [{ field: field("a", "url", {}), value: null }];
    expect(elements(renderRow()).some((e) => e.type === "a")).toBe(false);
  });

  it("has no link for a field that is no address", () => {
    entries = [{ field: field("a", "text"), value: "https://example.com" }];
    expect(elements(renderRow()).some((e) => e.type === "a")).toBe(false);
  });
});

describe("changing an answer", () => {
  const save = async (value: FieldValue | null) => {
    const picker = elements(renderRow()).find((e) => e.type === InlinePicker);
    const body = (picker?.props.children as (c: () => void) => Node)(() => {});
    (body.props.onSave as (v: FieldValue | null) => void)(value);
    await settled();
  };

  it("sends the field and the answer as its own request", async () => {
    await save("Globex");
    expect(onField).toHaveBeenCalledTimes(1);
    expect(onField).toHaveBeenCalledWith("a", "Globex");
  });

  it("sends null to clear", async () => {
    await save(null);
    expect(onField).toHaveBeenCalledWith("a", null);
  });

  it("shows nothing when it went through", async () => {
    await save("Globex");
    expect(alertOf(renderRow())).toBeUndefined();
  });

  it("shows the refusal beside its own row", async () => {
    onField.mockResolvedValue({
      error: "Field a must be at most 200 characters.",
    });
    await save("x");
    expect(alertOf(renderRow())).toBe(
      "Field a must be at most 200 characters.",
    );
  });

  it("takes the refusal away with the next change that works", async () => {
    onField.mockResolvedValueOnce({ error: "No." });
    await save("x");
    expect(alertOf(renderRow())).toBe("No.");
    await save("y");
    expect(alertOf(renderRow())).toBeUndefined();
  });

  it("treats a change that changed nothing as one that went through", async () => {
    onField.mockResolvedValue({ ok: true, changed: false });
    await save("Acme");
    expect(alertOf(renderRow())).toBeUndefined();
  });
});
