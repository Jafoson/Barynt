import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// The custom fields on a board card or a list row: each answer with the field's name before it, in the
// order given, nothing for an issue with no answer, one layout for a card and one for a row.

mock.module("next-intl", () => {
  const t = (key: string) => key;
  return {
    useTranslations: () => t,
    useFormatter: () => ({
      number: (n: number) => `n:${n}`,
      dateTime: () => "d",
    }),
  };
});
mock.module("@iconify/react", () => ({
  Icon: ({ icon, ...rest }: { icon: string; "aria-label"?: string }) => (
    <span role="img" data-icon={icon} aria-label={rest["aria-label"]} />
  ),
}));
mock.module("@/components/ui/atoms/Avatar/Avatar", () => ({
  Avatar: () => <i />,
}));

import { CardFieldValues } from "@/features/custom-fields/components/CardFieldValues/CardFieldValues";
import type { CustomFieldRow } from "@/features/custom-fields/types";
import type { User } from "@/types";

function field(
  id: string,
  type: CustomFieldRow["type"] = "text",
  name = `Field ${id}`,
): CustomFieldRow {
  return {
    id,
    key: id,
    name,
    description: "",
    icon: null,
    type,
    config: type === "number" ? { integer: false, min: null, max: null } : {},
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

const render = (
  entries: React.ComponentProps<typeof CardFieldValues>["entries"],
  layout: "card" | "row" = "card",
) =>
  renderToStaticMarkup(
    <CardFieldValues entries={entries} members={members} layout={layout} />,
  );

describe("the custom fields on a card or a row", () => {
  it("draws nothing for an issue with no answer to a shown field", () => {
    expect(render([])).toBe("");
  });

  it("draws each answer with the field's name before it, in the order given", () => {
    const html = render([
      { field: field("b", "text", "Customer"), value: "Acme" },
      { field: field("a", "number", "Effort"), value: 5 },
    ]);
    expect(html).toContain(
      '<span class="name">Customer</span><span class="text">Acme</span>',
    );
    expect(html.indexOf("Customer")).toBeLessThan(html.indexOf("Acme"));
    expect(html.indexOf("Acme")).toBeLessThan(html.indexOf("Effort"));
    expect(html).toContain("n:5");
    expect(html.match(/<li /g)).toHaveLength(2);
  });

  it("draws the field's icon instead of its name when it has one", () => {
    const html = render([
      {
        field: { ...field("a", "text", "Customer"), icon: "lucide:building-2" },
        value: "Acme",
      },
    ]);
    expect(html).toContain('data-icon="lucide:building-2"');
    expect(html).toContain('aria-label="Customer"');
    expect(html).not.toContain('class="name"');
    // Still named, for the hover and for a screen reader.
    expect(html).toContain('title="Customer"');
    expect(html).toContain("Acme");
  });

  it("draws the name of a field without an icon, and no icon", () => {
    const html = render([
      { field: field("a", "text", "Customer"), value: "Acme" },
    ]);
    expect(html).toContain('class="name"');
    expect(html).not.toContain("data-icon");
  });

  it("names the field in the hover text of each item", () => {
    const html = render([
      { field: field("a", "text", "Customer"), value: "Acme" },
    ]);
    expect(html).toContain('title="Customer"');
  });

  it("shows a person by name", () => {
    const html = render([{ field: field("a", "user", "Owner"), value: "u1" }]);
    expect(html).toContain("Ada Lovelace");
  });

  it("wraps on a card and stays on one line in a row", () => {
    const entries = [{ field: field("a"), value: "x" }];
    expect(render(entries, "card")).toContain('class="list card"');
    expect(render(entries, "row")).toContain('class="list row"');
  });

  it("is a list, so a screen reader hears how many there are", () => {
    const html = render([{ field: field("a"), value: "x" }]);
    expect(html.startsWith("<ul")).toBe(true);
  });

  it("does not make an address a link: the card opens the issue", () => {
    const html = render([
      { field: field("a", "url", "Ticket"), value: "https://example.com" },
    ]);
    expect(html).toContain("https://example.com");
    expect(html).not.toContain("<a ");
  });
});
