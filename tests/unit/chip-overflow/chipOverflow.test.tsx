import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactElement, ReactNode } from "react";

// A row of field chips that stays one line: as many as fit, then a "more" button whose dropdown lists the
// rest as rows; a row opens its field inside the dropdown, with a way back. What matters: while the widths
// are measured every chip is in the row and the button is out of the flow, afterwards only what fits is in
// the row and the rest is in the menu, the button is on only while something is behind it, a chip is
// drawn from its description and nothing else, and the menu goes list → field → list. No DOM: `useRowFit`
// answers what the test says fits, and `useState` keeps its value in a list. Own process: it replaces
// `react`'s hooks.

const actualReact = await import("react");
const hooks = { slots: [] as unknown[], cursor: 0 };
mock.module("react", () => ({
  ...actualReact,
  default: actualReact,
  // Runs at once, like the first commit would: what an effect sets is what the next render sees.
  useEffect: (effect: () => void) => {
    effect();
  },
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
}));
// The frame comes at once: what it sets is what the next render sees.
globalThis.requestAnimationFrame = (callback: FrameRequestCallback) => {
  callback(0);
  return 1;
};
globalThis.cancelAnimationFrame = () => {};

mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));

const rowFit = { fit: null as number | null, calls: [] as [number, string][] };
mock.module("@/lib/utils/useRowFit", () => ({
  useRowFit: (count: number, key: string) => {
    rowFit.calls.push([count, key]);
    return { ref: () => {}, fit: rowFit.fit };
  },
}));

import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import {
  ChipOverflow,
  type OverflowChip,
} from "@/components/ui/layout/ChipOverflow/ChipOverflow";
import { FilterChip } from "@/components/ui/layout/FilterChip/FilterChip";

// biome-ignore lint/suspicious/noExplicitAny: the props of whatever element the tree holds
type Node = ReactElement<Record<string, any>>;

function item(id: string, more: Partial<OverflowChip> = {}): OverflowChip {
  return {
    id,
    name: `Name ${id}`,
    label: `Label ${id}`,
    icon: <i data-icon={`icon-${id}`} />,
    active: false,
    children: (close) => (
      <button type="button" data-body={id} onClick={close} />
    ),
    ...more,
  };
}

let items: OverflowChip[] = [];

function render(): Node {
  hooks.cursor = 0;
  return ChipOverflow({
    items,
    moreLabel: "More",
    backLabel: "Back",
  }) as Node;
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

const chips = () => elements(render()).filter((e) => e.type === FilterChip);
const morePicker = () =>
  elements(render()).find((e) => e.type === InlinePicker);
/** The menu the dropdown holds, called as a function so its own state runs against the stand-ins. */
const menu = (close = mock()): Node => {
  const element = (morePicker()?.props.children as (c: () => void) => Node)(
    close,
  );
  // The menu is a component of its own: its state lives in a slot apart from the row's.
  hooks.cursor = 100;
  return (element.type as (props: unknown) => ReactNode)(element.props) as Node;
};

beforeEach(() => {
  hooks.slots = [];
  hooks.cursor = 0;
  rowFit.fit = null;
  rowFit.calls = [];
  items = [item("a"), item("b"), item("c"), item("d"), item("e")];
});

describe("while the widths are measured", () => {
  it("has every chip in the row", () => {
    expect(chips().map((c) => c.props.name)).toEqual(items.map((i) => i.name));
  });

  it("has the more button in the row too, out of the flow, so it can be measured", () => {
    const probe = elements(render()).find(
      (e) => e.type === "span" && e.props.className === "probe",
    );
    expect(probe).toBeDefined();
    expect(elements(probe).some((e) => e.type === InlinePicker)).toBe(true);
  });

  it("shows nothing in the menu yet", () => {
    expect(menu().props.role).toBe("menu");
    expect(
      elements(menu()).filter((e) => e.props.role === "menuitem"),
    ).toHaveLength(0);
  });
});

describe("once it is known what fits", () => {
  it("has only that many chips in the row, the first ones", () => {
    rowFit.fit = 3;
    expect(chips().map((c) => c.props.name)).toEqual([
      "Name a",
      "Name b",
      "Name c",
    ]);
  });

  it("has the more button in the flow, no longer a probe", () => {
    rowFit.fit = 3;
    const all = elements(render());
    expect(all.some((e) => e.props.className === "probe")).toBe(false);
    expect(morePicker()).toBeDefined();
  });

  it("lists what did not fit as rows of the menu, in order", () => {
    rowFit.fit = 3;
    const rows = elements(menu()).filter((e) => e.props.role === "menuitem");
    expect(rows).toHaveLength(2);
    expect(elements(rows[0]).some((e) => e.props.children === "Name d")).toBe(
      true,
    );
    expect(elements(rows[1]).some((e) => e.props.children === "Name e")).toBe(
      true,
    );
  });

  it("has no more button when everything fits", () => {
    rowFit.fit = 5;
    expect(chips()).toHaveLength(5);
    expect(morePicker()).toBeUndefined();
  });

  it("puts every chip behind the button when none fits", () => {
    rowFit.fit = 0;
    expect(chips()).toHaveLength(0);
    expect(
      elements(menu()).filter((e) => e.props.role === "menuitem"),
    ).toHaveLength(5);
  });

  it("is named and sized as told, and is a filter chip that opens the menu", () => {
    rowFit.fit = 3;
    const picker = morePicker();
    expect(picker?.props.title).toBe("More");
    expect(picker?.props.width).toBe(320);
    expect(picker?.props.stop).toBe(true);
    const trigger = picker?.props.trigger as Node;
    expect(trigger.type).toBe(Chip);
    expect(trigger.props.children).toBe("More");
    expect(trigger.props["data-field-nav"]).toBe(true);
  });

  it("is highlighted only while something behind it is set", () => {
    rowFit.fit = 3;
    expect((morePicker()?.props.trigger as Node).props.selected).toBe(false);
    items[4] = item("e", { active: true });
    expect((morePicker()?.props.trigger as Node).props.selected).toBe(true);
    items[4] = item("e");
    items[0] = item("a", { active: true });
    // "a" is in the row, not behind the button.
    expect((morePicker()?.props.trigger as Node).props.selected).toBe(false);
  });
});

describe("a chip", () => {
  it("is drawn from its description, and nothing else", () => {
    const onClear = mock();
    items = [
      item("a", {
        label: "Acme",
        active: true,
        onClear,
        width: 220,
        maxWidth: 320,
      }),
    ];
    rowFit.fit = 1;
    const chip = chips()[0];
    expect(chip.props.name).toBe("Name a");
    expect(chip.props.label).toBe("Acme");
    expect(chip.props.active).toBe(true);
    expect(chip.props.onClear).toBe(onClear);
    expect(chip.props.width).toBe(220);
    expect(chip.props.maxWidth).toBe(320);
    expect(chip.props["data-field-nav"]).toBe(true);
    expect(chip.props.children).toBe(items[0].children);
    expect((chip.props.icon as Node).props["data-icon"]).toBe("icon-a");
  });

  it("is known by its id", () => {
    rowFit.fit = 2;
    expect(chips().map((c) => c.key)).toEqual(["a", "b"]);
  });
});

describe("what the row is measured by", () => {
  it("is how many chips there are, and what each reads and whether it is on", () => {
    items = [item("a", { label: "L1", active: true }), item("b")];
    render();
    render();
    expect(rowFit.calls[1]).toEqual([2, "mounted#a:L1:true|b:Label b:false"]);
  });

  it("changes once the row has mounted, so the widths are read again with the icons drawn", () => {
    render();
    render();
    expect(rowFit.calls[0][1]).toStartWith("first#");
    expect(rowFit.calls[1][1]).toStartWith("mounted#");
    expect(rowFit.calls[0][1]).not.toBe(rowFit.calls[1][1]);
  });

  it("changes when a chip's text or state does, so the widths are read again", () => {
    render();
    render();
    const before = rowFit.calls[1][1];
    items[2] = item("c", { label: "Longer label" });
    render();
    expect(rowFit.calls[2][1]).not.toBe(before);
    items[2] = item("c", { active: true });
    render();
    expect(rowFit.calls[3][1]).not.toBe(before);
    expect(rowFit.calls[3][1]).not.toBe(rowFit.calls[2][1]);
  });
});

describe("the menu", () => {
  beforeEach(() => {
    rowFit.fit = 3;
  });

  it("shows each field with its icon and name, and its value only when it has one", () => {
    items[3] = item("d", { active: true, label: "Initech" });
    const rows = elements(menu()).filter((e) => e.props.role === "menuitem");
    const text = (row: Node) =>
      elements(row)
        .map((e) => e.props.children)
        .filter((c) => typeof c === "string");
    expect(text(rows[0])).toEqual(["Name d", "Initech"]);
    expect(text(rows[1])).toEqual(["Name e"]);
    expect(rows[0].props["data-active"]).toBe(true);
    expect(rows[1].props["data-active"]).toBeUndefined();
    expect(
      elements(rows[0]).some((e) => e.props["data-icon"] === "icon-d"),
    ).toBe(true);
  });

  it("opens a field in place of the list when its row is picked, with a way back", () => {
    const rows = elements(menu()).filter((e) => e.props.role === "menuitem");
    rows[1].props.onClick();
    const open = menu();
    const back = elements(open).find((e) => e.props["aria-label"] === "Back");
    expect(back).toBeDefined();
    expect((back?.props.children as unknown[])[1]).toBe("Name e");
    expect(elements(open).some((e) => e.props["data-body"] === "e")).toBe(true);
    expect(elements(open).some((e) => e.props.role === "menuitem")).toBe(false);
  });

  it("gives the field what closes the whole dropdown, so picking a value ends it", () => {
    const close = mock();
    elements(menu(close))
      .filter((e) => e.props.role === "menuitem")[0]
      .props.onClick();
    const body = elements(menu(close)).find(
      (e) => e.props["data-body"] === "d",
    );
    body?.props.onClick();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("goes back to the list from a field", () => {
    elements(menu())
      .filter((e) => e.props.role === "menuitem")[0]
      .props.onClick();
    const back = elements(menu()).find((e) => e.props["aria-label"] === "Back");
    back?.props.onClick();
    expect(
      elements(menu()).filter((e) => e.props.role === "menuitem"),
    ).toHaveLength(2);
  });

  it("does not submit a form it sits in", () => {
    for (const row of elements(menu()).filter(
      (e) => e.props.role === "menuitem",
    )) {
      expect(row.props.type).toBe("button");
    }
  });
});
