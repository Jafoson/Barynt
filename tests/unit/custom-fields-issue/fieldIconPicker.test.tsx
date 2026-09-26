import { describe, expect, it, mock } from "bun:test";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The icons a custom field can have, as a grid: the type's own first, then the list; one is on at a time,
// and choosing the one that is on takes it off.

mock.module("next-intl", () => {
  const t = (key: string) => key;
  return { useTranslations: () => t };
});
mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));

import { FieldIconPicker } from "@/features/custom-fields/components/FieldIconPicker/FieldIconPicker";
import { CUSTOM_FIELD_ICONS } from "@/lib/custom-fields/icons";

// biome-ignore lint/suspicious/noExplicitAny: the props of whichever element the picker returned
type Node = ReactElement<Record<string, any>>;

function elements(node: unknown, into: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, into);
  } else if (node && typeof node === "object" && "props" in node) {
    const element = node as Node;
    into.push(element);
    elements(element.props.children, into);
  }
  return into;
}

const onChange = mock();
const tree = (
  value: string | null,
  type: "text" | "date" = "text",
  disabled = false,
) => FieldIconPicker({ value, type, onChange, disabled }) as Node;
const cells = (node: Node) => elements(node).filter((e) => e.type === "button");

describe("the icon picker", () => {
  it("offers the type's icon first, then every icon of the list", () => {
    const html = renderToStaticMarkup(
      <FieldIconPicker value={null} type="text" onChange={() => {}} />,
    );
    const icons = [...html.matchAll(/data-icon="([^"]+)"/g)].map((m) => m[1]);
    expect(icons).toEqual(["lucide:type", ...CUSTOM_FIELD_ICONS]);
  });

  it("takes the type's icon from the type", () => {
    const html = renderToStaticMarkup(
      <FieldIconPicker value={null} type="date" onChange={() => {}} />,
    );
    expect(html).toContain('data-icon="lucide:calendar"');
    expect(html).not.toContain('data-icon="lucide:type"');
  });

  it("has a title for its choices", () => {
    const html = renderToStaticMarkup(
      <FieldIconPicker value={null} type="text" onChange={() => {}} />,
    );
    expect(html).toContain("customFields.icon");
  });

  it("marks the type's icon while none is chosen, and only the chosen one otherwise", () => {
    const pressed = (node: Node) =>
      cells(node).map((c) => c.props["aria-pressed"]);
    expect(pressed(tree(null)).filter(Boolean)).toHaveLength(1);
    expect(pressed(tree(null))[0]).toBe(true);
    const chosen = pressed(tree("lucide:flag"));
    expect(chosen.filter(Boolean)).toHaveLength(1);
    expect(chosen[0]).toBe(false);
    expect(chosen[1 + CUSTOM_FIELD_ICONS.indexOf("lucide:flag")]).toBe(true);
  });

  it("chooses an icon, and the type's icon means none", () => {
    onChange.mockReset();
    const buttons = cells(tree(null));
    buttons[1].props.onClick();
    expect(onChange).toHaveBeenLastCalledWith(CUSTOM_FIELD_ICONS[0]);
    buttons[0].props.onClick();
    expect(onChange).toHaveBeenLastCalledWith(null);
  });

  it("takes the chosen icon off when it is chosen again, and changes to another otherwise", () => {
    onChange.mockReset();
    const index = 1 + CUSTOM_FIELD_ICONS.indexOf("lucide:flag");
    cells(tree("lucide:flag"))[index].props.onClick();
    expect(onChange).toHaveBeenLastCalledWith(null);
    cells(tree("lucide:star"))[index].props.onClick();
    expect(onChange).toHaveBeenLastCalledWith("lucide:flag");
  });

  it("does not submit the form it sits in", () => {
    for (const button of cells(tree(null))) {
      expect(button.props.type).toBe("button");
    }
  });

  it("is off as a whole while disabled", () => {
    const fieldset = elements(tree(null, "text", true)).find(
      (e) => e.type === "fieldset",
    );
    expect(fieldset?.props.disabled).toBe(true);
  });

  it("names each choice for a screen reader", () => {
    const labelled = cells(tree(null)).map((c) => c.props["aria-label"]);
    expect(labelled[0]).toBe("customFields.iconOfType");
    expect(labelled[1]).toBe(CUSTOM_FIELD_ICONS[0].replace("lucide:", ""));
  });
});
