import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactElement, ReactNode } from "react";

// The list of a workspace's or a project's custom fields: what is shown, what a person may do with
// each row, and what each button asks of the server. No DOM: the hooks are stand-ins that keep their
// state in a list, and the section is called as a function, its tables' columns are asked for the
// cells of a row. Own process: it replaces `react`'s hooks.

const actualReact = await import("react");
const hooks = {
  slots: [] as unknown[],
  cursor: 0,
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
    false,
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
  return { useTranslations: () => t };
});

const refresh = mock();
mock.module("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

const confirm = mock();
mock.module("@/components/ui/layout/ConfirmDialog/ConfirmDialog", () => ({
  useConfirm: () => confirm,
}));

const openModal = mock();
mock.module("@/features/custom-fields/useOpenCustomFieldModal", () => ({
  useOpenCustomFieldModal: () => openModal,
}));

const mockArchive = mock();
const mockDelete = mock();
mock.module("@/features/custom-fields/actions", () => ({
  setCustomFieldArchived: mockArchive,
  deleteCustomField: mockDelete,
}));

import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";
import { CustomFields } from "@/features/custom-fields/components/CustomFields/CustomFields";
import type {
  CustomFieldManageRow,
  CustomFieldRow,
  CustomFieldsView,
} from "@/features/custom-fields/types";

/** An element of the tree: its props are whatever the component put on it. */
type Node = ReactElement<Record<string, unknown>>;

function field(
  id: string,
  more: Partial<CustomFieldManageRow> = {},
): CustomFieldManageRow {
  return {
    id,
    key: id,
    name: `Field ${id}`,
    description: "",
    icon: null,
    type: "text",
    config: { maxLength: 200 },
    position: 0,
    archived: false,
    pluginId: null,
    workspaceId: "w1",
    projectId: null,
    valueCount: 0,
    ...more,
  };
}

function view(more: Partial<CustomFieldsView> = {}): CustomFieldsView {
  return {
    level: "workspace",
    workspaceId: "w1",
    projectId: null,
    fields: [],
    inherited: [],
    canManage: true,
    room: 10,
    ...more,
  };
}

let current: CustomFieldsView = view();
let embedded = false;

function render(): Node {
  hooks.cursor = 0;
  return CustomFields({ view: current, embedded }) as Node;
}

function elements(node: ReactNode, into: Node[] = []): Node[] {
  if (Array.isArray(node)) {
    for (const child of node) elements(child, into);
  } else if (node && typeof node === "object" && "props" in node) {
    const element = node as Node;
    into.push(element);
    elements(element.props.children as ReactNode, into);
    // The page header's button is a prop, not a child.
    elements(element.props.actions as ReactNode, into);
  }
  return into;
}

type Row = CustomFieldManageRow & CustomFieldRow;
type TableProps = {
  label: string;
  columns: TableColumn<Row>[];
  rows: Row[];
  empty?: ReactNode;
};
const tables = () =>
  elements(render())
    .filter((e) => e.type === Table)
    .map((e) => e.props as unknown as TableProps);
const table = (label: string): TableProps | undefined =>
  tables().find((t) => t.label === label);
const ACTIVE = "customFields.title";
const ARCHIVED = "customFields.archivedTitle";
const INHERITED = "customFields.inheritedTitle";
const ids = (t: TableProps | undefined) => t?.rows.map((r) => r.id);
const column = (t: TableProps, id: string) =>
  t.columns.find((c) => c.id === id);
/** The buttons in a row's actions cell, by their label. */
function rowButtons(t: TableProps, row: Row): Record<string, Node> {
  const cell = column(t, "actions")?.cell(row);
  const found: Record<string, Node> = {};
  for (const e of elements(cell as ReactNode)) {
    if (e.type === Button) found[String(e.props["aria-label"])] = e;
  }
  return found;
}
const click = async (button: Node) => {
  await (button.props.onClick as () => unknown)();
  while (hooks.started.length > 0) await Promise.all(hooks.started.splice(0));
};
const newButton = (): Node | undefined =>
  elements(render()).find(
    (e) => e.type === Button && e.props.children === "customFields.newField",
  );
const errorLine = (): string | null => {
  const line = elements(render()).find((e) => e.props.role === "alert");
  return line
    ? String((line.props as { children: ReactNode[] }).children[1])
    : null;
};
/** What a cell draws, flattened to its text. */
const text = (node: ReactNode): string => {
  if (typeof node === "string") return node;
  if (Array.isArray(node)) return node.map(text).join("|");
  if (node && typeof node === "object" && "props" in node) {
    return text((node as Node).props.children as ReactNode);
  }
  return "";
};

beforeEach(() => {
  hooks.slots = [];
  hooks.cursor = 0;
  hooks.started = [];
  current = view();
  embedded = false;
  refresh.mockReset();
  confirm.mockReset();
  confirm.mockResolvedValue(true);
  openModal.mockReset();
  mockArchive.mockReset();
  mockArchive.mockResolvedValue({ ok: true, id: "x" });
  mockDelete.mockReset();
  mockDelete.mockResolvedValue({ ok: true, id: "x" });
});

describe("the header", () => {
  it("is the page's own header on a page of its own, with the number of fields", () => {
    current = view({
      fields: [field("a"), field("b"), field("c", { archived: true })],
    });
    const header = elements(render()).find((e) => e.type === PageHeader);
    expect(header?.props.title).toBe("nav.fields");
    expect(header?.props.count).toBe(2);
    expect(header?.props.description).toBe("customFields.workspaceIntro");
  });

  it("says what a project's fields are, on a project's page", () => {
    current = view({ level: "project", projectId: "p1" });
    const header = elements(render()).find((e) => e.type === PageHeader);
    expect(header?.props.description).toBe("customFields.projectIntro");
  });

  it("is a heading of its own, without the page's header, inside another page", () => {
    embedded = true;
    const all = elements(render());
    expect(all.some((e) => e.type === PageHeader)).toBe(false);
    expect(all.filter((e) => e.type === "h2")).toHaveLength(1);
    expect(all.find((e) => e.type === "h2")?.props.children).toBe(
      "customFields.title",
    );
  });

  it("is the page's header once, and no heading of its own, on a page of its own", () => {
    const all = elements(render());
    expect(all.filter((e) => e.type === PageHeader)).toHaveLength(1);
    expect(all.some((e) => e.type === "h2")).toBe(false);
  });

  it("has the button once, wherever the header is", () => {
    const count = () =>
      elements(render()).filter(
        (e) =>
          e.type === Button && e.props.children === "customFields.newField",
      ).length;
    expect(count()).toBe(1);
    embedded = true;
    expect(count()).toBe(1);
  });
});

describe("the button for a new field", () => {
  it("is offered to whoever manages the fields, and to nobody else", () => {
    expect(newButton()).toBeDefined();
    current = view({ canManage: false });
    expect(newButton()).toBeUndefined();
  });

  it("opens the window for the workspace on the workspace's page", async () => {
    await click(newButton() as Node);
    expect(openModal).toHaveBeenCalledTimes(1);
    const args = openModal.mock.calls[0][0];
    expect(args.scope).toEqual({ workspaceId: "w1" });
    expect(args.field).toBeUndefined();
  });

  it("opens the window for the project on a project's page", async () => {
    current = view({ level: "project", projectId: "p1" });
    await click(newButton() as Node);
    expect(openModal.mock.calls[0][0].scope).toEqual({ projectId: "p1" });
  });

  it("is off, and says why, when the workspace has no room for another field", () => {
    current = view({ room: 0 });
    expect(newButton()?.props.disabled).toBe(true);
    expect(newButton()?.props.title).toBe("customFields.limit:100");
    expect(
      elements(render()).some(
        (e) => e.props.children === "customFields.limit:100" && e.type === "p",
      ),
    ).toBe(true);
  });

  it("is on, without a hint, while there is room", () => {
    current = view({ room: 1 });
    expect(newButton()?.props.disabled).toBe(false);
    expect(newButton()?.props.title).toBeUndefined();
    expect(
      elements(render()).some(
        (e) => e.type === "p" && e.props.className?.toString().includes("note"),
      ),
    ).toBe(false);
  });

  it("does not talk about the limit to someone who cannot add a field anyway", () => {
    current = view({ room: 0, canManage: false });
    expect(
      elements(render()).some(
        (e) => e.props.children === "customFields.limit:100",
      ),
    ).toBe(false);
  });

  it("refreshes the page once the window says it is done", async () => {
    await click(newButton() as Node);
    openModal.mock.calls[0][0].onDone();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("the lists", () => {
  it("show the fields that are on in one list and the archived ones in another, each in its order", () => {
    current = view({
      fields: [
        field("a"),
        field("b", { archived: true }),
        field("c"),
        field("d", { archived: true }),
      ],
    });
    expect(ids(table(ACTIVE))).toEqual(["a", "c"]);
    expect(ids(table(ARCHIVED))).toEqual(["b", "d"]);
  });

  it("have no list of archived fields when none is archived", () => {
    current = view({ fields: [field("a")] });
    expect(table(ARCHIVED)).toBeUndefined();
  });

  it("have no list of the workspace's fields on the workspace's own page", () => {
    expect(table(INHERITED)).toBeUndefined();
  });

  it("show the workspace's fields on a project's page, without a column of buttons", () => {
    current = view({
      level: "project",
      projectId: "p1",
      fields: [field("own", { projectId: "p1" })],
      inherited: [field("wide")],
    });
    const inherited = table(INHERITED);
    expect(ids(inherited)).toEqual(["wide"]);
    expect(inherited && column(inherited, "actions")).toBeUndefined();
  });

  it("show a field's name with its description under it, and its type and key", () => {
    current = view({
      fields: [field("a", { name: "Customer", description: "Who asked" })],
    });
    const t = table(ACTIVE) as TableProps;
    const row = t.rows[0];
    const name = text(column(t, "name")?.cell(row) as ReactNode);
    expect(name).toContain("Customer");
    expect(name).toContain("Who asked");
    expect(text(column(t, "key")?.cell(row) as ReactNode)).toBe("a");
    expect(text(column(t, "type")?.cell(row) as ReactNode)).toContain(
      "customFields.types.text",
    );
  });

  it("leave out the description's line when there is none", () => {
    current = view({ fields: [field("a", { description: "" })] });
    const t = table(ACTIVE) as TableProps;
    const cell = elements(column(t, "name")?.cell(t.rows[0]) as ReactNode);
    expect(cell.filter((e) => e.type === "span")).toHaveLength(1);
  });

  it("show the icon a field was given before its name, and none for one that has none", () => {
    current = view({
      fields: [field("a", { icon: "lucide:flag" }), field("b", { icon: null })],
    });
    const t = table(ACTIVE) as TableProps;
    const icons = (row: Row) =>
      elements(column(t, "name")?.cell(row) as ReactNode)
        .map((e) => (e.props as { icon?: string }).icon)
        .filter(Boolean);
    expect(icons(t.rows[0])).toEqual(["lucide:flag"]);
    expect(icons(t.rows[1])).toEqual([]);
  });

  it("draw the icon of the field's type", () => {
    current = view({ fields: [field("a", { type: "date" })] });
    const t = table(ACTIVE) as TableProps;
    const icons = elements(column(t, "type")?.cell(t.rows[0]) as ReactNode)
      .map((e) => (e.props as { icon?: string }).icon)
      .filter(Boolean);
    expect(icons).toEqual(["lucide:calendar"]);
  });

  it("say how many answers a field holds, or that it is unused", () => {
    current = view({
      fields: [field("a", { valueCount: 0 }), field("b", { valueCount: 7 })],
    });
    const t = table(ACTIVE) as TableProps;
    const answers = (row: Row) =>
      text(column(t, "answers")?.cell(row) as ReactNode);
    expect(answers(t.rows[0])).toBe("customFields.unused");
    expect(answers(t.rows[1])).toBe("customFields.answers:7");
  });

  it("say so when there is no field yet, and offer the button where it may be used", () => {
    const t = table(ACTIVE) as TableProps;
    const empty = (t.empty as Node).props as Record<string, unknown>;
    expect((t.empty as Node).type).toBe(EmptyState);
    expect(empty.description).toBe("customFields.emptyDesc");
    expect(empty.action).toBeTruthy();
    current = view({ canManage: false });
    const readOnly = (table(ACTIVE)?.empty as Node).props as Record<
      string,
      unknown
    >;
    expect(readOnly.description).toBe("customFields.emptyReadOnly");
    expect(readOnly.action).toBeFalsy();
  });
});

describe("what may be done with a row", () => {
  it("is nothing without the right to manage the fields: there is no column of buttons", () => {
    current = view({ canManage: false, fields: [field("a")] });
    expect(column(table(ACTIVE) as TableProps, "actions")).toBeUndefined();
  });

  it("is to change, archive and delete a field that is on", () => {
    current = view({ fields: [field("a")] });
    const t = table(ACTIVE) as TableProps;
    expect(Object.keys(rowButtons(t, t.rows[0]))).toEqual([
      "actions.edit",
      "customFields.archive",
      "actions.delete",
    ]);
  });

  it("is to restore or delete a field that is archived, not to change it", () => {
    current = view({ fields: [field("a", { archived: true })] });
    const t = table(ARCHIVED) as TableProps;
    expect(Object.keys(rowButtons(t, t.rows[0]))).toEqual([
      "customFields.restore",
      "actions.delete",
    ]);
  });

  it("is nothing for a plugin's field, which is marked as one", () => {
    current = view({ fields: [field("a", { pluginId: "notes" })] });
    const t = table(ACTIVE) as TableProps;
    expect(Object.keys(rowButtons(t, t.rows[0]))).toEqual([]);
    const cell = column(t, "actions")?.cell(t.rows[0]) as Node;
    expect(cell.props.title).toBe("customFields.pluginOwned");
    expect(text(cell)).toContain("customFields.plugin");
  });

  it("opens the window with the field to change", async () => {
    const a = field("a");
    current = view({ fields: [a] });
    const t = table(ACTIVE) as TableProps;
    await click(rowButtons(t, t.rows[0])["actions.edit"]);
    expect(openModal.mock.calls[0][0].field).toEqual(a);
    expect(openModal.mock.calls[0][0].scope).toEqual({ workspaceId: "w1" });
  });

  it("archives a field and refreshes the page", async () => {
    current = view({ fields: [field("a")] });
    const t = table(ACTIVE) as TableProps;
    await click(rowButtons(t, t.rows[0])["customFields.archive"]);
    expect(mockArchive).toHaveBeenCalledWith("a", true);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(errorLine()).toBeNull();
  });

  it("draws an archive box for a field that is on and a box coming back out for one that is archived", () => {
    current = view({
      fields: [field("a"), field("b", { archived: true })],
    });
    const iconOf = (label: string, list: string, id: string) => {
      const t = table(list) as TableProps;
      const row = t.rows.find((r) => r.id === id) as Row;
      const button = rowButtons(t, row)[label];
      return (button.props.icon as Node).props.icon;
    };
    expect(iconOf("customFields.archive", ACTIVE, "a")).toBe("lucide:archive");
    expect(iconOf("customFields.restore", ARCHIVED, "b")).toBe(
      "lucide:archive-restore",
    );
  });

  it("restores a field and refreshes the page", async () => {
    current = view({ fields: [field("a", { archived: true })] });
    const t = table(ARCHIVED) as TableProps;
    await click(rowButtons(t, t.rows[0])["customFields.restore"]);
    expect(mockArchive).toHaveBeenCalledWith("a", false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("shows the server's sentence when it refuses, and does not refresh", async () => {
    mockArchive.mockResolvedValue({ error: "You may not do that." });
    current = view({ fields: [field("a")] });
    const t = table(ACTIVE) as TableProps;
    await click(rowButtons(t, t.rows[0])["customFields.archive"]);
    expect(errorLine()).toBe("You may not do that.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("takes the sentence away when the next thing goes through", async () => {
    mockArchive.mockResolvedValueOnce({ error: "You may not do that." });
    current = view({ fields: [field("a")] });
    const t = table(ACTIVE) as TableProps;
    await click(rowButtons(t, t.rows[0])["customFields.archive"]);
    await click(rowButtons(t, t.rows[0])["customFields.archive"]);
    expect(errorLine()).toBeNull();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("asks before it deletes, with what is lost in numbers, and deletes after a yes", async () => {
    current = view({
      fields: [field("a", { name: "Customer", valueCount: 4 })],
    });
    const t = table(ACTIVE) as TableProps;
    await click(rowButtons(t, t.rows[0])["actions.delete"]);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0][0]).toEqual({
      title: "customFields.deleteTitle:Customer",
      description: "customFields.deleteDesc:4",
      confirmLabel: "actions.delete",
      cancelLabel: "actions.cancel",
      danger: true,
    });
    expect(mockDelete).toHaveBeenCalledWith("a");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("deletes nothing after a no", async () => {
    confirm.mockResolvedValue(false);
    current = view({ fields: [field("a")] });
    const t = table(ACTIVE) as TableProps;
    await click(rowButtons(t, t.rows[0])["actions.delete"]);
    expect(mockDelete).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows the server's sentence when the delete is refused", async () => {
    mockDelete.mockResolvedValue({ error: "A plugin owns it." });
    current = view({ fields: [field("a")] });
    const t = table(ACTIVE) as TableProps;
    await click(rowButtons(t, t.rows[0])["actions.delete"]);
    expect(errorLine()).toBe("A plugin owns it.");
    expect(refresh).not.toHaveBeenCalled();
  });
});
