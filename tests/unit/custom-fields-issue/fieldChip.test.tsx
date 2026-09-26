import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactElement } from "react";

// A custom field as a chip of the composer's row: its name until it has an answer, then the answer, on,
// with a way to clear it, and the detail view's own editor when it opens. It describes the chip and draws
// nothing (the row does), so it is called as a function and what it returns is read.

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

import { fieldChipItem } from "@/features/custom-fields/components/FieldChip/FieldChip";
import { FieldEditor } from "@/features/custom-fields/components/FieldEditor/FieldEditor";
import type { CustomFieldRow } from "@/features/custom-fields/types";
import type { CustomFieldConfig, FieldValue } from "@/lib/custom-fields/types";
import type { User } from "@/types";

// biome-ignore lint/suspicious/noExplicitAny: the props of whichever element the editor returned
type Node = ReactElement<Record<string, any>>;

function field(
  type: CustomFieldRow["type"],
  config: CustomFieldConfig = {},
  more: Partial<CustomFieldRow> = {},
): CustomFieldRow {
  return {
    id: "cf-1",
    key: "k",
    name: "Customer",
    description: "",
    icon: null,
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
  { id: "u1", firstName: "Ada", lastName: "Lovelace", color: "#111" },
] as User[];
const format = {
  number: (n: number) => `n:${n}`,
  day: (d: Date) => `d:${d.toISOString()}`,
};
const onChange = mock();
beforeEach(() => onChange.mockReset());

const chip = (f: CustomFieldRow, value: FieldValue | null = null) =>
  fieldChipItem(f, value, members, format, onChange);

describe("a custom field as a chip of the composer's row", () => {
  it("is known by the field's id, apart from the built-in chips, and named after the field", () => {
    const item = chip(field("date"));
    expect(item.id).toBe("custom:cf-1");
    expect(item.name).toBe("Customer");
  });

  it("has the icon of its type unless it was given one", () => {
    expect((chip(field("date")).icon as Node).props.icon).toBe(
      "lucide:calendar",
    );
    expect(
      (chip(field("date", {}, { icon: "lucide:flag" })).icon as Node).props
        .icon,
    ).toBe("lucide:flag");
    expect(
      (chip(field("date", {}, { icon: "lucide:gone" })).icon as Node).props
        .icon,
    ).toBe("lucide:calendar");
  });

  it("reads as the field's name, and is not on, while there is no answer", () => {
    const item = chip(field("text", { maxLength: 9 }));
    expect(item.label).toBe("Customer");
    expect(item.active).toBe(false);
  });

  it("reads as the answer, and is on, once there is one", () => {
    const item = chip(field("text", { maxLength: 9 }), "Acme");
    expect(item.label).toBe("Acme");
    expect(item.active).toBe(true);
  });

  it("reads a zero as an answer", () => {
    const item = chip(
      field("number", { integer: false, min: null, max: null }),
      0,
    );
    expect(item.label).toBe("n:0");
    expect(item.active).toBe(true);
  });

  it("reads a day in the reader's format, a person by name", () => {
    expect(chip(field("date"), "2026-09-26").label).toBe(
      "d:2026-09-26T12:00:00.000Z",
    );
    expect(chip(field("user"), "u1").label).toBe("Ada Lovelace");
  });

  it("clears the answer with its button", () => {
    chip(field("text", { maxLength: 9 }), "Acme").onClear?.();
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("is narrower for a person's list than for the rest", () => {
    expect(chip(field("user")).width).toBe(220);
    expect(chip(field("text", { maxLength: 9 })).width).toBe(240);
    expect(chip(field("select", { options: [] })).width).toBe(240);
    expect(chip(field("user")).maxWidth).toBe(320);
  });

  it("opens the editor of the detail view, with the answer, the members and a way to save", () => {
    const f = field("text", { maxLength: 9 });
    const close = mock();
    const body = chip(f, "Acme").children(close) as Node;
    expect(body.type).toBe(FieldEditor);
    expect(body.props.field).toBe(f);
    expect(body.props.value).toBe("Acme");
    expect(body.props.members).toBe(members);
    expect(body.props.close).toBe(close);
    body.props.onSave("Globex");
    expect(onChange).toHaveBeenCalledWith("Globex");
  });
});
