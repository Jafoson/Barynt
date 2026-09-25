import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// One answer to a custom field, as text. What matters: no answer says so quietly, a number and a
// day come out in the reader's format (a day never slips to another one with the reader's time
// zone), a choice shows its label and its color, a person their face and name (and a person who is
// no longer there is said to be gone, not shown as an id), an address is a link only where it may be
// one, and a value the field does not know is shown as it is rather than as nothing.

mock.module("next-intl", () => {
  const t = (key: string) => key;
  return {
    useTranslations: () => t,
    useFormatter: () => ({
      number: (n: number) => `n:${n}`,
      dateTime: (d: Date, o: { timeZone?: string; dateStyle?: string }) =>
        `d:${d.toISOString()}:${o.timeZone}:${o.dateStyle}`,
    }),
  };
});
mock.module("@/components/ui/atoms/Avatar/Avatar", () => ({
  Avatar: ({ avatar }: { avatar: { firstName: string } | null }) => (
    <i data-avatar={avatar?.firstName ?? ""} />
  ),
}));

import { FieldValueView } from "@/features/custom-fields/components/FieldValueView/FieldValueView";
import type { CustomFieldRow } from "@/features/custom-fields/types";
import type { CustomFieldConfig, FieldValue } from "@/lib/custom-fields/types";
import type { User } from "@/types";

function field(
  type: CustomFieldRow["type"],
  config: CustomFieldConfig = {},
): CustomFieldRow {
  return {
    id: "cf-1",
    key: "k",
    name: "K",
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

const ada = {
  id: "u-ada",
  firstName: "Ada",
  lastName: "Lovelace",
  color: "#123456",
} as User;

const render = (
  f: CustomFieldRow,
  value: FieldValue | null,
  more: { members?: User[]; link?: boolean } = {},
) =>
  renderToStaticMarkup(
    <FieldValueView
      field={f}
      value={value}
      members={more.members ?? [ada]}
      link={more.link}
    />,
  );

describe("no answer", () => {
  it("says so, quietly, for every type", () => {
    for (const type of [
      "text",
      "number",
      "select",
      "date",
      "user",
      "url",
    ] as const) {
      const html = render(field(type), null);
      expect(html).toContain("customFields.notSet");
      expect(html).toContain('class="unset"');
    }
  });
});

describe("a text, a number and a day", () => {
  it("shows a text as it is", () => {
    expect(render(field("text"), "Acme")).toBe(
      '<span class="text">Acme</span>',
    );
  });

  it("escapes what is in a text", () => {
    expect(render(field("text"), "<b>x</b>")).toContain("&lt;b&gt;x&lt;/b&gt;");
  });

  it("shows a number in the reader's format, zero included", () => {
    expect(render(field("number"), 1234.5)).toContain("n:1234.5");
    expect(render(field("number"), 0)).toContain("n:0");
  });

  it("shows a day as a medium date at noon UTC, read in UTC, so it never slips", () => {
    expect(render(field("date"), "2026-09-26")).toContain(
      "d:2026-09-26T12:00:00.000Z:UTC:medium",
    );
  });
});

describe("an address", () => {
  it("is plain text by default, because the value may sit inside a button", () => {
    const html = render(field("url"), "https://example.com/a");
    expect(html).toBe('<span class="text">https://example.com/a</span>');
    expect(html).not.toContain("<a");
  });

  it("is a link that opens in a new tab without handing over the page, where it may be one", () => {
    const html = render(field("url"), "https://example.com/a", { link: true });
    expect(html).toContain('<a class="text link"');
    expect(html).toContain('href="https://example.com/a"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
});

describe("a choice", () => {
  const choice = field("select", {
    options: [
      { id: "prod", label: "Production", color: "#ff0000" },
      { id: "dev", label: "Development", color: null },
    ],
  });

  it("shows the option's label and its color", () => {
    const html = render(choice, "prod");
    expect(html).toContain("Production");
    expect(html).toContain("--option-color:#ff0000");
  });

  it("shows no dot for an option without a color", () => {
    const html = render(choice, "dev");
    expect(html).toContain("Development");
    expect(html).not.toContain("dot");
  });

  it("shows the stored id for an option that is no longer there, not nothing", () => {
    const html = render(choice, "gone");
    expect(html).toContain(">gone<");
    expect(html).not.toContain("dot");
  });
});

describe("a person", () => {
  it("shows their face and their name", () => {
    const html = render(field("user"), "u-ada");
    expect(html).toContain('data-avatar="Ada"');
    expect(html).toContain("Ada Lovelace");
  });

  it("says a person who is not in the list is gone, and does not show their id", () => {
    const html = render(field("user"), "u-someone");
    expect(html).toContain("customFields.unknownPerson");
    expect(html).not.toContain("u-someone");
    expect(html).not.toContain("data-avatar");
  });
});
