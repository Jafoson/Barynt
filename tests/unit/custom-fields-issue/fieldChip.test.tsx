import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactElement } from "react";

// A custom field as a chip in the composer's toolbar: its name until it has an answer, then the answer,
// highlighted, with a way to clear it, and the detail view's own editor when it opens. It uses no hooks
// but the formatter, so it is called as a function and its tree is read.

mock.module("next-intl", () => {
  const t = (key: string) => key;
  return {
    useTranslations: () => t,
    useFormatter: () => ({
      number: (n: number) => `n:${n}`,
      dateTime: (d: Date, o: { timeZone?: string }) =>
        `d:${d.toISOString()}:${o.timeZone}`,
    }),
  };
});
mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));
mock.module("@/components/ui/atoms/Avatar/Avatar", () => ({
  Avatar: () => <i />,
}));

import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";
import { FieldChip } from "@/features/custom-fields/components/FieldChip/FieldChip";
import { FieldEditor } from "@/features/custom-fields/components/FieldEditor/FieldEditor";
import type { CustomFieldRow } from "@/features/custom-fields/types";
import type { CustomFieldConfig, FieldValue } from "@/lib/custom-fields/types";
import type { User } from "@/types";

// biome-ignore lint/suspicious/noExplicitAny: the props of whichever component the chip returned
type Node = ReactElement<Record<string, any>>;

function field(
  type: CustomFieldRow["type"],
  config: CustomFieldConfig = {},
): CustomFieldRow {
  return {
    id: "cf-1",
    key: "k",
    name: "Customer",
    description: "",
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
  { id: "u1", firstName: "Ada", lastName: "Lovelace", color: "#111" },
] as User[];
const onChange = mock();
beforeEach(() => onChange.mockReset());

const chip = (f: CustomFieldRow, value: FieldValue | null = null): Node =>
  FieldChip({ field: f, value, members, onChange }) as Node;

describe("the chip", () => {
  it("is a filter chip named after the field, with the type's icon", () => {
    const tree = chip(field("date"));
    expect(tree.type).toBe(FilterChip);
    expect(tree.props.name).toBe("Customer");
    expect(tree.props.icon.props.icon).toBe("lucide:calendar");
    expect(tree.props["data-field-nav"]).toBe(true);
  });

  it("reads as the field's name, and not highlighted, while there is no answer", () => {
    const tree = chip(field("text", { maxLength: 9 }));
    expect(tree.props.label).toBe("Customer");
    expect(tree.props.active).toBe(false);
  });

  it("reads as the answer, highlighted, once there is one", () => {
    const tree = chip(field("text", { maxLength: 9 }), "Acme");
    expect(tree.props.label).toBe("Acme");
    expect(tree.props.active).toBe(true);
  });

  it("reads a zero as an answer", () => {
    const tree = chip(
      field("number", { integer: false, min: null, max: null }),
      0,
    );
    expect(tree.props.label).toBe("n:0");
    expect(tree.props.active).toBe(true);
  });

  it("reads a day in the reader's format, in UTC, a person by name", () => {
    expect(chip(field("date"), "2026-09-26").props.label).toBe(
      "d:2026-09-26T12:00:00.000Z:UTC",
    );
    expect(chip(field("user"), "u1").props.label).toBe("Ada Lovelace");
  });

  it("clears the answer with its button", () => {
    chip(field("text", { maxLength: 9 }), "Acme").props.onClear();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("is narrower for a person's list than for the rest", () => {
    expect(chip(field("user")).props.width).toBe(220);
    expect(chip(field("text", { maxLength: 9 })).props.width).toBe(240);
    expect(chip(field("select", { options: [] })).props.width).toBe(240);
    expect(chip(field("user")).props.maxWidth).toBe(320);
  });

  it("opens the editor of the detail view, with the answer, the members and a way to save", () => {
    const f = field("text", { maxLength: 9 });
    const close = mock();
    const body = (chip(f, "Acme").props.children as (c: () => void) => Node)(
      close,
    );
    expect(body.type).toBe(FieldEditor);
    expect(body.props.field).toBe(f);
    expect(body.props.value).toBe("Acme");
    expect(body.props.members).toBe(members);
    expect(body.props.close).toBe(close);
    body.props.onSave("Globex");
    expect(onChange).toHaveBeenCalledWith("Globex");
  });
});
