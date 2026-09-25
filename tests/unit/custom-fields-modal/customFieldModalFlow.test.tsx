import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactElement, ReactNode } from "react";

// What the custom field window does while someone works in it: Save is off until something
// changed, a new field is created in the scope it was opened for, a change sends neither the key
// nor the type, a problem shows under its own box and goes when that box is edited, options keep
// their ids, and a second press while one save is running does nothing. There is no DOM here, so
// the hooks are small stand-ins that keep their state in a list, and the window is called as a
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

const mockCreate = mock();
const mockChange = mock();
mock.module("@/features/custom-fields/actions", () => ({
  createCustomField: mockCreate,
  changeCustomField: mockChange,
}));

import { Button } from "@/components/ui/atoms/Button/Button";
import { Input } from "@/components/ui/atoms/Input/Input";
import { Select } from "@/components/ui/atoms/Select/Select";
import { Textarea } from "@/components/ui/atoms/Textarea/Textarea";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal } from "@/components/ui/layout/Modal/Modal";
import { CustomFieldModal } from "@/features/custom-fields/components/CustomFieldModal/CustomFieldModal";
import type {
  CustomFieldManageRow,
  CustomFieldResult,
} from "@/features/custom-fields/types";
import { MAX_SELECT_OPTIONS } from "@/lib/custom-fields/types";

const onDone = mock();
const close = mock();

/** An element of the tree: its props are whatever the component put on it. */
type Node = ReactElement<Record<string, unknown>>;
type Props = React.ComponentProps<typeof CustomFieldModal>;

let field: CustomFieldManageRow | undefined;
let scope: Props["scope"] = { workspaceId: "w1" };
let sheet: boolean | undefined;

/** Renders the window once more, from the state the hooks hold. */
function render(): Node {
  hooks.cursor = 0;
  return CustomFieldModal({ scope, field, onDone, close, sheet }) as Node;
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

type ControlProps = {
  value?: string;
  label?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  placeholder?: string;
  checked?: boolean;
  onChange: (event: { target: Record<string, unknown> }) => void;
};

/** The box or the select with this label, as it is now; `undefined` when the window has none. */
const control = (label: string): ControlProps | undefined =>
  elements(render()).find(
    (e) =>
      (e.type === Input || e.type === Select || e.type === Textarea) &&
      e.props.label === label,
  )?.props as ControlProps | undefined;
const box = (label: string): ControlProps => {
  const found = control(label);
  if (!found) throw new Error(`no box labelled ${label}`);
  return found;
};
/** Types into a box, as it would tell the window. */
const type = (label: string, value: string) =>
  box(label).onChange({ target: { value } });
const optionBoxes = () =>
  elements(render()).filter(
    (e) =>
      e.type === Input &&
      String(e.props.label).startsWith("customFields.optionLabel"),
  );
/** Types into the box of the option at this place. */
const typeOption = (index: number, value: string) =>
  (optionBoxes()[index].props as unknown as ControlProps).onChange({
    target: { value },
  });
const buttons = () => elements(render()).filter((e) => e.type === Button);
const saveButton = () =>
  buttons().find((e) => e.props.type === "submit")?.props as {
    disabled: boolean;
    form: string;
  };
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
const addOptionButton = () =>
  buttons().find((e) => e.props.children === "customFields.addOption")
    ?.props as { onClick: () => void; disabled: boolean };

function existing(
  more: Partial<CustomFieldManageRow> = {},
): CustomFieldManageRow {
  return {
    id: "f1",
    key: "customer",
    name: "Customer",
    description: "Who asked",
    type: "text",
    config: { maxLength: 80 },
    position: 0,
    archived: false,
    pluginId: null,
    workspaceId: "w1",
    projectId: null,
    valueCount: 3,
    ...more,
  };
}

beforeEach(() => {
  hooks.slots = [];
  hooks.cursor = 0;
  hooks.pending = false;
  hooks.started = [];
  field = undefined;
  scope = { workspaceId: "w1" };
  sheet = undefined;
  onDone.mockReset();
  close.mockReset();
  preventDefault.mockReset();
  mockCreate.mockReset();
  mockCreate.mockResolvedValue({ ok: true, id: "new" } as CustomFieldResult);
  mockChange.mockReset();
  mockChange.mockResolvedValue({ ok: true, id: "f1" } as CustomFieldResult);
});

describe("the window for a new field", () => {
  it("starts empty with Save off", () => {
    expect(box("customFields.name").value).toBe("");
    expect(box("customFields.type").value).toBe("text");
    expect(saveButton().disabled).toBe(true);
    expect(failureLine()).toBeNull();
  });

  it("asks for the key and the type, which cannot be changed later", () => {
    expect(control("customFields.key")).toBeDefined();
    expect(control("customFields.key")?.hint).toBe("customFields.keyHint");
    expect(box("customFields.type").disabled).toBe(false);
    expect(box("customFields.type").hint).toBeUndefined();
  });

  it("is titled as a new field", () => {
    const header = elements(render()).find(
      (e) => e.type === ModalHeader,
    )?.props;
    expect(header?.title).toBe("customFields.newTitle");
  });

  it("does not save while there is no name, however it is submitted", async () => {
    submit();
    await settled();
    expect(mockCreate).not.toHaveBeenCalled();
    type("customFields.name", "   ");
    expect(saveButton().disabled).toBe(true);
    submit();
    await settled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("turns Save on as soon as there is a name", () => {
    type("customFields.name", "Customer");
    expect(saveButton().disabled).toBe(false);
  });

  it("creates the field in the scope it was opened for and closes once it is saved", async () => {
    type("customFields.name", "Customer");
    type("customFields.description", "Who asked");
    submit();
    await settled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate.mock.calls[0][0]).toEqual({ workspaceId: "w1" });
    expect(mockCreate.mock.calls[0][1]).toEqual({
      name: "Customer",
      key: undefined,
      description: "Who asked",
      type: "text",
      config: { maxLength: 200 },
    });
    expect(mockChange).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("creates a project's field in that project", async () => {
    scope = { projectId: "p1" };
    type("customFields.name", "Environment");
    submit();
    await settled();
    expect(mockCreate.mock.calls[0][0]).toEqual({ projectId: "p1" });
  });

  it("keeps the browser from submitting the form itself", () => {
    submit();
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it("writes the key in lower case as it is typed", () => {
    type("customFields.key", "My-Key");
    expect(box("customFields.key").value).toBe("my-key");
  });

  it("suggests the key made of the name while the key box is empty", () => {
    type("customFields.name", "Release Date");
    expect(box("customFields.key").placeholder).toBe("release-date");
    type("customFields.name", "");
    expect(box("customFields.key").placeholder).toBe("");
  });

  it("sends the key that was typed", async () => {
    type("customFields.name", "Customer");
    type("customFields.key", "client");
    submit();
    await settled();
    expect(mockCreate.mock.calls[0][1].key).toBe("client");
  });

  it("sends the type that was chosen, with what its boxes hold", async () => {
    type("customFields.name", "Points");
    type("customFields.type", "number");
    type("customFields.min", "0");
    submit();
    await settled();
    expect(mockCreate.mock.calls[0][1]).toMatchObject({
      type: "number",
      config: { integer: false, min: 0, max: null },
    });
  });

  it("ignores a second press while a save is running", async () => {
    type("customFields.name", "Customer");
    submit();
    hooks.pending = true;
    submit();
    hooks.pending = false;
    await settled();
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("is a sheet on a phone: a sheet's header, and the dialog's otherwise", () => {
    sheet = true;
    expect(elements(render()).some((e) => e.type === SheetHeader)).toBe(true);
    expect(elements(render()).some((e) => e.type === ModalHeader)).toBe(false);
    sheet = false;
    expect(elements(render()).some((e) => e.type === ModalHeader)).toBe(true);
  });

  it("is a bottom sheet on a phone and a dialog otherwise", () => {
    const variant = () =>
      elements(render()).find((e) => e.type === Modal)?.props.variant;
    sheet = true;
    expect(variant()).toBe("sheet");
    sheet = false;
    expect(variant()).toBe("dialog");
    sheet = undefined;
    expect(variant()).toBe("dialog");
  });

  it("turns the boxes and Save off while a save is running", () => {
    type("customFields.name", "Customer");
    type("customFields.type", "number");
    const off = () => [
      box("customFields.name").disabled,
      box("customFields.key").disabled,
      box("customFields.type").disabled,
      box("customFields.min").disabled,
      box("customFields.max").disabled,
      box("customFields.description").disabled,
      saveButton().disabled,
    ];
    expect(off().every((x) => x === false || x === undefined)).toBe(true);
    hooks.pending = true;
    expect(off().every((x) => x === true)).toBe(true);
  });

  it("follows a swipe and takes its touches on a sheet, and does neither in a dialog", () => {
    sheet = true;
    expect(render().props.style).toBeDefined();
    expect(typeof render().props.onTouchStart).toBe("function");
    expect(typeof render().props.onTouchMove).toBe("function");
    sheet = false;
    expect(render().props.style).toBeUndefined();
    expect(render().props.onTouchStart).toBeUndefined();
  });

  it("closes from the header's button, in either shape", () => {
    for (const shape of [true, false]) {
      sheet = shape;
      const header = elements(render()).find(
        (e) => e.type === (shape ? SheetHeader : ModalHeader),
      );
      expect(header?.props.onClose).toBe(close);
      expect(header?.props.closeLabel).toBe("actions.close");
    }
  });

  it("has no Cancel on a sheet (it has its close button and the swipe), and one in the dialog", () => {
    const cancel = () =>
      buttons().some((e) => e.props.children === "actions.cancel");
    sheet = true;
    expect(cancel()).toBe(false);
    sheet = false;
    expect(cancel()).toBe(true);
  });

  it("does not focus the name on a sheet, so the keyboard does not open on its own", () => {
    sheet = true;
    const input = elements(render()).find(
      (e) => e.type === Input && e.props.label === "customFields.name",
    );
    expect(input?.props.autoFocus).toBe(false);
    sheet = false;
    const dialogInput = elements(render()).find(
      (e) => e.type === Input && e.props.label === "customFields.name",
    );
    expect(dialogInput?.props.autoFocus).toBe(true);
  });
});

describe("what each type asks for", () => {
  it("asks a text field for its longest answer only", () => {
    expect(control("customFields.maxLength")).toBeDefined();
    expect(control("customFields.min")).toBeUndefined();
    expect(control("customFields.options")).toBeUndefined();
  });

  it("asks a number field for whole numbers only and the smallest and the largest", () => {
    type("customFields.type", "number");
    expect(control("customFields.maxLength")).toBeUndefined();
    expect(control("customFields.min")).toBeDefined();
    expect(control("customFields.max")).toBeDefined();
  });

  it("offers the options of a choice and of no other type", () => {
    const hasOptions = () =>
      elements(render()).some((e) => e.type === "fieldset");
    for (const kind of ["text", "number", "date", "user", "url"]) {
      type("customFields.type", kind);
      expect(hasOptions()).toBe(false);
    }
    type("customFields.type", "select");
    expect(hasOptions()).toBe(true);
  });

  it("asks a date, person or link field for nothing more", () => {
    for (const kind of ["date", "user", "url"]) {
      type("customFields.type", kind);
      expect(control("customFields.maxLength")).toBeUndefined();
      expect(control("customFields.min")).toBeUndefined();
      expect(optionBoxes()).toHaveLength(0);
    }
  });

  it("lets a choice's options be added, typed and taken away", async () => {
    type("customFields.name", "Environment");
    type("customFields.type", "select");
    expect(optionBoxes()).toHaveLength(0);
    addOptionButton().onClick();
    addOptionButton().onClick();
    expect(optionBoxes()).toHaveLength(2);
    typeOption(0, "Prod");
    typeOption(1, "Dev");
    expect(optionBoxes().map((e) => e.props.value)).toEqual(["Prod", "Dev"]);

    const remove = buttons().find(
      (e) => e.props["aria-label"] === "customFields.removeOption:Prod",
    )?.props as { onClick: () => void };
    remove.onClick();
    expect(optionBoxes().map((e) => e.props.value)).toEqual(["Dev"]);

    submit();
    await settled();
    expect(mockCreate.mock.calls[0][1].config).toEqual({
      options: [{ label: "Dev", color: null }],
    });
  });

  it("numbers the options in the order they are listed", () => {
    type("customFields.type", "select");
    addOptionButton().onClick();
    addOptionButton().onClick();
    expect(optionBoxes().map((e) => e.props.label)).toEqual([
      "customFields.optionLabel:1",
      "customFields.optionLabel:2",
    ]);
  });

  it("stops offering options at the most a choice may have", () => {
    type("customFields.type", "select");
    for (let i = 0; i < MAX_SELECT_OPTIONS - 1; i++)
      addOptionButton().onClick();
    expect(addOptionButton().disabled).toBe(false);
    addOptionButton().onClick();
    expect(optionBoxes()).toHaveLength(MAX_SELECT_OPTIONS);
    expect(addOptionButton().disabled).toBe(true);
  });
});

describe("the window for a field that exists", () => {
  beforeEach(() => {
    field = existing();
  });

  it("starts with what the field is, and Save off", () => {
    expect(box("customFields.name").value).toBe("Customer");
    expect(box("customFields.description").value).toBe("Who asked");
    expect(box("customFields.maxLength").value).toBe("80");
    expect(saveButton().disabled).toBe(true);
  });

  it("is titled with the field's name", () => {
    const header = elements(render()).find(
      (e) => e.type === ModalHeader,
    )?.props;
    expect(header?.title).toBe("customFields.editTitle:Customer");
  });

  it("does not offer the key, and shows the type as fixed", () => {
    expect(control("customFields.key")).toBeUndefined();
    expect(box("customFields.type").disabled).toBe(true);
    expect(box("customFields.type").hint).toBe("customFields.typeFixed");
    expect(box("customFields.type").value).toBe("text");
  });

  it("does not save what it started as", async () => {
    submit();
    await settled();
    expect(mockChange).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
  });

  it("turns Save on for a change and off when it is put back", () => {
    type("customFields.name", "Client");
    expect(saveButton().disabled).toBe(false);
    type("customFields.name", "Customer");
    expect(saveButton().disabled).toBe(true);
  });

  it("changes the field with the name, description and config, and never the key or the type", async () => {
    type("customFields.name", "Client");
    submit();
    await settled();
    expect(mockChange).toHaveBeenCalledTimes(1);
    expect(mockChange.mock.calls[0][0]).toBe("f1");
    expect(mockChange.mock.calls[0][1]).toEqual({
      name: "Client",
      description: "Who asked",
      config: { maxLength: 80 },
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the ids of a choice's options through a rename, and gives a new option none", async () => {
    field = existing({
      type: "select",
      config: {
        options: [
          { id: "prod", label: "Prod", color: "#ff0000" },
          { id: "dev", label: "Dev", color: null },
        ],
      },
    });
    typeOption(0, "Production");
    addOptionButton().onClick();
    typeOption(2, "Staging");
    submit();
    await settled();
    expect(mockChange.mock.calls[0][1].config).toEqual({
      options: [
        { id: "prod", label: "Production", color: "#ff0000" },
        { id: "dev", label: "Dev", color: null },
        { label: "Staging", color: null },
      ],
    });
  });
});

describe("when the save does not go through", () => {
  it("shows the server's problem under the box it belongs to, and its sentence at the bottom", async () => {
    mockCreate.mockResolvedValue({
      error: "The field is not valid.",
      issues: [{ path: "name", message: "is required" }],
    });
    type("customFields.name", "x");
    submit();
    await settled();
    expect(box("customFields.name").error).toBe("Is required");
    expect(failureLine()).toBe("The field is not valid.");
    expect(close).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  it("takes a problem away when its box is edited, and the sentence with it", async () => {
    mockCreate.mockResolvedValue({
      error: "The field is not valid.",
      issues: [
        { path: "name", message: "is required" },
        { path: "key", message: "is taken" },
      ],
    });
    type("customFields.name", "x");
    submit();
    await settled();
    type("customFields.name", "xy");
    expect(box("customFields.name").error).toBeUndefined();
    expect(box("customFields.key").error).toBe("Is taken");
    expect(failureLine()).toBeNull();
  });

  it("shows a problem of the options under them, and takes it away when an option is typed", async () => {
    mockCreate.mockResolvedValue({
      error: "The field is not valid.",
      issues: [{ path: "config", message: "needs at least one option" }],
    });
    type("customFields.name", "Env");
    type("customFields.type", "select");
    submit();
    await settled();
    const errorText = () =>
      elements(render()).find(
        (e) =>
          e.type === "p" &&
          String(e.props.children) === "Needs at least one option",
      );
    expect(errorText()).toBeDefined();
    addOptionButton().onClick();
    typeOption(0, "Prod");
    expect(errorText()).toBeUndefined();
  });

  it("takes the sentence away when an option is typed", async () => {
    mockCreate.mockResolvedValue({ error: "The field is not valid." });
    type("customFields.name", "Env");
    type("customFields.type", "select");
    addOptionButton().onClick();
    submit();
    await settled();
    expect(failureLine()).toBe("The field is not valid.");
    typeOption(0, "Prod");
    expect(failureLine()).toBeNull();
  });

  it("says the field could not be saved when the request itself fails, and stays open", async () => {
    mockCreate.mockRejectedValue(new Error("offline"));
    type("customFields.name", "Customer");
    submit();
    await settled();
    expect(failureLine()).toBe("customFields.saveFailed");
    expect(close).not.toHaveBeenCalled();
  });

  it("lets it be tried again after a failure", async () => {
    mockCreate.mockResolvedValueOnce({ error: "Nope." });
    type("customFields.name", "Customer");
    submit();
    await settled();
    submit();
    await settled();
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
