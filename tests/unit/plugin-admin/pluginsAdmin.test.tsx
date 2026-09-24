import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The plugins page. Static markup shows what is offered where; the buttons, the
// switches and the dialogs are stand-ins that keep the functions they were given, so
// a test can press them and see which action runs with which arguments. That is what
// matters here: the dialogs are the question, the server is the protection, so each
// dialog has to pass on the hash, the version and the yes it was shown.

interface Pressed {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}
interface Flip {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

let buttons: Pressed[] = [];
let switches: Flip[] = [];
const openModal = mock((_render: unknown, _options: unknown) => "modal");
const confirm = mock(async (_options: unknown) => true);
const refresh = mock();

const mockApprove = mock();
const mockRevoke = mock();
const mockInstall = mock();
const mockUpdate = mock();
const mockUninstall = mock();
const mockRollback = mock();
const mockSetStatus = mock();

// `startTransition` cannot be called after a server render, and the actions are called
// from it: here it runs what it is given at once and waits for it, like the browser does.
const actualReact = await import("react");
let started: Promise<unknown>[] = [];
/** What `useTransition` says about whether an action is running, and whether this is a phone. */
const running = { pending: false, phone: false };
mock.module("@/lib/utils/useMediaQuery", () => ({
  useMediaQuery: () => running.phone,
  PHONE_QUERY: "(max-width: 640px)",
  COMPACT_QUERY: "(max-width: 1024px)",
}));
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
  t.rich = (key: string, params?: Record<string, unknown>) =>
    `${key}|${JSON.stringify(params, (_k, v) => (typeof v === "function" ? "fn" : v))}`;
  return { useTranslations: () => t };
});
mock.module("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
mock.module("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  ),
}));
mock.module("@/lib/context", () => ({ useModal: () => ({ openModal }) }));
mock.module("@/components/ui/layout/ConfirmDialog/ConfirmDialog", () => ({
  useConfirm: () => confirm,
}));
mock.module("@/components/ui/atoms/Button/Button", () => ({
  Button: (props: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
  }) => {
    const label =
      typeof props.children === "string"
        ? props.children
        : (props["aria-label"] ?? "");
    buttons.push({ label, onClick: props.onClick, disabled: props.disabled });
    return (
      <button type="button" disabled={props.disabled} data-label={label}>
        {label}
      </button>
    );
  },
}));
mock.module("@/components/ui/atoms/Switch/Switch", () => ({
  Switch: (props: Flip & { label: string }) => {
    switches.push({
      id: props.id,
      checked: props.checked,
      onChange: props.onChange,
      disabled: props.disabled,
    });
    return (
      <input type="checkbox" id={props.id} checked={props.checked} readOnly />
    );
  },
}));
mock.module("@/components/ui/layout/AcknowledgeModal/AcknowledgeModal", () => ({
  AcknowledgeModal: () => null,
}));
mock.module("@/features/plugins/actions", () => ({
  approvePluginCode: mockApprove,
  revokePluginCodeApproval: mockRevoke,
}));
mock.module("@/features/plugins/lifecycleActions", () => ({
  installPlugin: mockInstall,
  updatePlugin: mockUpdate,
  uninstallPlugin: mockUninstall,
  rollbackPlugin: mockRollback,
  setPluginStatus: mockSetStatus,
}));

import { PluginsAdmin } from "@/features/plugins/components/PluginsAdmin/PluginsAdmin";
import type {
  AvailablePlugin,
  InstalledPlugin,
  PluginsOverview,
} from "@/features/plugins/overview";

const H1 = `sha512-${"A".repeat(86)}==`;

function installed(more: Partial<InstalledPlugin> = {}): InstalledPlugin {
  return {
    id: "calendar",
    version: "1.0.0",
    name: "Calendar",
    description: "Plans things",
    author: "Someone",
    license: "MIT",
    homepage: null,
    repository: null,
    categories: ["other"],
    capabilities: ["issues:read", "network:egress:api.example.com"],
    scope: "WORKSPACE",
    source: "STORE",
    origin: "https://github.com/Jafoson/barynt-plugin-store",
    unsigned: false,
    hasCode: true,
    platformOn: true,
    workspaces: 2,
    state: { kind: "running", mode: "in-process" },
    approval: { kind: "approved" },
    integrity: H1,
    update: null,
    previousVersion: null,
    storeUpdate: null,
    ...more,
  };
}

function available(more: Partial<AvailablePlugin> = {}): AvailablePlugin {
  return {
    id: "notes",
    version: "1.2.0",
    name: "Notes",
    description: "Takes notes",
    author: "Someone",
    license: "MIT",
    categories: ["other"],
    capabilities: ["issues:read"],
    scope: "WORKSPACE",
    hasCode: false,
    ...more,
  };
}

function overview(more: Partial<PluginsOverview> = {}): PluginsOverview {
  return {
    dir: "/plugins",
    problem: null,
    issues: [],
    allowUnsigned: false,
    installed: [],
    available: [],
    unusable: [],
    ...more,
  };
}

function render(o: PluginsOverview): string {
  buttons = [];
  switches = [];
  started = [];
  return renderToStaticMarkup(<PluginsAdmin overview={o} />);
}

/** Presses a button and waits for what it started. */
const press = async (label: string) => {
  const button = buttons.find((b) => b.label === label);
  if (!button?.onClick) throw new Error(`no button "${label}"`);
  await button.onClick();
  await settled();
};
const settled = async () => {
  while (started.length > 0) await Promise.all(started.splice(0));
};
const labels = () => buttons.map((b) => b.label);

/** The dialog the last press opened: its element, and its options. */
function lastModal() {
  const call = openModal.mock.calls.at(-1);
  if (!call) throw new Error("no dialog was opened");
  const element = (call[0] as (a: { close: () => void }) => ReactElement)({
    close: () => {},
  });
  return {
    props: element.props as {
      title: string;
      confirmLabel: string;
      sheet?: boolean;
      notice: (s: {
        checked: boolean;
        onChange: (c: boolean) => void;
        disabled: boolean;
      }) => ReactNode;
      onConfirm: () => Promise<string | null>;
    },
    options: call[1] as { label: string; placement?: string },
  };
}
const noticeMarkup = () =>
  renderToStaticMarkup(
    <>
      {lastModal().props.notice({
        checked: false,
        onChange: () => {},
        disabled: false,
      })}
    </>,
  );

beforeEach(() => {
  for (const m of [
    openModal,
    confirm,
    refresh,
    mockApprove,
    mockRevoke,
    mockInstall,
    mockUpdate,
    mockUninstall,
    mockRollback,
    mockSetStatus,
  ]) {
    m.mockClear();
  }
  confirm.mockResolvedValue(true);
  running.pending = false;
  running.phone = false;
  for (const m of [
    mockApprove,
    mockRevoke,
    mockInstall,
    mockUpdate,
    mockUninstall,
    mockRollback,
    mockSetStatus,
  ]) {
    m.mockResolvedValue({ ok: true });
  }
});

describe("an installed plugin", () => {
  it("shows its name, what it says about itself, its version and where it applies", () => {
    const html = render(overview({ installed: [installed()] }));
    expect(html).toContain("Calendar");
    expect(html).toContain("Plans things");
    expect(html).toContain("1.0.0");
    expect(html).toContain("pluginsAdmin.scopeWorkspace");
    expect(html).toContain("pluginsAdmin.withCode");
    expect(html).toContain("pluginsAdmin.workspacesOn|{&quot;count&quot;:2}");
  });

  it("says where a plugin applies that applies per project, and counts no workspaces for it", () => {
    const html = render(
      overview({
        installed: [installed({ scope: "PROJECT", workspaces: 0 })],
      }),
    );
    expect(html).toContain("pluginsAdmin.scopeProject");
    expect(html).not.toContain("pluginsAdmin.scopeWorkspace");
    expect(html).not.toContain("pluginsAdmin.scopePlatform");
    expect(html).not.toContain("pluginsAdmin.workspacesOn");
  });

  it("does not count workspaces for a plugin of the whole platform", () => {
    const html = render(
      overview({
        installed: [installed({ scope: "PLATFORM", workspaces: 0 })],
      }),
    );
    expect(html).toContain("pluginsAdmin.scopePlatform");
    expect(html).not.toContain("pluginsAdmin.workspacesOn");
  });

  it("marks a plugin that comes from no store, and does not call it a store plugin", () => {
    const html = render(
      overview({
        installed: [
          installed({ unsigned: true, source: "DIRECTORY", origin: null }),
        ],
      }),
    );
    expect(html).toContain("pluginsAdmin.unsigned");
    expect(html).not.toContain("pluginsAdmin.sourceStore");
  });

  it("calls a plugin from a store that, and does not mark it", () => {
    const html = render(overview({ installed: [installed()] }));
    expect(html).toContain("pluginsAdmin.sourceStore");
    expect(html).not.toContain(">pluginsAdmin.unsigned<");
  });

  it("says a plugin without code has none", () => {
    const html = render(
      overview({
        installed: [installed({ hasCode: false, approval: { kind: "none" } })],
      }),
    );
    expect(html).toContain("pluginsAdmin.declarative");
    expect(html).not.toContain("pluginsAdmin.withCode");
  });

  it("has its switch on when the platform has it on, and says so to nothing else", () => {
    render(overview({ installed: [installed()] }));
    expect(switches).toEqual([
      expect.objectContaining({ id: "plugin-on-calendar", checked: true }),
    ]);
    render(overview({ installed: [installed({ platformOn: false })] }));
    expect(switches[0]?.checked).toBe(false);
  });
});

describe("what became of it, in words and in colour", () => {
  it.each([
    [
      { kind: "running", mode: "in-process" },
      "ok",
      "pluginsAdmin.state.runningInProcess",
    ],
    [
      { kind: "running", mode: "declarative" },
      "ok",
      "pluginsAdmin.state.runningDeclarative",
    ],
    [{ kind: "idle" }, "idle", "pluginsAdmin.state.idle"],
    [{ kind: "off" }, "idle", "pluginsAdmin.state.off"],
    [{ kind: "missing" }, "problem", "pluginsAdmin.state.missing"],
    [{ kind: "unknown" }, "problem", "pluginsAdmin.state.unknown"],
    [
      { kind: "blocked", reason: "not-approved" },
      "problem",
      "pluginsAdmin.blocked.not-approved",
    ],
    [
      { kind: "invalid", issues: ["id: bad", "version: bad"] },
      "problem",
      "pluginsAdmin.state.invalid|{&quot;issues&quot;:&quot;id: bad; version: bad&quot;}",
    ],
    [
      { kind: "failed", phase: "boot", message: "no room" },
      "problem",
      "pluginsAdmin.state.failed",
    ],
  ] as const)("shows %j as %s", (state, tone, text) => {
    const html = render(
      overview({ installed: [installed({ state: state as never })] }),
    );
    expect(html).toContain(`data-tone="${tone}"`);
    expect(html).toContain(text);
  });

  it("names the phase a plugin failed in and what it said", () => {
    const html = render(
      overview({
        installed: [
          installed({
            state: { kind: "failed", phase: "import", message: "no room" },
          }),
        ],
      }),
    );
    expect(html).toContain("pluginsAdmin.phase.import");
    expect(html).toContain("no room");
  });

  it("gives each problem of a plugin that is not compatible, in order", () => {
    const html = render(
      overview({
        installed: [
          installed({
            state: {
              kind: "incompatible",
              problems: [
                { code: "host-incompatible", range: ">=9.0.0", host: "0.1.0" },
                {
                  code: "dependency-missing",
                  dependency: "notes",
                  range: "^1",
                },
                {
                  code: "dependency-version",
                  dependency: "tags",
                  range: "^2",
                  installed: "1.0.0",
                },
                {
                  code: "dependency-scope",
                  dependency: "board",
                  scope: "platform",
                  dependencyScope: "project",
                },
                { code: "dependency-unavailable", dependency: "wiki" },
                { code: "dependency-cycle", members: ["a", "b"] },
              ],
            },
          }),
        ],
      }),
    );
    const positions = [
      "problem.host-incompatible",
      "problem.dependency-missing",
      "problem.dependency-version",
      "problem.dependency-scope",
      "problem.dependency-unavailable",
      "problem.dependency-cycle",
    ].map((key) => html.indexOf(`pluginsAdmin.${key}`));
    expect(positions.every((p) => p > 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(html).toContain("&gt;=9.0.0");
  });
});

describe("the approval of its code", () => {
  it.each([
    [
      "open",
      { kind: "open" },
      "pluginsAdmin.approve",
      "pluginsAdmin.approval.open",
    ],
    [
      "outdated",
      { kind: "outdated" },
      "pluginsAdmin.approve",
      "pluginsAdmin.approval.outdated",
    ],
  ] as const)("is asked for when it is %s", (_n, approval, button, line) => {
    const html = render(overview({ installed: [installed({ approval })] }));
    expect(labels()).toContain(button);
    expect(labels()).not.toContain("pluginsAdmin.withdraw");
    expect(html).toContain(line);
  });

  it("can be withdrawn when it is given", () => {
    const html = render(overview({ installed: [installed()] }));
    expect(labels()).toContain("pluginsAdmin.withdraw");
    expect(labels()).not.toContain("pluginsAdmin.approve");
    expect(html).toContain("pluginsAdmin.approval.approved");
  });

  it.each([
    "invalid",
    "unsigned-not-allowed",
    "unsigned-code",
    "store-not-active",
  ] as const)(
    "is neither offered nor withdrawable when it cannot be given (%s), and the page says why",
    (reason) => {
      const html = render(
        overview({
          installed: [installed({ approval: { kind: "refused", reason } })],
        }),
      );
      expect(labels()).not.toContain("pluginsAdmin.approve");
      expect(labels()).not.toContain("pluginsAdmin.withdraw");
      expect(html).toContain(`pluginsAdmin.approval.refused.${reason}`);
    },
  );

  it.each([
    ["not-approved", { kind: "open" }],
    ["approval-outdated", { kind: "outdated" }],
  ] as const)(
    "is not said twice: when the state already says it is not approved (%s), the approval line stays out",
    (reason, approval) => {
      const html = render(
        overview({
          installed: [
            installed({ approval, state: { kind: "blocked", reason } }),
          ],
        }),
      );
      expect(html).toContain(`pluginsAdmin.blocked.${reason}`);
      expect(html).not.toContain("pluginsAdmin.approval.open");
      expect(html).not.toContain("pluginsAdmin.approval.outdated");
      // The button to approve it is still there.
      expect(labels()).toContain("pluginsAdmin.approve");
    },
  );

  it("is said by the approval line when the state does not say it (a plugin that no workspace has on)", () => {
    const html = render(
      overview({
        installed: [
          installed({ approval: { kind: "open" }, state: { kind: "idle" } }),
        ],
      }),
    );
    expect(html).toContain("pluginsAdmin.approval.open");
  });

  it("is said by the approval line when the state is blocked for another reason", () => {
    const html = render(
      overview({
        installed: [
          installed({
            approval: { kind: "refused", reason: "store-not-active" },
            state: { kind: "blocked", reason: "store-not-active" },
          }),
        ],
      }),
    );
    expect(html).toContain("pluginsAdmin.blocked.store-not-active");
    expect(html).toContain("pluginsAdmin.approval.refused.store-not-active");
  });

  it("says nothing about it for a plugin without code", () => {
    const html = render(
      overview({
        installed: [installed({ hasCode: false, approval: { kind: "none" } })],
      }),
    );
    expect(html).not.toContain("pluginsAdmin.approval");
    expect(labels()).not.toContain("pluginsAdmin.approve");
  });
});

describe("pressing approve", () => {
  const open = () =>
    render(
      overview({
        installed: [
          installed({
            approval: { kind: "open" },
            state: { kind: "blocked", reason: "not-approved" },
          }),
        ],
      }),
    );

  it("opens a dialog that names the plugin and says what it does", async () => {
    open();
    await press("pluginsAdmin.approve");
    const { props, options } = lastModal();
    expect(openModal).toHaveBeenCalledTimes(1);
    expect(props.title).toBe('pluginsAdmin.approveTitle|{"name":"Calendar"}');
    expect(props.confirmLabel).toBe("pluginsAdmin.approveConfirm");
    expect(options.label).toBe(props.title);
    expect(options.placement).toBeUndefined();
  });

  it("shows which version, where it comes from, which files and what it asks for, and the warning", async () => {
    open();
    await press("pluginsAdmin.approve");
    const html = noticeMarkup();
    expect(html).toContain("1.0.0");
    expect(html).toContain("https://github.com/Jafoson/barynt-plugin-store");
    expect(html).toContain(H1);
    expect(html).toContain("issues:read");
    expect(html).toContain("network:egress:api.example.com");
    expect(html).toContain("pluginsAdmin.approveAsksNote");
    expect(html).toContain("pluginsAdmin.approveWarnTitle");
    expect(html).toContain("pluginsAdmin.approveWarnBody");
    expect(html).toContain("pluginsAdmin.approveWarnFiles");
    expect(html).toContain("pluginsAdmin.approveCheck");
    expect(html).not.toContain("pluginsAdmin.unsignedWarn");
  });

  it("says when the plugin asks for nothing in particular", async () => {
    render(
      overview({
        installed: [
          installed({ approval: { kind: "open" }, capabilities: [] }),
        ],
      }),
    );
    await press("pluginsAdmin.approve");
    const html = noticeMarkup();
    expect(html).toContain("pluginsAdmin.approveAsksNone");
    expect(html).not.toContain("<ul");
  });

  it("approves the hash it showed, with the yes, and nothing else", async () => {
    open();
    await press("pluginsAdmin.approve");
    expect(await lastModal().props.onConfirm()).toBeNull();
    expect(mockApprove.mock.calls).toEqual([
      ["calendar", { hash: H1, acknowledged: true }],
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("gives back the server's reason and does not reload when the server refuses", async () => {
    open();
    await press("pluginsAdmin.approve");
    mockApprove.mockResolvedValue({ error: "The plugin has changed." });
    expect(await lastModal().props.onConfirm()).toBe("The plugin has changed.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("does nothing until the dialog is confirmed", async () => {
    open();
    await press("pluginsAdmin.approve");
    expect(mockApprove).not.toHaveBeenCalled();
  });
});

describe("withdrawing the approval", () => {
  it("asks first, with the plugin's name, and then withdraws it", async () => {
    render(overview({ installed: [installed()] }));
    await press("pluginsAdmin.withdraw");
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      title: 'pluginsAdmin.withdrawTitle|{"name":"Calendar"}',
      description: "pluginsAdmin.withdrawDesc",
      confirmLabel: "pluginsAdmin.withdraw",
      danger: true,
    });
    expect(mockRevoke.mock.calls).toEqual([["calendar"]]);
  });

  it("does nothing when the admin says no", async () => {
    confirm.mockResolvedValue(false);
    render(overview({ installed: [installed()] }));
    await press("pluginsAdmin.withdraw");
    expect(mockRevoke).not.toHaveBeenCalled();
  });
});

describe("switching a plugin off and on for the platform", () => {
  it("asks before it switches off, and then does", async () => {
    render(overview({ installed: [installed()] }));
    await switches[0]?.onChange(false);
    await settled();
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      title: 'pluginsAdmin.switchOffTitle|{"name":"Calendar"}',
      description: "pluginsAdmin.switchOffDesc",
      danger: true,
    });
    expect(mockSetStatus.mock.calls).toEqual([["calendar", false]]);
  });

  it("does not switch off when the admin says no", async () => {
    confirm.mockResolvedValue(false);
    render(overview({ installed: [installed()] }));
    await switches[0]?.onChange(false);
    await settled();
    expect(mockSetStatus).not.toHaveBeenCalled();
  });

  it("switches on without asking", async () => {
    render(overview({ installed: [installed({ platformOn: false })] }));
    await switches[0]?.onChange(true);
    await settled();
    expect(confirm).not.toHaveBeenCalled();
    expect(mockSetStatus.mock.calls).toEqual([["calendar", true]]);
  });
});

describe("uninstalling", () => {
  it("asks first, and says what it means, and then uninstalls", async () => {
    render(overview({ installed: [installed()] }));
    await press("pluginsAdmin.uninstall");
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      title: 'pluginsAdmin.uninstallTitle|{"name":"Calendar"}',
      description: "pluginsAdmin.uninstallDesc",
      danger: true,
    });
    expect(mockUninstall.mock.calls).toEqual([["calendar"]]);
  });

  it("does nothing when the admin says no", async () => {
    confirm.mockResolvedValue(false);
    render(overview({ installed: [installed()] }));
    await press("pluginsAdmin.uninstall");
    expect(mockUninstall).not.toHaveBeenCalled();
  });
});

describe("an update", () => {
  const withUpdate = (more: Partial<InstalledPlugin> = {}) =>
    render(
      overview({
        installed: [
          installed({
            source: "DIRECTORY",
            origin: null,
            unsigned: true,
            update: "1.1.0",
            ...more,
          }),
        ],
      }),
    );

  it("is offered when a newer version lies in the directory, and with its version", () => {
    withUpdate();
    expect(labels()).toContain('pluginsAdmin.update|{"version":"1.1.0"}');
  });

  it("is not offered otherwise", () => {
    render(overview({ installed: [installed()] }));
    expect(labels().some((l) => l.startsWith("pluginsAdmin.update"))).toBe(
      false,
    );
  });

  it("opens a dialog with the warning for a plugin from no store, and updates to that version with the yes", async () => {
    withUpdate();
    await press('pluginsAdmin.update|{"version":"1.1.0"}');
    const { props } = lastModal();
    expect(props.title).toBe(
      'pluginsAdmin.updateTitle|{"name":"Calendar","version":"1.1.0"}',
    );
    expect(props.confirmLabel).toBe("pluginsAdmin.updateConfirm");
    const html = noticeMarkup();
    expect(html).toContain("1.1.0");
    expect(html).toContain("pluginStores.unsignedWarnTitle");
    expect(html).toContain("pluginsAdmin.updateApprovalGone");
    expect(await props.onConfirm()).toBeNull();
    expect(mockUpdate.mock.calls).toEqual([
      ["calendar", "1.1.0", { acknowledged: true }],
    ]);
  });

  it("says the approval is withdrawn only when there is one to withdraw", async () => {
    withUpdate({ approval: { kind: "refused", reason: "unsigned-code" } });
    await press('pluginsAdmin.update|{"version":"1.1.0"}');
    expect(noticeMarkup()).not.toContain("pluginsAdmin.updateApprovalGone");
  });

  it("gives back the server's reason when it refuses", async () => {
    withUpdate();
    await press('pluginsAdmin.update|{"version":"1.1.0"}');
    mockUpdate.mockResolvedValue({
      error: "Confirm that you understand the risk.",
    });
    expect(await lastModal().props.onConfirm()).toBe(
      "Confirm that you understand the risk.",
    );
  });
});

describe("going back to the version before the last update", () => {
  const rolled = (more: Partial<InstalledPlugin> = {}) =>
    render(
      overview({
        installed: [installed({ previousVersion: "0.9.0", ...more })],
      }),
    );
  const BUTTON = 'pluginsAdmin.rollback|{"version":"0.9.0"}';

  it("is offered with the version it goes back to, when the last update left one", () => {
    rolled();
    expect(labels()).toContain(BUTTON);
  });

  it("is not offered when there is nothing to go back to", () => {
    render(overview({ installed: [installed()] }));
    expect(labels().some((l) => l.startsWith("pluginsAdmin.rollback"))).toBe(
      false,
    );
  });

  it("asks first for a plugin from a store, naming the plugin and the version, and then goes back", async () => {
    rolled();
    await press(BUTTON);
    expect(confirm.mock.calls[0]?.[0]).toMatchObject({
      title: 'pluginsAdmin.rollbackTitle|{"name":"Calendar","version":"0.9.0"}',
      description: 'pluginsAdmin.rollbackDesc|{"version":"0.9.0"}',
      confirmLabel: "pluginsAdmin.rollbackConfirm",
    });
    expect(mockRollback.mock.calls).toEqual([["calendar"]]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(openModal).not.toHaveBeenCalled();
  });

  it("does nothing when the admin says no", async () => {
    rolled();
    confirm.mockResolvedValue(false);
    await press(BUTTON);
    expect(mockRollback).not.toHaveBeenCalled();
  });

  it("shows the reason and does not reload when the server refuses", async () => {
    rolled();
    mockRollback.mockResolvedValue({
      error: "1.0.0 was withdrawn by Acme, so it is not brought back.",
    });
    await press(BUTTON);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("opens the warning for a plugin from no store instead, and goes back with the yes", async () => {
    rolled({ source: "DIRECTORY", origin: null, unsigned: true });
    await press(BUTTON);
    expect(confirm).not.toHaveBeenCalled();
    const { props, options } = lastModal();
    expect(props.title).toBe(
      'pluginsAdmin.rollbackTitle|{"name":"Calendar","version":"0.9.0"}',
    );
    expect(props.confirmLabel).toBe("pluginsAdmin.rollbackConfirm");
    expect(options.label).toBe(props.title);
    const html = noticeMarkup();
    expect(html).toContain(
      "pluginsAdmin.rollbackDesc|{&quot;version&quot;:&quot;0.9.0&quot;}",
    );
    expect(html).toContain("pluginStores.unsignedWarnTitle");
    expect(mockRollback).not.toHaveBeenCalled();
    expect(await props.onConfirm()).toBeNull();
    expect(mockRollback.mock.calls).toEqual([
      ["calendar", { acknowledged: true }],
    ]);
  });

  it("is a bottom sheet on a phone, and a dialog from a tablet up", async () => {
    rolled({ source: "DIRECTORY", origin: null, unsigned: true });
    await press(BUTTON);
    expect(lastModal().props.sheet).toBe(false);
    expect(lastModal().options.placement).toBeUndefined();
    running.phone = true;
    rolled({ source: "DIRECTORY", origin: null, unsigned: true });
    await press(BUTTON);
    expect(lastModal().props.sheet).toBe(true);
    expect(lastModal().options.placement).toBe("bottom");
  });

  it("cannot be pressed while another action is running", () => {
    running.pending = true;
    rolled();
    expect(buttons.find((b) => b.label === BUTTON)?.disabled).toBe(true);
    running.pending = false;
    rolled();
    expect(buttons.find((b) => b.label === BUTTON)?.disabled).toBe(false);
  });

  it("gives back the server's reason from that dialog", async () => {
    rolled({ source: "DIRECTORY", origin: null, unsigned: true });
    await press(BUTTON);
    mockRollback.mockResolvedValue({ error: "Confirm that you understand." });
    expect(await lastModal().props.onConfirm()).toBe(
      "Confirm that you understand.",
    );
  });
});

describe("an update in the store", () => {
  it("is pointed at, with its version, by a link to the store that starts the search for that plugin", () => {
    const html = render(
      overview({ installed: [installed({ storeUpdate: "1.1.0" })] }),
    );
    expect(html).toContain('href="/admin/plugins/store?q=calendar"');
    expect(html).toContain(
      "pluginsAdmin.storeUpdate|{&quot;version&quot;:&quot;1.1.0&quot;}",
    );
  });

  it("is not pointed at when there is none, and is not a button: it is updated where its consent is", () => {
    const none = render(overview({ installed: [installed()] }));
    expect(none).not.toContain("pluginsAdmin.storeUpdate");
    expect(none).not.toContain("?q=");
    render(overview({ installed: [installed({ storeUpdate: "1.1.0" })] }));
    expect(labels().some((l) => l.includes("storeUpdate"))).toBe(false);
  });

  it("puts the id in the address as text, whatever it holds", () => {
    const html = render(
      overview({
        installed: [installed({ id: "a b&c", storeUpdate: "1.1.0" })],
      }),
    );
    expect(html).toContain("q=a%20b%26c");
  });
});

describe("the plugin directory", () => {
  it("lists what lies there and is not installed, with what it is", () => {
    const html = render(overview({ available: [available()] }));
    expect(html).toContain("Notes");
    expect(html).toContain("Takes notes");
    expect(html).toContain("1.2.0");
    expect(html).toContain("pluginsAdmin.declarative");
  });

  it("can install it when plugins from no store are allowed, and there is no hint", () => {
    const html = render(
      overview({ available: [available()], allowUnsigned: true }),
    );
    const install = buttons.find((b) => b.label === "pluginsAdmin.install");
    expect(install?.disabled).toBe(false);
    expect(html).not.toContain("pluginsAdmin.installBlocked");
  });

  it("cannot install it while they are not allowed, and says where to allow them", () => {
    const html = render(overview({ available: [available()] }));
    expect(
      buttons.find((b) => b.label === "pluginsAdmin.install")?.disabled,
    ).toBe(true);
    expect(html).toContain("pluginsAdmin.installBlocked");
    expect(html).toContain('href="/admin/plugin-stores"');
  });

  it("does not show the hint when there is nothing to install", () => {
    const html = render(overview());
    expect(html).not.toContain("pluginsAdmin.installBlocked");
    expect(html).toContain("pluginsAdmin.emptyAvailable");
  });

  it("opens the warning for a plugin from no store, and installs that version with the yes", async () => {
    render(overview({ available: [available()], allowUnsigned: true }));
    await press("pluginsAdmin.install");
    const { props } = lastModal();
    expect(props.title).toBe(
      'pluginsAdmin.installTitle|{"name":"Notes","version":"1.2.0"}',
    );
    expect(props.confirmLabel).toBe("pluginsAdmin.installConfirm");
    const html = noticeMarkup();
    expect(html).toContain("pluginStores.unsignedWarnTitle");
    expect(html).toContain("pluginStores.unsignedWarnCheck");
    expect(html).toContain("pluginsAdmin.approveFactNoStore");
    expect(html).not.toContain("pluginsAdmin.installCode");
    expect(await props.onConfirm()).toBeNull();
    expect(mockInstall.mock.calls).toEqual([
      ["notes", "1.2.0", { acknowledged: true }],
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("says that code from no store does not run, for a plugin that has code", async () => {
    render(
      overview({
        available: [available({ hasCode: true })],
        allowUnsigned: true,
      }),
    );
    await press("pluginsAdmin.install");
    expect(noticeMarkup()).toContain("pluginsAdmin.installCode");
  });

  it("gives back the server's reason when it refuses", async () => {
    render(overview({ available: [available()], allowUnsigned: true }));
    await press("pluginsAdmin.install");
    mockInstall.mockResolvedValue({ error: "notes is installed already." });
    expect(await lastModal().props.onConfirm()).toBe(
      "notes is installed already.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("names the directory the plugins are read from", () => {
    const html = render(overview({ dir: "/data/plugins" }));
    expect(html).toContain("pluginsAdmin.dirNote");
    expect(html).toContain("/data/plugins");
  });
});

describe("when something is wrong", () => {
  it("says why the plugins could not be loaded", () => {
    const html = render(
      overview({ problem: "The plugins could not be loaded: database down" }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("pluginsAdmin.problemTitle");
    expect(html).toContain("database down");
  });

  it("says there is no directory when plugins are off without a reason", () => {
    const html = render(overview({ dir: null }));
    expect(html).toContain("pluginsAdmin.noDir");
    expect(html).not.toContain("pluginsAdmin.dirNote");
    expect(html).not.toContain("pluginsAdmin.emptyAvailable");
  });

  it("does not add that when there is a reason", () => {
    const html = render(overview({ dir: null, problem: "must be absolute" }));
    expect(html).not.toContain("pluginsAdmin.noDir");
  });

  it("lists what in the directory cannot be used, and the problems with the directory", () => {
    const html = render(
      overview({
        unusable: [
          { id: "broken", version: "1.0.0", issues: ["license: is required"] },
        ],
        issues: ["backup: is not a plugin"],
      }),
    );
    expect(html).toContain("pluginsAdmin.unusableTitle");
    expect(html).toContain("broken@1.0.0");
    expect(html).toContain("license: is required");
    expect(html).toContain("backup: is not a plugin");
  });

  it("does not show that list when there is nothing in it", () => {
    expect(render(overview())).not.toContain("pluginsAdmin.unusableTitle");
  });

  it("says nothing is installed when nothing is", () => {
    const html = render(overview());
    expect(html).toContain("pluginsAdmin.emptyInstalled");
    expect(buttons).toEqual([]);
  });
});
