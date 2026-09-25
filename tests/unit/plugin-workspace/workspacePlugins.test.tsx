import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// A workspace's plugins page. Static markup shows what is offered where; the switches are
// stand-ins that keep the functions they were given, so a test can flip them and see which action
// runs with which arguments. What matters: a workspace only switches on and off, a plugin that
// cannot run cannot be switched on and says why, one that is on can always be switched off (after
// a question), and what the server answers is shown, not swallowed.

interface Flip {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  label: string;
}
interface Pressed {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}
let switches: Flip[] = [];
let buttons: Pressed[] = [];
const openModal = mock((_render: unknown, _options: unknown) => "modal");
const toast = mock();
const closeModal = mock();
const mockSave = mock();
/** Whether this is a phone (a sheet instead of a dialog), and whether an action is running. */
const running = { phone: false, pending: false };
const confirm = mock(async (_options: unknown) => true);
const refresh = mock();
const mockEnable = mock();
const mockDisable = mock();

const actualReact = await import("react");
let started: Promise<unknown>[] = [];
mock.module("react", () => ({
  ...actualReact,
  default: actualReact,
  useTransition: () => [
    running.pending,
    (callback: () => unknown) => {
      started.push(Promise.resolve(callback()));
    },
  ],
}));
mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));
mock.module("next-intl", () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params ? `${key}|${JSON.stringify(params)}` : key;
  t.rich = (key: string) => key;
  return { useTranslations: () => t };
});
mock.module("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
mock.module("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    "aria-current"?: "page";
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
mock.module("@/lib/utils/useMediaQuery", () => ({
  useMediaQuery: () => running.phone,
  PHONE_QUERY: "(max-width: 640px)",
  COMPACT_QUERY: "(max-width: 1024px)",
}));
mock.module("@/lib/context", () => ({ useModal: () => ({ openModal }) }));
mock.module("@/lib/ui-store", () => ({ useUI: () => ({ toast }) }));
mock.module("@/components/ui/atoms/Button/Button", () => ({
  Button: (props: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => {
    const label = typeof props.children === "string" ? props.children : "";
    buttons.push({ label, onClick: props.onClick, disabled: props.disabled });
    return (
      <button type="button" disabled={props.disabled} data-label={label}>
        {label}
      </button>
    );
  },
}));
mock.module("@/components/ui/layout/ConfirmDialog/ConfirmDialog", () => ({
  useConfirm: () => confirm,
}));
mock.module("@/components/ui/atoms/Switch/Switch", () => ({
  Switch: (props: Flip) => {
    switches.push(props);
    return (
      <input type="checkbox" id={props.id} checked={props.checked} readOnly />
    );
  },
}));
mock.module("@/features/plugins/settingsActions", () => ({
  saveWorkspacePluginSettings: mockSave,
}));
mock.module("@/features/plugins/workspaceActions", () => ({
  enablePlugin: mockEnable,
  disablePlugin: mockDisable,
}));

import { WorkspacePlugins } from "@/features/plugins/components/WorkspacePlugins/WorkspacePlugins";
import type {
  WorkspacePlugin,
  WorkspacePluginsView,
} from "@/features/plugins/workspacePlugins";
import type { SettingField, SettingsForm } from "@/lib/plugins/settings";

function plugin(more: Partial<WorkspacePlugin> = {}): WorkspacePlugin {
  return {
    id: "notes",
    version: "1.0.0",
    name: "Notes",
    description: "Takes notes",
    author: "Acme",
    categories: ["planning"],
    capabilities: [],
    hasCode: false,
    fromStore: true,
    on: false,
    blocker: null,
    state: { kind: "idle" },
    settings: null,
    ...more,
  };
}
function view(more: Partial<WorkspacePluginsView> = {}): WorkspacePluginsView {
  return {
    available: true,
    storeAvailable: false,
    plugins: [],
    platform: [],
    ...more,
  };
}
function render(v: WorkspacePluginsView): string {
  switches = [];
  buttons = [];
  started = [];
  return renderToStaticMarkup(<WorkspacePlugins workspaceId="ws-7" view={v} />);
}
const settled = async () => {
  while (started.length > 0) await Promise.all(started.splice(0));
};
const flip = async (id: string, on: boolean) => {
  const found = switches.find((s) => s.id === `workspace-plugin-${id}`);
  if (!found) throw new Error(`no switch for ${id}`);
  found.onChange(on);
  await settled();
};
const switchOf = (id: string) =>
  switches.find((s) => s.id === `workspace-plugin-${id}`);

beforeEach(() => {
  openModal.mockReset();
  toast.mockReset();
  mockSave.mockReset();
  mockSave.mockResolvedValue({ ok: true });
  running.phone = false;
  running.pending = false;
  confirm.mockReset();
  confirm.mockResolvedValue(true);
  refresh.mockReset();
  mockEnable.mockReset();
  mockEnable.mockResolvedValue({ ok: true });
  mockDisable.mockReset();
  mockDisable.mockResolvedValue({ ok: true });
});

describe("what is shown", () => {
  it("is a row for each plugin, with what it is", () => {
    const html = render(
      view({
        plugins: [
          plugin(),
          plugin({
            id: "wiki",
            name: "Wiki",
            description: "Pages",
            hasCode: true,
            version: "2.1.0",
          }),
        ],
      }),
    );
    expect(html).toContain("Notes");
    expect(html).toContain("Takes notes");
    expect(html).toContain("Wiki");
    expect(html).toContain("2.1.0");
    expect(html).toContain("pluginsAdmin.withCode");
    expect(html).toContain("pluginsAdmin.declarative");
    expect(switches.map((s) => s.id)).toEqual([
      "workspace-plugin-notes",
      "workspace-plugin-wiki",
    ]);
  });

  it("names the plugin for whoever cannot see the switch", () => {
    render(view({ plugins: [plugin()] }));
    expect(switchOf("notes")?.label).toBe(
      'workspacePlugins.switchLabel|{"name":"Notes"}',
    );
  });

  it("says where a plugin comes from: a store, or none, with the warning that nobody reviewed it", () => {
    const fromStore = render(view({ plugins: [plugin()] }));
    expect(fromStore).toContain("pluginsAdmin.sourceStore");
    expect(fromStore).not.toContain("pluginsAdmin.unsigned");
    const own = render(view({ plugins: [plugin({ fromStore: false })] }));
    expect(own).toContain("pluginsAdmin.unsigned");
    expect(own).toContain("pluginsAdmin.unsignedHint");
    expect(own).not.toContain("pluginsAdmin.sourceStore");
  });

  it("says whether a plugin has code, one at a time", () => {
    const code = render(view({ plugins: [plugin({ hasCode: true })] }));
    expect(code).toContain("pluginsAdmin.withCode");
    expect(code).not.toContain("pluginsAdmin.declarative");
    const none = render(view({ plugins: [plugin({ hasCode: false })] }));
    expect(none).toContain("pluginsAdmin.declarative");
    expect(none).not.toContain("pluginsAdmin.withCode");
  });

  it("does not show a section for the platform's own plugins when it has none", () => {
    expect(render(view({ plugins: [plugin()] }))).not.toContain(
      "workspacePlugins.platformTitle",
    );
  });

  it("says it is running here, when it is on and runs", () => {
    const html = render(
      view({
        plugins: [
          plugin({ on: true, state: { kind: "running", mode: "declarative" } }),
        ],
      }),
    );
    expect(html).toContain("workspacePlugins.running");
    expect(html).toContain('data-tone="ok"');
  });

  it("says it is off here when it runs for another workspace and this one has not switched it on", () => {
    const html = render(
      view({
        plugins: [
          plugin({
            on: false,
            blocker: null,
            state: { kind: "running", mode: "declarative" },
          }),
        ],
      }),
    );
    expect(html).toContain("workspacePlugins.off");
    expect(html).not.toContain("workspacePlugins.running");
  });

  it("reads a problem where a plugin that is on cannot run or the platform switched it off, and a wait where it only needs the platform's approval", () => {
    const tone = (p: Partial<WorkspacePlugin>) =>
      /data-tone="(\w+)"/.exec(render(view({ plugins: [plugin(p)] })))?.[1];
    expect(tone({ on: true, blocker: "needs-approval" })).toBe("problem");
    expect(tone({ on: true, blocker: "approval-outdated" })).toBe("problem");
    expect(tone({ on: false, blocker: "platform-off" })).toBe("problem");
    expect(tone({ on: false, blocker: "needs-approval" })).toBe("idle");
    expect(tone({ on: false, blocker: "approval-outdated" })).toBe("idle");
    expect(tone({ on: false, blocker: null })).toBe("idle");
  });

  it("says it is off here, when nothing is in the way", () => {
    const html = render(view({ plugins: [plugin()] }));
    expect(html).toContain("workspacePlugins.off");
    expect(html).toContain('data-tone="idle"');
  });

  it.each(["platform-off", "needs-approval", "approval-outdated"] as const)(
    "says why it cannot be switched on, for %s",
    (blocker) => {
      const html = render(view({ plugins: [plugin({ blocker })] }));
      expect(html).toContain(`workspacePlugins.blocker.${blocker}`);
    },
  );

  it("says why a plugin that cannot load cannot run, in the registry's words", () => {
    const html = render(
      view({
        plugins: [
          plugin({ blocker: "cannot-run", state: { kind: "missing" } }),
        ],
      }),
    );
    expect(html).toContain("workspacePlugins.cannotRun");
    expect(html).toContain("pluginsAdmin.state.missing");
    expect(html).toContain('data-tone="problem"');
  });

  it("says why an idle plugin is not running in the workspace's words: no workspace has switched it on", () => {
    const html = render(
      view({
        plugins: [plugin({ on: true, blocker: null, state: { kind: "idle" } })],
      }),
    );
    expect(html).toContain("pluginsAdmin.state.idle");
    expect(html).not.toContain("pluginsAdmin.state.idleProject");
  });

  it("says a plugin that is on here and is not running is a problem, not an off switch", () => {
    const html = render(
      view({
        plugins: [
          plugin({ on: true, blocker: "platform-off", state: { kind: "off" } }),
        ],
      }),
    );
    expect(html).toContain("workspacePlugins.blocker.platform-off");
    expect(html).toContain('data-tone="problem"');
    const stale = render(
      view({
        plugins: [plugin({ on: true, blocker: null, state: { kind: "idle" } })],
      }),
    );
    expect(stale).toContain("workspacePlugins.cannotRun");
  });

  it("says the platform's own plugins apply everywhere, and are not for this workspace to switch", () => {
    const html = render(
      view({
        plugins: [plugin()],
        platform: [
          {
            id: "audit",
            version: "1.0.0",
            name: "Audit trail",
            description: "Everywhere",
          },
        ],
      }),
    );
    expect(html).toContain("workspacePlugins.platformTitle");
    expect(html).toContain("Audit trail");
    expect(html).toContain("workspacePlugins.platformNote");
    expect(switches).toHaveLength(1);
  });

  it("says there is nothing to switch on yet, and that plugins are unavailable, when they are", () => {
    expect(render(view())).toContain("workspacePlugins.empty");
    const off = render(view({ available: false }));
    expect(off).toContain("workspacePlugins.unavailable");
    expect(off).not.toContain("workspacePlugins.empty");
  });
});

describe("the tabs", () => {
  it("are there, to the workspace's own two pages, when the platform gave workspaces the store", () => {
    const html = render(view({ storeAvailable: true, plugins: [plugin()] }));
    expect(html).toContain('href="/ws-7/settings/plugins"');
    expect(html).toContain('href="/ws-7/settings/plugins/store"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("pluginStore.tabStore");
  });

  it("are not there when it did not", () => {
    const html = render(view({ storeAvailable: false, plugins: [plugin()] }));
    expect(html).not.toContain("/store");
    expect(html).not.toContain("pluginStore.tabStore");
  });
});

describe("the switch", () => {
  it("is on for a plugin that is on, off for one that is not", () => {
    render(
      view({
        plugins: [plugin({ on: true }), plugin({ id: "wiki", name: "Wiki" })],
      }),
    );
    expect(switchOf("notes")?.checked).toBe(true);
    expect(switchOf("wiki")?.checked).toBe(false);
  });

  it("can be flipped for a plugin that can run, and cannot for one that cannot", () => {
    render(
      view({
        plugins: [
          plugin(),
          plugin({ id: "a", name: "A", blocker: "needs-approval" }),
          plugin({ id: "b", name: "B", blocker: "platform-off" }),
          plugin({ id: "c", name: "C", blocker: "cannot-run" }),
        ],
      }),
    );
    expect(switchOf("notes")?.disabled).toBe(false);
    expect(switchOf("a")?.disabled).toBe(true);
    expect(switchOf("b")?.disabled).toBe(true);
    expect(switchOf("c")?.disabled).toBe(true);
  });

  it("can always be switched off when it is on, whatever is in the way", () => {
    render(
      view({
        plugins: [
          plugin({ on: true, blocker: "platform-off" }),
          plugin({ id: "x", name: "X", on: true, blocker: "cannot-run" }),
        ],
      }),
    );
    expect(switchOf("notes")?.disabled).toBe(false);
    expect(switchOf("x")?.disabled).toBe(false);
  });

  it("switches a plugin on in this workspace, with the ids the page was given and nothing else, and reads the page again", async () => {
    render(view({ plugins: [plugin()] }));
    await flip("notes", true);
    expect(mockEnable.mock.calls).toEqual([["ws-7", "notes"]]);
    expect(mockDisable).not.toHaveBeenCalled();
    expect(confirm).not.toHaveBeenCalled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("asks before it switches a plugin off, and then does, in this workspace", async () => {
    render(view({ plugins: [plugin({ on: true })] }));
    await flip("notes", false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      title: 'workspacePlugins.switchOffTitle|{"name":"Notes"}',
      description: "workspacePlugins.switchOffDesc",
      confirmLabel: "workspacePlugins.switchOff",
      danger: true,
    });
    expect(mockDisable.mock.calls).toEqual([["ws-7", "notes"]]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("does not switch it off when the question is answered no", async () => {
    confirm.mockResolvedValue(false);
    render(view({ plugins: [plugin({ on: true })] }));
    await flip("notes", false);
    expect(mockDisable).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does not read the page again when the server refused, and does not pretend", async () => {
    mockEnable.mockResolvedValue({
      error: "The platform has not approved its code.",
    });
    render(view({ plugins: [plugin()] }));
    await flip("notes", true);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("passes on a warning, that what was asked for was done and something on the way failed", async () => {
    mockDisable.mockResolvedValue({ ok: true, warning: "onDisable threw" });
    render(view({ plugins: [plugin({ on: true })] }));
    await flip("notes", false);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

const settingField: SettingField = {
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
};
const settingsForm: SettingsForm = {
  fields: [settingField],
  values: { title: "Hello" },
};

/** Presses the button with this label, and waits for what it started. */
const press = async (label: string) => {
  const button = buttons.find((b) => b.label === label);
  if (!button?.onClick) throw new Error(`no button "${label}"`);
  await button.onClick();
  await settled();
};

/** The window the last press opened: its element's props, and how it was opened. */
function lastModal() {
  const call = openModal.mock.calls.at(-1);
  if (!call) throw new Error("no window was opened");
  const element = (call[0] as (a: { close: () => void }) => ReactElement)({
    close: closeModal,
  });
  return {
    props: element.props as {
      name: string;
      form: SettingsForm;
      close: () => void;
      sheet?: boolean;
      save: (values: Record<string, unknown>) => Promise<unknown>;
      onSaved: () => void;
    },
    options: call[1] as { label: string; placement?: string },
  };
}

describe("a plugin's settings, a workspace's", () => {
  it("are offered for a plugin that is on here and has settings, and only for it", () => {
    render(
      view({
        plugins: [
          plugin({ id: "a", name: "A", on: true, settings: settingsForm }),
          plugin({ id: "b", name: "B", on: true, settings: null }),
          plugin({ id: "c", name: "C", on: false, settings: null }),
        ],
      }),
    );
    expect(buttons.map((b) => b.label)).toEqual(["pluginSettings.open"]);
  });

  it("offers nothing when no plugin has settings", () => {
    render(view({ plugins: [plugin({ on: true })] }));
    expect(buttons).toEqual([]);
  });

  it("opens the plugin's own form in a dialog, with its name", async () => {
    render(view({ plugins: [plugin({ on: true, settings: settingsForm })] }));
    await press("pluginSettings.open");
    expect(openModal).toHaveBeenCalledTimes(1);
    const { props, options } = lastModal();
    expect(props.name).toBe("Notes");
    expect(props.form).toEqual(settingsForm);
    expect(props.sheet).toBe(false);
    expect(options.placement).toBeUndefined();
    expect(options.label).toBe('title|{"name":"Notes"}');
  });

  it("cannot be opened while another action is running", () => {
    running.pending = true;
    render(view({ plugins: [plugin({ on: true, settings: settingsForm })] }));
    const button = buttons.find((b) => b.label === "pluginSettings.open");
    expect(button?.disabled).toBe(true);
  });

  it("can be opened when nothing is running", () => {
    render(view({ plugins: [plugin({ on: true, settings: settingsForm })] }));
    const button = buttons.find((b) => b.label === "pluginSettings.open");
    expect(button?.disabled).toBe(false);
  });

  it("gives the window the means to close itself", async () => {
    render(view({ plugins: [plugin({ on: true, settings: settingsForm })] }));
    await press("pluginSettings.open");
    expect(lastModal().props.close).toBe(closeModal);
  });

  it("opens it as a sheet on a phone", async () => {
    running.phone = true;
    render(view({ plugins: [plugin({ on: true, settings: settingsForm })] }));
    await press("pluginSettings.open");
    const { props, options } = lastModal();
    expect(props.sheet).toBe(true);
    expect(options.placement).toBe("bottom");
  });

  it("opens the form of the plugin whose button was pressed", async () => {
    const other: SettingsForm = {
      fields: [{ ...settingField, id: "other" }],
      values: { other: "x" },
    };
    render(
      view({
        plugins: [
          plugin({ id: "a", name: "A", on: true, settings: settingsForm }),
          plugin({ id: "b", name: "B", on: true, settings: other }),
        ],
      }),
    );
    const second = buttons.filter((b) => b.label === "pluginSettings.open")[1];
    await second.onClick?.();
    const { props } = lastModal();
    expect(props.name).toBe("B");
    expect(props.form).toEqual(other);
    await props.save({ other: "y" });
    expect(mockSave.mock.calls).toEqual([["ws-7", "b", { other: "y" }]]);
  });

  it("saves through this level's action, with the plugin and the whole form", async () => {
    mockSave.mockResolvedValue({ ok: true });
    render(view({ plugins: [plugin({ on: true, settings: settingsForm })] }));
    await press("pluginSettings.open");
    const answer = await lastModal().props.save({ title: "New" });
    expect(mockSave.mock.calls).toEqual([["ws-7", "notes", { title: "New" }]]);
    expect(answer).toEqual({ ok: true });
  });

  it("gives the window what the server said, the problems included", async () => {
    const refused = {
      error: "Some settings are not valid.",
      issues: [{ id: "title", message: "is required" }],
    };
    mockSave.mockResolvedValue(refused);
    render(view({ plugins: [plugin({ on: true, settings: settingsForm })] }));
    await press("pluginSettings.open");
    expect(await lastModal().props.save({ title: "" })).toEqual(refused);
  });

  it("says so and reads the page again once they are saved, and not before", async () => {
    render(view({ plugins: [plugin({ on: true, settings: settingsForm })] }));
    await press("pluginSettings.open");
    expect(toast).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
    lastModal().props.onSaved();
    expect(toast.mock.calls).toEqual([["saved"]]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
