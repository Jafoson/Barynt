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

const refresh = mock();
const toast = mock();
const mockSaveWorkspace = mock();
mock.module("@/features/plugins/settingsActions", () => ({
  saveWorkspacePluginSettings: mockSaveWorkspace,
}));
mock.module("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
mock.module("@/lib/ui-store", () => ({ useUI: () => ({ toast }) }));

import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { PluginSettingsModal } from "@/features/plugins/components/PluginSettings/PluginSettingsModal";
import { PluginSettingsPage } from "@/features/plugins/components/PluginSettings/PluginSettingsPage";
import { SettingsFields } from "@/features/plugins/components/PluginSettings/SettingsFields";
import { WorkspacePluginSettings } from "@/features/plugins/components/PluginSettings/WorkspacePluginSettings";
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
  refresh.mockReset();
  toast.mockReset();
  mockSaveWorkspace.mockReset();
  mockSaveWorkspace.mockResolvedValue({ ok: true });
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

describe("a plugin's settings page at work", () => {
  /** Renders the page once more, from the state the hooks hold. */
  function renderPage(): Node {
    hooks.cursor = 0;
    return PluginSettingsPage({
      name: "Notes",
      description: "Takes notes",
      version: "1.2.0",
      form,
      save,
    }) as Node;
  }
  const pageElements = () => elements(renderPage());
  const pageFields = (): FieldsProps =>
    pageElements().find((e) => e.type === SettingsFields)
      ?.props as unknown as FieldsProps;
  /** The Save button of the page: it sits in the header's `actions`. */
  const pageSave = () => {
    const header = pageElements().find((e) => e.type === PageHeader);
    return (header?.props.actions as Node).props as {
      disabled: boolean;
      form: string;
      type: string;
    };
  };
  const pageSubmit = () => {
    const formElement = pageElements().find((e) => e.type === "form");
    (
      formElement?.props as {
        onSubmit: (e: { preventDefault: () => void }) => void;
      }
    ).onSubmit({ preventDefault });
  };
  const pageFailure = (): string | null => {
    const line = pageElements().find((e) => e.props.role === "alert");
    return line
      ? String((line.props as { children: ReactNode[] }).children[1])
      : null;
  };

  it("is titled with the plugin's name and starts with nothing to save", () => {
    const header = pageElements().find((e) => e.type === PageHeader);
    expect(header?.props.title).toBe("Notes");
    expect(pageSave().disabled).toBe(true);
    expect(pageFields().state).toEqual({ title: "Hello", limit: "5" });
  });

  it("says what the plugin is: its description, its version, and that it applies to the whole workspace", () => {
    const description = pageElements().find(
      (e) => e.type === "p" && e.props.className === "pageDescription",
    );
    expect(description?.props.children).toBe("Takes notes");
    const badge = pageElements().find((e) => e.type === Badge);
    expect(badge?.props.children).toBe("1.2.0");
    const meta = pageElements().find(
      (e) => e.type === "p" && e.props.className === "pageMeta",
    );
    expect(
      elements(meta?.props.children as ReactNode).some(
        (e) =>
          e.type === "span" && e.props.children === "pluginSettings.pageScope",
      ),
    ).toBe(true);
  });

  it("shows no line for a description the plugin does not have", () => {
    hooks.cursor = 0;
    const tree = PluginSettingsPage({
      name: "Notes",
      description: "",
      version: "1.2.0",
      form,
      save,
    }) as Node;
    expect(
      elements(tree).some(
        (e) => e.type === "p" && e.props.className === "pageDescription",
      ),
    ).toBe(false);
  });

  it("gives its fields the plugin's settings, and its Save button the look of the primary action", () => {
    expect(pageFields().fields).toEqual(form.fields);
    const header = pageElements().find((e) => e.type === PageHeader);
    expect((header?.props.actions as Node).props.variant).toBe("primary");
  });

  it("has a Save button that belongs to its form", () => {
    const formElement = pageElements().find((e) => e.type === "form");
    const id = (formElement?.props as { id: string }).id;
    expect(id).toBe(":form:-form");
    expect(pageSave().form).toBe(id);
    expect(pageSave().type).toBe("submit");
  });

  it("does not save while nothing was changed", async () => {
    pageSubmit();
    await settled();
    expect(save).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  });

  it("sends the whole form, says so and reads the page again, and stays where it is", async () => {
    pageFields().onChange("limit", "9");
    expect(pageSave().disabled).toBe(false);
    pageSubmit();
    await settled();
    expect(save.mock.calls[0][0]).toEqual({ title: "Hello", limit: 9 });
    expect(toast.mock.calls).toEqual([["pluginSettings.saved"]]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(pageFields().state.limit).toBe("9");
  });

  it("starts over from what it sent: nothing more to save until something else changes", async () => {
    pageFields().onChange("title", "New");
    pageSubmit();
    await settled();
    expect(pageSave().disabled).toBe(true);
    pageFields().onChange("title", "Newer");
    expect(pageSave().disabled).toBe(false);
    pageFields().onChange("title", "New");
    expect(pageSave().disabled).toBe(true);
  });

  it("shows what the server refused under the setting, and neither says saved nor reads again", async () => {
    save.mockResolvedValue({
      error: "Some settings are not valid.",
      issues: [{ id: "limit", message: "must be at least 10" }],
    });
    pageFields().onChange("limit", "3");
    pageSubmit();
    await settled();
    expect(pageFields().errors).toEqual({ limit: "Must be at least 10" });
    expect(pageFailure()).toBe("pluginSettings.notValid");
    expect(toast).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    expect(pageSave().disabled).toBe(false);
  });

  it("is off, and ignores a second press, while a save is running", async () => {
    let finish: (result: SettingsSaveResult) => void = () => {};
    save.mockImplementation(
      () =>
        new Promise<SettingsSaveResult>((resolve) => {
          finish = resolve;
        }),
    );
    pageFields().onChange("title", "New");
    pageSubmit();
    expect(pageFields().disabled).toBe(true);
    expect(pageSave().disabled).toBe(true);
    pageSubmit();
    expect(save).toHaveBeenCalledTimes(1);
    finish({ ok: true });
    await settled();
    expect(toast).toHaveBeenCalledTimes(1);
  });

  it("keeps the browser from submitting the form itself", () => {
    pageSubmit();
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe("a workspace plugin's settings page", () => {
  const wrapper = () =>
    WorkspacePluginSettings({
      workspaceId: "ws-7",
      plugin: {
        id: "notes",
        name: "Notes",
        description: "Takes notes",
        version: "1.2.0",
      },
      form,
    }) as Node;

  it("is the settings page of the plugin, with what it is and its form", () => {
    const tree = wrapper();
    expect(tree.type).toBe(PluginSettingsPage);
    expect(tree.props.name).toBe("Notes");
    expect(tree.props.description).toBe("Takes notes");
    expect(tree.props.version).toBe("1.2.0");
    expect(tree.props.form).toBe(form);
  });

  it("saves through the workspace's action, with this workspace and this plugin and the whole form", async () => {
    const save = wrapper().props.save as (
      values: Record<string, unknown>,
    ) => Promise<unknown>;
    const answer = await save({ title: "New", limit: 9 });
    expect(mockSaveWorkspace.mock.calls).toEqual([
      ["ws-7", "notes", { title: "New", limit: 9 }],
    ]);
    expect(answer).toEqual({ ok: true });
  });

  it("gives the page what the server said, the problems included", async () => {
    const refused = {
      error: "Some settings are not valid.",
      issues: [{ id: "title", message: "is required" }],
    };
    mockSaveWorkspace.mockResolvedValue(refused);
    const save = wrapper().props.save as (
      values: Record<string, unknown>,
    ) => Promise<unknown>;
    expect(await save({ title: "" })).toEqual(refused);
  });
});
