import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactElement, ReactNode } from "react";

// What the settings window does while someone works in it: Save is off until something changed,
// a save sends the whole form, a problem shows under its own setting and goes when that setting
// is edited, and a second press while one is running does nothing. There is no DOM here, so the
// hooks are small stand-ins that keep their state in a list, and the window is called as a
// function again after each change, the way React would render it. Own process: it replaces
// `react`'s hooks, which the markup tests next door must not see.

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
  useRef: (initial: unknown) => {
    const at = hooks.cursor++;
    if (!(at in hooks.slots)) hooks.slots[at] = { current: initial };
    return hooks.slots[at];
  },
  useId: () => ":form:",
  useTransition: () => [
    hooks.pending,
    (callback: () => Promise<unknown>) => {
      hooks.pending = true;
      hooks.started.push(
        Promise.resolve(callback()).finally(() => {
          hooks.pending = false;
        }),
      );
    },
  ],
}));
mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));
mock.module("next-intl", () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key;
  return { useTranslations: () => t };
});

import { Button } from "@/components/ui/atoms/Button/Button";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { PluginSettingsModal } from "@/features/plugins/components/PluginSettings/PluginSettingsModal";
import { SettingsFields } from "@/features/plugins/components/PluginSettings/SettingsFields";
import type { SettingsSaveResult } from "@/features/plugins/types";
import type { SettingField, SettingsForm } from "@/lib/plugins/settings";

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
const form: SettingsForm = {
  fields: [
    field({ id: "title" }),
    field({ id: "limit", type: "number", maxLength: null }),
  ],
  values: { title: "Hello", limit: 5 },
};

const save = mock(
  async (_values: Record<string, unknown>): Promise<SettingsSaveResult> => ({
    ok: true,
  }),
);
const onSaved = mock();
const close = mock();

/** An element of the tree: its props are whatever the component put on it. */
type Node = ReactElement<Record<string, unknown>>;

/** Renders the window once more, from the state the hooks hold. */
function render(more: { sheet?: boolean } = {}): Node {
  hooks.cursor = 0;
  return PluginSettingsModal({
    name: "Notes",
    form,
    save,
    onSaved,
    close,
    sheet: more.sheet,
  }) as Node;
}

/** Every element in the tree, depth first. */
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

type FieldsProps = React.ComponentProps<typeof SettingsFields>;
/** What the window hands its fields now. */
const fields = (): FieldsProps =>
  elements(render()).find((e) => e.type === SettingsFields)
    ?.props as unknown as FieldsProps;
/** The Save button's props now. */
const saveButton = () =>
  elements(render()).find((e) => e.type === Button && e.props.type === "submit")
    ?.props as { disabled: boolean; form: string };
const failureLine = (): string | null => {
  const line = elements(render()).find((e) => e.props.role === "alert");
  return line
    ? String((line.props as { children: ReactNode[] }).children[1])
    : null;
};
const preventDefault = mock();
/** Presses Enter or Save: the form's submit handler. */
const submit = () => {
  const formElement = elements(render()).find((e) => e.type === "form");
  (
    formElement?.props as {
      onSubmit: (e: { preventDefault: () => void }) => void;
    }
  ).onSubmit({ preventDefault });
};
const settled = async () => {
  while (hooks.started.length > 0) await Promise.all(hooks.started.splice(0));
};
/** Types into a field, as its control would tell the window. */
const type = (id: string, value: string) => fields().onChange(id, value);

beforeEach(() => {
  hooks.slots = [];
  hooks.cursor = 0;
  hooks.pending = false;
  hooks.started = [];
  save.mockReset();
  save.mockResolvedValue({ ok: true });
  onSaved.mockReset();
  close.mockReset();
  preventDefault.mockReset();
});

describe("a plugin's settings window at work", () => {
  it("starts with the values the page read, and nothing to save", () => {
    expect(fields().state).toEqual({ title: "Hello", limit: "5" });
    expect(fields().errors).toEqual({});
    expect(saveButton().disabled).toBe(true);
    expect(failureLine()).toBeNull();
  });

  it("does not save while nothing was changed, however it is submitted", async () => {
    submit();
    await settled();
    expect(save).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("turns Save on as soon as a setting differs from what it started as, and off when it is put back", () => {
    type("title", "Hello!");
    expect(fields().state.title).toBe("Hello!");
    expect(saveButton().disabled).toBe(false);
    type("title", "Hello");
    expect(saveButton().disabled).toBe(true);
  });

  it("keeps what was typed in the other settings when one changes", () => {
    type("title", "Changed");
    type("limit", "9");
    expect(fields().state).toEqual({ title: "Changed", limit: "9" });
  });

  it("sends the whole form, numbers as numbers, and closes once it is saved", async () => {
    type("limit", "9");
    submit();
    await settled();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual({ title: "Hello", limit: 9 });
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("leaves the window as it is once it is saved: nothing is shown after it closes", async () => {
    type("title", "New");
    submit();
    await settled();
    expect(fields().errors).toEqual({});
    expect(failureLine()).toBeNull();
  });

  it("keeps the browser from submitting the form itself", () => {
    submit();
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("says the values are too large together in words", async () => {
    save.mockResolvedValue({
      error: "Some settings are not valid.",
      issues: [{ id: "", message: "is too large" }],
    });
    type("title", "New");
    submit();
    await settled();
    expect(failureLine()).toBe("pluginSettings.tooLarge");
  });

  it("says it is saved before it closes, so the page reads again while the window goes", async () => {
    const order: string[] = [];
    onSaved.mockImplementation(() => order.push("saved"));
    close.mockImplementation(() => order.push("close"));
    type("title", "New");
    submit();
    await settled();
    expect(order).toEqual(["saved", "close"]);
  });

  it("stays open and shows a problem under the setting it is about, and the general line above", async () => {
    save.mockResolvedValue({
      error: "Some settings are not valid.",
      issues: [{ id: "limit", message: "must be at least 10" }],
    });
    type("limit", "3");
    submit();
    await settled();
    expect(fields().errors).toEqual({ limit: "Must be at least 10" });
    expect(failureLine()).toBe("pluginSettings.notValid");
    expect(onSaved).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    // What was typed is still there, and can be corrected and saved again.
    expect(fields().state.limit).toBe("3");
    expect(saveButton().disabled).toBe(false);
  });

  it("clears the problem of a setting, and the general line, when that setting is edited", async () => {
    save.mockResolvedValue({
      error: "Some settings are not valid.",
      issues: [
        { id: "title", message: "is required" },
        { id: "limit", message: "must be at least 10" },
      ],
    });
    type("title", "");
    submit();
    await settled();
    expect(Object.keys(fields().errors).sort()).toEqual(["limit", "title"]);
    type("title", "Back");
    expect(fields().errors).toEqual({ limit: "Must be at least 10" });
    expect(failureLine()).toBeNull();
  });

  it("clears the problem of the setting that was edited, whichever it is", async () => {
    save.mockResolvedValue({
      error: "Some settings are not valid.",
      issues: [
        { id: "title", message: "is required" },
        { id: "limit", message: "must be at least 10" },
      ],
    });
    type("title", "");
    submit();
    await settled();
    type("limit", "12");
    expect(fields().errors).toEqual({ title: "Is required" });
  });

  it("does not clear a problem when a setting without one is edited", async () => {
    save.mockResolvedValue({
      error: "Some settings are not valid.",
      issues: [{ id: "limit", message: "must be at least 10" }],
    });
    type("limit", "3");
    submit();
    await settled();
    type("title", "Other");
    expect(fields().errors).toEqual({ limit: "Must be at least 10" });
  });

  it("shows what the server said when no setting is at fault", async () => {
    save.mockResolvedValue({
      error: "Switch the plugin on in this workspace first.",
    });
    type("title", "New");
    submit();
    await settled();
    expect(failureLine()).toBe("Switch the plugin on in this workspace first.");
    expect(fields().errors).toEqual({});
    expect(close).not.toHaveBeenCalled();
  });

  it("says it could not be saved when the request fails, and stays open", async () => {
    save.mockRejectedValue(new Error("network down"));
    type("title", "New");
    submit();
    await settled();
    expect(failureLine()).toBe("pluginSettings.saveFailed");
    expect(close).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("forgets an earlier problem when the next save works", async () => {
    save.mockResolvedValueOnce({ error: "Unknown plugin." });
    type("title", "New");
    submit();
    await settled();
    expect(failureLine()).toBe("Unknown plugin.");
    submit();
    await settled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("is off, and ignores a second press, while a save is running", async () => {
    let finish: (result: SettingsSaveResult) => void = () => {};
    save.mockImplementation(
      () =>
        new Promise<SettingsSaveResult>((resolve) => {
          finish = resolve;
        }),
    );
    type("title", "New");
    submit();
    expect(fields().disabled).toBe(true);
    expect(saveButton().disabled).toBe(true);
    submit();
    expect(save).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    await settled();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("gives its fields the settings of the plugin and ids of its own", () => {
    expect(fields().fields).toEqual(form.fields);
    expect(fields().idPrefix).toBe(":form:");
  });

  it("belongs the Save button to a form with an id of its own", () => {
    const formElement = elements(render()).find((e) => e.type === "form");
    const id = (formElement?.props as { id: string }).id;
    expect(id).toBe(":form:-form");
    expect(saveButton().form).toBe(id);
  });

  it("cancels by closing, in a dialog", () => {
    const cancel = elements(render()).find(
      (e) => e.type === Button && e.props.variant === "ghost",
    );
    expect(cancel?.props.onClick).toBe(close);
  });

  it("is a dialog with the header of one, 480 wide, that closes it", () => {
    const tree = render();
    expect(tree.props.variant).toBe("dialog");
    expect(tree.props.width).toBe(480);
    expect(tree.props.style).toBeUndefined();
    expect(tree.props.onTouchStart).toBeUndefined();
    const header = elements(tree).find((e) => e.type === ModalHeader);
    expect(elements(tree).some((e) => e.type === SheetHeader)).toBe(false);
    expect(header?.props.onClose).toBe(close);
    expect(header?.props.closeLabel).toBe("actions.close");
    expect(header?.props.title).toBe("pluginSettings.title:Notes");
  });

  it("is a sheet with the header of one, that follows a swipe and closes it", () => {
    const tree = render({ sheet: true });
    expect(tree.props.variant).toBe("sheet");
    expect(tree.props.style).toBeDefined();
    expect(typeof tree.props.onTouchStart).toBe("function");
    expect(typeof tree.props.onTouchMove).toBe("function");
    const header = elements(tree).find((e) => e.type === SheetHeader);
    expect(elements(tree).some((e) => e.type === ModalHeader)).toBe(false);
    expect(header?.props.onClose).toBe(close);
    expect(header?.props.closeLabel).toBe("actions.close");
    expect(header?.props.title).toBe("pluginSettings.title:Notes");
    expect(
      elements(tree).some(
        (e) => e.type === Button && e.props.variant === "ghost",
      ),
    ).toBe(false);
  });
});
