import "../plugin-store-support/setup";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";
import { entry } from "../plugin-store-support/fixtures";
import {
  mockSetCurated,
  resetStarted,
  settled,
} from "../plugin-store-support/setup";

// The parts of the store page: what a plugin can do in the list, its card, the featured
// shelf, the details and the consent. The buttons and the switch are stand-ins that keep
// the functions they were given, so a test can press them.

interface Pressed {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  variant?: string;
}
let buttons: Pressed[] = [];
let switches: {
  id: string;
  checked: boolean;
  onChange: (c: boolean) => void;
  disabled?: boolean;
}[] = [];

mock.module("@/components/ui/atoms/Button/Button", () => ({
  Button: (props: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    variant?: string;
  }) => {
    const label = typeof props.children === "string" ? props.children : "";
    buttons.push({
      label,
      onClick: props.onClick,
      disabled: props.disabled,
      variant: props.variant,
    });
    return (
      <button
        type="button"
        disabled={props.disabled}
        data-variant={props.variant}
      >
        {props.children}
      </button>
    );
  },
}));
mock.module("@/components/ui/atoms/Switch/Switch", () => ({
  Switch: (props: {
    id: string;
    checked: boolean;
    onChange: (c: boolean) => void;
    disabled?: boolean;
    label: string;
  }) => {
    switches.push({
      id: props.id,
      checked: props.checked,
      onChange: props.onChange,
      disabled: props.disabled,
    });
    return (
      <input
        type="checkbox"
        id={props.id}
        checked={props.checked}
        readOnly
        aria-label={props.label}
      />
    );
  },
}));

import { FeaturedPlugins } from "@/features/plugins/components/PluginStore/FeaturedPlugins";
import { InstallFromStoreModal } from "@/features/plugins/components/PluginStore/InstallFromStoreModal";
import { PluginAction } from "@/features/plugins/components/PluginStore/PluginAction";
import { PluginAvatar } from "@/features/plugins/components/PluginStore/PluginAvatar";
import { PluginCard } from "@/features/plugins/components/PluginStore/PluginCard";
import { StoreDetailModal } from "@/features/plugins/components/PluginStore/StoreDetailModal";
import {
  PLATFORM_MODE,
  type StoreMode,
  StoreModeContext,
} from "@/features/plugins/components/PluginStore/storeMode";
import { UpdateFromStoreModal } from "@/features/plugins/components/PluginStore/UpdateFromStoreModal";
import { PluginsTabs } from "@/features/plugins/components/PluginsTabs/PluginsTabs";

const render = (node: ReactElement): string => {
  buttons = [];
  switches = [];
  resetStarted();
  return renderToStaticMarkup(node);
};
const installed = (
  update: string | null = null,
  addedCapabilities: string[] = [],
) => ({
  version: "1.0.0",
  fromThisStore: true,
  update,
  addedCapabilities,
});
const noop = () => {};

beforeEach(() => {
  mockSetCurated.mockClear();
});

describe("what can be done with a plugin in the list", () => {
  it("is an install button for a plugin that could be installed, that passes on the version to install", () => {
    const seen: unknown[] = [];
    const html = render(
      <PluginAction
        entry={entry("notes", { offered: "1.4.0" })}
        onInstall={(e, v) => seen.push([e.id, v])}
      />,
    );
    expect(html).toContain("pluginStore.install");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.variant).toBe("outline");
    buttons[0]?.onClick?.();
    expect(seen).toEqual([["notes", "1.4.0"]]);
  });

  it("can be switched off, so a page that is busy does not start a second install", () => {
    render(<PluginAction entry={entry("notes")} disabled onInstall={noop} />);
    expect(buttons[0]?.disabled).toBe(true);
  });

  it("is an update, to the version the store offers, when the installed one came from this store", () => {
    const seen: unknown[] = [];
    const html = render(
      <PluginAction
        entry={entry("notes", { installed: installed("1.1.0") })}
        onInstall={(e, v) => seen.push([e.id, v])}
      />,
    );
    expect(html).toContain(
      "pluginStore.update|{&quot;version&quot;:&quot;1.1.0&quot;}",
    );
    expect(buttons[0]?.variant).toBe("primary");
    buttons[0]?.onClick?.();
    expect(seen).toEqual([["notes", "1.1.0"]]);
  });

  it("is a mark that it is installed, and nothing to press, when there is nothing newer", () => {
    const html = render(
      <PluginAction
        entry={entry("notes", { installed: installed() })}
        onInstall={noop}
      />,
    );
    expect(html).toContain("pluginStore.installed");
    expect(buttons).toEqual([]);
  });

  it("is a mark that every version was withdrawn, and nothing to press", () => {
    const html = render(
      <PluginAction
        entry={entry("notes", { offered: null })}
        onInstall={noop}
      />,
    );
    expect(html).toContain("pluginStore.revoked");
    expect(buttons).toEqual([]);
  });

  it("is a mark that it does not fit this Barynt, with the reason on it, and nothing to press", () => {
    const html = render(
      <PluginAction
        entry={entry("notes", { compatible: false, barynt: ">=1.0.0" })}
        onInstall={noop}
      />,
    );
    expect(html).toContain("pluginStore.incompatible");
    expect(html).toContain(
      "pluginStore.incompatibleNote|{&quot;range&quot;:&quot;&gt;=1.0.0&quot;}",
    );
    expect(buttons).toEqual([]);
  });

  it("puts what is installed before what is withdrawn or incompatible, and withdrawn before incompatible", () => {
    expect(
      render(
        <PluginAction
          entry={entry("a-plugin", {
            installed: installed(),
            offered: null,
            compatible: false,
          })}
          onInstall={noop}
        />,
      ),
    ).toContain("pluginStore.installed");
    expect(
      render(
        <PluginAction
          entry={entry("a-plugin", { offered: null, compatible: false })}
          onInstall={noop}
        />,
      ),
    ).toContain("pluginStore.revoked");
  });

  it("is an update and not a mark when there is an update, whatever else is the case", () => {
    render(
      <PluginAction
        entry={entry("a-plugin", {
          installed: installed("2.0.0"),
          compatible: false,
        })}
        onInstall={noop}
      />,
    );
    expect(buttons[0]?.label).toContain("pluginStore.update");
  });
});

describe("a plugin's card", () => {
  const card = (
    e: CatalogEntry,
    more: {
      released?: boolean;
      onOpen?: (e: CatalogEntry) => void;
      onInstall?: (e: CatalogEntry, v: string) => void;
    } = {},
  ) =>
    render(
      <PluginCard
        entry={e}
        onOpen={more.onOpen ?? noop}
        onInstall={more.onInstall ?? noop}
        released={more.released}
      />,
    );

  it("says the name, the author and what the plugin is", () => {
    const html = card(
      entry("notes", {
        name: "Notes",
        author: "Mara",
        description: "Takes notes",
        scope: "PLATFORM",
        hasCode: true,
      }),
    );
    expect(html).toContain("Notes");
    expect(html).toContain("Mara");
    expect(html).toContain("Takes notes");
    expect(html).toContain("pluginStore.scopePlatform");
    expect(html).toContain("pluginStore.withCode");
  });

  it("marks a plugin of the official store as verified, and says the store of another one", () => {
    const official = card(entry("notes", { official: true }));
    expect(official).toContain('data-icon="lucide:badge-check"');
    expect(official).toContain('aria-label="pluginStore.verified"');
    const other = card(
      entry("notes", { official: false, storeName: "Acme", author: "Mara" }),
    );
    expect(other).not.toContain('aria-label="pluginStore.verified"');
    expect(other).toContain("Mara · Acme");
  });

  it("is per workspace and without code unless it says otherwise", () => {
    const html = card(entry("notes"));
    expect(html).toContain("pluginStore.scopeWorkspace");
    expect(html).toContain("pluginStore.noCode");
  });

  it("says when it applies per project", () => {
    const html = card(entry("notes", { scope: "PROJECT" }));
    expect(html).toContain("pluginStore.scopeProject");
    expect(html).not.toContain("pluginStore.scopeWorkspace");
    expect(html).not.toContain("pluginStore.scopePlatform");
  });

  it("shows that the admin released it, only when told to", () => {
    expect(card(entry("notes"), { released: true })).toContain(
      'title="pluginStore.releasedFor"',
    );
    expect(card(entry("notes"))).not.toContain("pluginStore.releasedFor");
  });

  it("has the name as the button that opens the details, named for a screen reader as what it does", () => {
    const opened: string[] = [];
    const html = card(entry("notes", { name: "Notes" }), {
      onOpen: (e) => opened.push(e.id),
    });
    expect(html).toContain('aria-label="Notes: pluginStore.open"');
  });

  it("has the action inside, so the card and the details agree", () => {
    const seen: string[] = [];
    card(entry("notes"), { onInstall: (e, v) => seen.push(`${e.id}@${v}`) });
    buttons[0]?.onClick?.();
    expect(seen).toEqual(["notes@1.0.0"]);
  });
});

describe("the featured shelf", () => {
  const shelf = (
    entries: CatalogEntry[],
    onOpen: (e: CatalogEntry) => void = noop,
  ) =>
    render(
      <FeaturedPlugins entries={entries} onOpen={onOpen} onInstall={noop} />,
    );

  it("is nothing without entries", () => {
    expect(shelf([])).toBe("");
  });

  it("shows the first one big, with up to three of what it asks for, and the others small", () => {
    const html = shelf([
      entry("big-one", {
        name: "Big one",
        capabilities: [
          "issues:read",
          "issues:write",
          "network:egress:a.com",
          "audit:read",
        ],
      }),
      entry("small-one", { name: "Small one" }),
      entry("small-two", { name: "Small two" }),
    ]);
    expect(html).toContain("pluginStore.featured");
    expect(html).toContain("Big one");
    expect(html).toContain("issues:read");
    expect(html).toContain("network:egress:a.com");
    expect(html).not.toContain("audit:read");
    expect(html).toContain("Small one");
    expect(html).toContain("Small two");
  });

  it("shows no list of what it asks for when it asks for nothing", () => {
    expect(shelf([entry("big-one")])).not.toContain("<ul");
  });

  it("shows only the big one when there is only one", () => {
    const html = shelf([entry("big-one", { name: "Big one" })]);
    expect(html).toContain("Big one");
    expect(html.match(/<article/g)).toHaveLength(1);
  });

  it("marks the official ones as verified in each place", () => {
    const html = shelf([
      entry("big-one"),
      entry("small-one", { official: false }),
    ]);
    expect(html.match(/aria-label="pluginStore\.verified"/g)).toHaveLength(1);
  });
});

describe("an avatar", () => {
  it("has the letters of the name and a colour from the id, and is hidden from a screen reader", () => {
    const html = render(<PluginAvatar id="notes" name="Notes app" size={3} />);
    expect(html).toContain("NA");
    expect(html).toContain("--hue:");
    expect(html).toContain("--size:3rem");
    expect(html).toContain('aria-hidden="true"');
  });
});

describe("the tabs", () => {
  it("are two links to the two pages, and mark the one that is open", () => {
    const store = render(<PluginsTabs active="store" />);
    expect(store).toContain('href="/admin/plugins"');
    expect(store).toContain('href="/admin/plugins/store"');
    expect(store.match(/aria-current="page"/g)).toHaveLength(1);
    expect(store.indexOf('aria-current="page"')).toBeGreaterThan(
      store.indexOf('href="/admin/plugins/store"') - 40,
    );
    const installedPage = render(<PluginsTabs active="installed" />);
    expect(installedPage.match(/aria-current="page"/g)).toHaveLength(1);
    expect(installedPage.indexOf('aria-current="page"')).toBeLessThan(
      installedPage.indexOf('href="/admin/plugins/store"'),
    );
  });
});

describe("the tabs on a project's pages", () => {
  const base = "/nimbus/project/web-app/settings/plugins";

  it("are links to that project's own two pages, and none to the platform's or a workspace's", () => {
    const html = render(<PluginsTabs active="store" basePath={base} />);
    expect(html).toContain(`href="${base}"`);
    expect(html).toContain(`href="${base}/store"`);
    expect(html).not.toContain("/admin");
    expect(html).not.toContain("/ws-");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    const installedPage = render(
      <PluginsTabs active="installed" basePath={base} />,
    );
    expect(installedPage.match(/aria-current="page"/g)).toHaveLength(1);
    expect(installedPage.indexOf('aria-current="page"')).toBeLessThan(
      installedPage.indexOf(`href="${base}/store"`),
    );
  });

  it("go by the project's address when both a workspace and a project are given: the project is the more specific", () => {
    const html = render(
      <PluginsTabs active="store" workspaceId="ws-7" basePath={base} />,
    );
    expect(html).toContain(`href="${base}/store"`);
    expect(html).not.toContain("/ws-7/");
  });
});

describe("the tabs on a workspace's pages", () => {
  it("are links to that workspace's own two pages, and none to the platform's", () => {
    const html = render(<PluginsTabs active="store" workspaceId="ws-7" />);
    expect(html).toContain('href="/ws-7/settings/plugins"');
    expect(html).toContain('href="/ws-7/settings/plugins/store"');
    expect(html).not.toContain("/admin");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    const installedPage = render(
      <PluginsTabs active="installed" workspaceId="ws-7" />,
    );
    expect(installedPage.indexOf('aria-current="page"')).toBeLessThan(
      installedPage.indexOf('href="/ws-7/settings/plugins/store"'),
    );
  });
});

describe("the details", () => {
  const details = (
    e: CatalogEntry,
    more: {
      released?: boolean;
      curatedOnly?: boolean;
      onRelease?: (r: boolean) => Promise<string | null>;
      onInstall?: (e: CatalogEntry, v: string) => void;
      sheet?: boolean;
    } = {},
  ) =>
    render(
      <StoreDetailModal
        entry={e}
        released={more.released ?? false}
        curatedOnly={more.curatedOnly ?? false}
        onRelease={more.onRelease ?? (async () => null)}
        onInstall={more.onInstall ?? noop}
        close={noop}
        sheet={more.sheet}
      />,
    );
  const rich = entry("notes", {
    name: "Notes",
    author: "Mara",
    description: "Takes notes next to issues",
    license: "Apache-2.0",
    barynt: "^0.1.0",
    homepage: "https://example.com/notes",
    repository: "https://github.com/mara/notes",
    capabilities: ["issues:read", "network:egress:api.example.com"],
    versions: [
      {
        version: "1.2.0",
        released: "2026-09-20",
        changelog: "https://example.com/c/1.2.0",
        revoked: false,
        revokedReason: null,
      },
      {
        version: "1.1.0",
        released: null,
        changelog: null,
        revoked: true,
        revokedReason: "leaked a token",
      },
      {
        version: "1.0.0",
        released: null,
        changelog: null,
        revoked: true,
        revokedReason: null,
      },
    ],
    offered: "1.2.0",
  });

  it("says what the plugin is, who wrote it, where it comes from and how it is licensed", () => {
    const html = details(rich);
    expect(html).toContain("Notes");
    expect(html).toContain(
      "pluginStore.by|{&quot;author&quot;:&quot;Mara&quot;}",
    );
    expect(html).toContain("Takes notes next to issues");
    expect(html).toContain("Official");
    expect(html).toContain("1.2.0");
    expect(html).toContain("Apache-2.0");
    expect(html).toContain("^0.1.0");
  });

  it("links to the homepage and the source, out of the app and without handing over the opener", () => {
    const html = details(rich);
    for (const href of [
      "https://example.com/notes",
      "https://github.com/mara/notes",
      "https://example.com/c/1.2.0",
    ]) {
      expect(html).toContain(`href="${href}"`);
    }
    const anchors = html.match(/<a [^>]*>/g) ?? [];
    expect(anchors.length).toBeGreaterThanOrEqual(3);
    for (const a of anchors) {
      expect(a).toContain('rel="noopener noreferrer"');
      expect(a).toContain('target="_blank"');
    }
  });

  it("leaves out the links a plugin does not have", () => {
    const html = details(entry("notes"));
    expect(html).not.toContain("pluginStore.detailHomepage");
    expect(html).not.toContain("pluginStore.detailRepository");
  });

  it("lists what it asks for with the note that it is a promise, or says that it asks for nothing", () => {
    const html = details(rich);
    expect(html).toContain("issues:read");
    expect(html).toContain("network:egress:api.example.com");
    expect(html).toContain("pluginStore.capabilitiesNote");
    expect(details(entry("notes"))).toContain("pluginStore.capabilitiesNone");
  });

  it("lists the versions, each with what the store says of it, and marks the withdrawn ones with the reason", () => {
    const html = details(rich);
    expect(html).toContain("1.2.0");
    expect(html).toContain("pluginStore.versionReleased");
    expect(html).toContain("pluginStore.versionChangelog");
    expect(html).toContain(
      "pluginStore.versionRevokedReason|{&quot;reason&quot;:&quot;leaked a token&quot;}",
    );
    expect(html).toContain("pluginStore.versionRevoked");
  });

  it("shows at most the ten newest versions", () => {
    const many = entry("notes", {
      versions: Array.from({ length: 14 }, (_, i) => ({
        version: `1.${14 - i}.0`,
        released: null,
        changelog: null,
        revoked: false,
        revokedReason: null,
      })),
    });
    const html = details(many);
    expect(html.match(/versionNumber/g)).toHaveLength(10);
    expect(html).toContain("1.14.0");
    expect(html).not.toContain("1.4.0<");
  });

  it("warns when it does not fit this Barynt, and when every version was withdrawn", () => {
    expect(
      details(entry("notes", { compatible: false, barynt: ">=1.0.0" })),
    ).toContain("pluginStore.incompatibleNote");
    expect(details(entry("notes", { offered: null }))).toContain(
      "pluginStore.revokedNote",
    );
    const fine = details(entry("notes"));
    expect(fine).not.toContain("pluginStore.incompatibleNote");
    expect(fine).not.toContain("pluginStore.revokedNote");
  });

  it("says which version is installed when one is", () => {
    expect(
      details(entry("notes", { installed: installed("1.1.0") })),
    ).toContain("pluginStore.detailInstalled");
    expect(details(entry("notes"))).not.toContain(
      "pluginStore.detailInstalled",
    );
  });

  it("has the release switch as it is, and says whether the release counts", () => {
    const off = details(entry("notes"), {
      released: false,
      curatedOnly: false,
    });
    expect(switches).toEqual([
      expect.objectContaining({
        id: "store-release-store-1/notes",
        checked: false,
      }),
    ]);
    expect(off).toContain("pluginStore.curationOff");
    expect(off).toContain("pluginStore.curationInactive");
    const on = details(entry("notes"), { released: true, curatedOnly: true });
    expect(switches[0]?.checked).toBe(true);
    expect(on).toContain("pluginStore.curationOn");
    expect(on).not.toContain("pluginStore.curationInactive");
  });

  it("releases and withdraws through the action it was given", async () => {
    const seen: boolean[] = [];
    details(entry("notes"), {
      onRelease: async (r) => {
        seen.push(r);
        return null;
      },
    });
    switches[0]?.onChange(true);
    switches[0]?.onChange(false);
    await settled();
    expect(seen).toEqual([true, false]);
  });

  it("puts the install button in the footer, and closes before it starts", () => {
    const seen: string[] = [];
    render(
      <StoreDetailModal
        entry={entry("notes")}
        released={false}
        curatedOnly={false}
        onRelease={async () => null}
        onInstall={(e, v) => seen.push(`install ${e.id}@${v}`)}
        close={() => seen.push("close")}
      />,
    );
    buttons.find((b) => b.label.includes("pluginStore.install"))?.onClick?.();
    expect(seen).toEqual(["close", "install notes@1.0.0"]);
  });

  it("has a close button in a dialog and none in a sheet, where swiping closes it", () => {
    details(entry("notes"), { sheet: false });
    expect(buttons.some((b) => b.label === "pluginStore.close")).toBe(true);
    details(entry("notes"), { sheet: true });
    expect(buttons.some((b) => b.label === "pluginStore.close")).toBe(false);
  });
});

describe("the consent before installing", () => {
  const consent = (e: CatalogEntry, version = "1.0.0") => {
    const element = InstallFromStoreModal({
      entry: e,
      version,
      onConfirm: async () => null,
      close: noop,
      sheet: true,
    });
    return element as ReactElement<{
      title: string;
      confirmLabel: string;
      sheet?: boolean;
      notice: (s: {
        checked: boolean;
        onChange: (c: boolean) => void;
        disabled: boolean;
      }) => ReactNode;
      onConfirm: () => Promise<string | null>;
    }>;
  };
  const noticeOf = (e: CatalogEntry) =>
    renderToStaticMarkup(
      <>
        {consent(e).props.notice({
          checked: false,
          onChange: noop,
          disabled: false,
        })}
      </>,
    );

  it("is named for the plugin and the version, and confirms with install", () => {
    const { props } = consent(entry("notes", { name: "Notes" }), "2.0.0");
    expect(props.title).toBe(
      'pluginStore.installTitle|{"name":"Notes","version":"2.0.0"}',
    );
    expect(props.confirmLabel).toBe("pluginStore.installConfirm");
    expect(props.sheet).toBe(true);
  });

  it("shows the store, the version and what the plugin asks for", () => {
    const html = noticeOf(
      entry("notes", { capabilities: ["issues:read"], storeName: "Acme" }),
    );
    expect(html).toContain("Acme");
    expect(html).toContain("issues:read");
    expect(html).toContain("pluginStore.capabilitiesNote");
  });

  it("says that the code of a plugin with code waits for approval, and that one without runs at once when switched on", () => {
    expect(noticeOf(entry("notes", { hasCode: true }))).toContain(
      "pluginStore.installCodeNote",
    );
    expect(noticeOf(entry("notes", { hasCode: true }))).not.toContain(
      "pluginStore.installNoCodeNote",
    );
    expect(noticeOf(entry("notes"))).toContain("pluginStore.installNoCodeNote");
  });

  it("has the box that says it was read, and says installing switches nothing on", () => {
    const html = noticeOf(entry("notes"));
    expect(html).toContain("pluginStore.installWarnTitle");
    expect(html).toContain("pluginStore.installWarnBody");
    expect(html).toContain("pluginStore.installCheck");
    expect(html).toContain('type="checkbox"');
  });

  it("passes on what installing does, unchanged", async () => {
    const seen: string[] = [];
    const element = InstallFromStoreModal({
      entry: entry("notes"),
      version: "1.0.0",
      onConfirm: async () => {
        seen.push("go");
        return "no";
      },
      close: noop,
    }) as ReactElement<{ onConfirm: () => Promise<string | null> }>;
    expect(await element.props.onConfirm()).toBe("no");
    expect(seen).toEqual(["go"]);
  });
});

describe("the consent before updating", () => {
  type Element = ReactElement<{
    title: string;
    confirmLabel: string;
    sheet?: boolean;
    notice: (s: {
      checked: boolean;
      onChange: (c: boolean) => void;
      disabled: boolean;
    }) => ReactNode;
    onConfirm: () => Promise<string | null>;
  }>;
  const consent = (e: CatalogEntry, version = "1.1.0"): Element =>
    UpdateFromStoreModal({
      entry: e,
      version,
      onConfirm: async () => null,
      close: noop,
      sheet: true,
    }) as Element;
  const noticeOf = (e: CatalogEntry) =>
    renderToStaticMarkup(
      <>
        {consent(e).props.notice({
          checked: false,
          onChange: noop,
          disabled: false,
        })}
      </>,
    );
  const updating = (more: Partial<CatalogEntry> = {}, added: string[] = []) =>
    entry("notes", {
      name: "Notes",
      storeName: "Acme",
      installed: installed("1.1.0", added),
      ...more,
    });

  it("is named for the plugin and the version, and confirms with update", () => {
    const { props } = consent(updating(), "1.1.0");
    expect(props.title).toBe(
      'pluginStore.updateTitle|{"name":"Notes","version":"1.1.0"}',
    );
    expect(props.confirmLabel).toBe("pluginStore.updateConfirm");
    expect(props.sheet).toBe(true);
  });

  it("shows the store, the new version and the version that is installed", () => {
    const html = noticeOf(updating());
    expect(html).toContain("Acme");
    expect(html).toContain("1.1.0");
    expect(html).toContain("pluginStore.detailInstalled");
  });

  it("names what it asks for in addition, set apart from everything it asks for", () => {
    const html = noticeOf(
      updating({ capabilities: ["issues:read", "issues:write"] }, [
        "issues:write",
      ]),
    );
    const [before, after] = html.split("pluginStore.updateAdded");
    expect(after).toBeDefined();
    const added = (after ?? "").split("pluginStore.capabilities")[0] ?? "";
    expect(added).toContain("issues:write");
    expect(added).not.toContain("issues:read");
    expect(before).not.toContain("issues:write");
    // The whole list follows, so what it asks for altogether is seen too.
    expect(html.split("pluginStore.capabilities")[1]).toContain("issues:read");
    expect(html).not.toContain("pluginStore.updateAddedNone");
  });

  it("says so when it asks for nothing more", () => {
    const html = noticeOf(updating({ capabilities: ["issues:read"] }));
    expect(html).toContain("pluginStore.updateAddedNone");
    expect(html).not.toMatch(/pluginStore\.updateAdded(?!None)/);
  });

  it("says that the approval of a plugin with code does not carry over, and what an update of one without changes", () => {
    expect(noticeOf(updating({ hasCode: true }))).toContain(
      "pluginStore.updateCodeNote",
    );
    expect(noticeOf(updating({ hasCode: true }))).not.toContain(
      "pluginStore.updateNoCodeNote",
    );
    expect(noticeOf(updating())).toContain("pluginStore.updateNoCodeNote");
    expect(noticeOf(updating())).not.toContain("pluginStore.updateCodeNote");
  });

  it("says that the old files stay so that it can be undone", () => {
    expect(noticeOf(updating())).toContain("pluginStore.updateBackNote");
  });

  it("has the box that says it was read, and says whose files replace the installed ones", () => {
    const html = noticeOf(updating());
    expect(html).toContain("pluginStore.updateWarnTitle");
    expect(html).toContain(
      "pluginStore.updateWarnBody|{&quot;store&quot;:&quot;Acme&quot;}",
    );
    expect(html).toContain("pluginStore.updateCheck");
    expect(html).toContain('type="checkbox"');
  });

  it("hands the box its state: ticked and locked as the dialog says", () => {
    const markup = (checked: boolean, disabled: boolean) =>
      renderToStaticMarkup(
        <>
          {consent(updating()).props.notice({
            checked,
            onChange: noop,
            disabled,
          })}
        </>,
      );
    expect(markup(false, false)).not.toContain("checked");
    expect(markup(false, false)).not.toContain("disabled");
    expect(markup(true, false)).toContain("checked");
    expect(markup(false, true)).toContain("disabled");
  });

  it("is for a plugin that has no update record too: nothing is added then", () => {
    const html = noticeOf(entry("notes"));
    expect(html).toContain("pluginStore.updateAddedNone");
  });

  it("passes on what updating does, unchanged", async () => {
    const seen: string[] = [];
    const element = UpdateFromStoreModal({
      entry: updating(),
      version: "1.1.0",
      onConfirm: async () => {
        seen.push("go");
        return "no";
      },
      close: noop,
    }) as Element;
    expect(await element.props.onConfirm()).toBe("no");
    expect(seen).toEqual(["go"]);
  });
});

describe("in a project's store", () => {
  const mode = (more: Partial<StoreMode> = {}): StoreMode => ({
    ...PLATFORM_MODE,
    level: "project",
    ...more,
  });
  const inMode = (m: StoreMode, e: CatalogEntry, seen: string[] = []) =>
    render(
      <StoreModeContext.Provider value={m}>
        <PluginAction
          entry={e}
          onInstall={(x, v) => seen.push(`add ${x.id}@${v}`)}
        />
      </StoreModeContext.Provider>,
    );

  it("says add in its own words, where the platform's page says install and a workspace's says its own add", () => {
    const html = inMode(mode(), entry("notes", { offered: "1.4.0" }));
    expect(html).toContain("projectStore.add");
    expect(html).not.toContain("workspaceStore.add");
    expect(html).not.toContain("pluginStore.install<");
  });

  it("adds what it was offered, with the version on offer", () => {
    const seen: string[] = [];
    inMode(mode(), entry("notes", { offered: "1.4.0" }), seen);
    buttons[0]?.onClick?.();
    expect(seen).toEqual(["add notes@1.4.0"]);
  });

  it("is a button to switch on, in its own words, for a plugin the platform has and this project has not", () => {
    const switched: string[] = [];
    const html = inMode(
      mode({
        switchOn: new Set(["notes"]),
        onSwitchOn: (e) => switched.push(e.id),
      }),
      entry("notes"),
    );
    expect(html).toContain("projectStore.switchOn");
    expect(html).not.toContain("workspaceStore.switchOn");
    buttons[0]?.onClick?.();
    expect(switched).toEqual(["notes"]);
  });

  it("has a consent in its own words: adding for the whole platform, and switching on in the project", () => {
    const element = InstallFromStoreModal({
      entry: entry("notes", { name: "Notes", hasCode: true }),
      version: "2.0.0",
      onConfirm: async () => null,
      close: noop,
      level: "project",
    }) as ReactElement<{
      title: string;
      confirmLabel: string;
      notice: (s: {
        checked: boolean;
        onChange: (c: boolean) => void;
        disabled: boolean;
      }) => ReactNode;
    }>;
    expect(element.props.title).toBe(
      'projectStore.installTitle|{"name":"Notes","version":"2.0.0"}',
    );
    expect(element.props.confirmLabel).toBe("projectStore.installConfirm");
    const html = renderToStaticMarkup(
      element.props.notice({ checked: false, onChange: noop, disabled: false }),
    );
    expect(html).toContain("projectStore.installCodeNote");
    expect(html).toContain("projectStore.installWarnBody");
    expect(html).toContain("projectStore.installCheck");
    expect(html).not.toContain("workspaceStore.");
    expect(html).not.toContain("pluginStore.installWarnBody");
  });
});

describe("in a workspace's store", () => {
  const mode = (more: Partial<StoreMode> = {}): StoreMode => ({
    ...PLATFORM_MODE,
    level: "workspace",
    ...more,
  });
  const inMode = (m: StoreMode, e: CatalogEntry, seen: string[] = []) =>
    render(
      <StoreModeContext.Provider value={m}>
        <PluginAction
          entry={e}
          onInstall={(x, v) => seen.push(`add ${x.id}@${v}`)}
        />
      </StoreModeContext.Provider>,
    );

  it("says add where the platform's page says install", () => {
    const html = inMode(mode(), entry("notes", { offered: "1.4.0" }));
    expect(html).toContain("workspaceStore.add");
    expect(html).not.toContain("pluginStore.install<");
    const platform = inMode(
      PLATFORM_MODE,
      entry("notes", { offered: "1.4.0" }),
    );
    expect(platform).toContain("pluginStore.install");
    expect(platform).not.toContain("workspaceStore.add");
  });

  it("adds what it was offered, with the version on offer", () => {
    const seen: string[] = [];
    inMode(mode(), entry("notes", { offered: "1.4.0" }), seen);
    buttons[0]?.onClick?.();
    expect(seen).toEqual(["add notes@1.4.0"]);
  });

  it("is a button to switch on for a plugin the platform has and this workspace has not, and nothing is added", () => {
    const seen: string[] = [];
    const switched: string[] = [];
    const html = inMode(
      mode({
        switchOn: new Set(["notes"]),
        onSwitchOn: (e) => switched.push(e.id),
      }),
      entry("notes"),
      seen,
    );
    expect(html).toContain("workspaceStore.switchOn");
    expect(html).not.toContain("workspaceStore.add");
    buttons[0]?.onClick?.();
    expect(switched).toEqual(["notes"]);
    expect(seen).toEqual([]);
  });

  it("switches on a plugin whose store entry does not fit or was withdrawn, since nothing is downloaded", () => {
    const withdrawn = inMode(
      mode({ switchOn: new Set(["notes"]), onSwitchOn: () => {} }),
      entry("notes", { offered: null }),
    );
    expect(withdrawn).toContain("workspaceStore.switchOn");
    const unfit = inMode(
      mode({ switchOn: new Set(["notes"]), onSwitchOn: () => {} }),
      entry("notes", { compatible: false }),
    );
    expect(unfit).toContain("workspaceStore.switchOn");
  });

  it("does not offer the switch for another plugin, or on the platform's page, or without a way to run it", () => {
    expect(
      inMode(
        mode({ switchOn: new Set(["wiki"]), onSwitchOn: () => {} }),
        entry("notes"),
      ),
    ).toContain("workspaceStore.add");
    expect(
      inMode(
        {
          ...PLATFORM_MODE,
          switchOn: new Set(["notes"]),
          onSwitchOn: () => {},
        },
        entry("notes"),
      ),
    ).toContain("pluginStore.install");
    expect(
      inMode(mode({ switchOn: new Set(["notes"]) }), entry("notes")),
    ).toContain("workspaceStore.add");
  });

  it("says a plugin that is on here is installed, and never offers an update", () => {
    const html = inMode(
      mode({ switchOn: new Set(["notes"]), onSwitchOn: () => {} }),
      entry("notes", { installed: installed(null) }),
    );
    expect(html).toContain("pluginStore.installed");
    expect(html).not.toContain("workspaceStore.switchOn");
    expect(html).not.toContain("workspaceStore.add");
  });

  it("has a consent in its own words: adding for the whole platform, and switching on here", () => {
    const element = InstallFromStoreModal({
      entry: entry("notes", { name: "Notes", hasCode: true }),
      version: "2.0.0",
      onConfirm: async () => null,
      close: noop,
      level: "workspace",
    }) as ReactElement<{
      title: string;
      confirmLabel: string;
      notice: (s: {
        checked: boolean;
        onChange: (c: boolean) => void;
        disabled: boolean;
      }) => ReactNode;
    }>;
    expect(element.props.title).toBe(
      'workspaceStore.installTitle|{"name":"Notes","version":"2.0.0"}',
    );
    expect(element.props.confirmLabel).toBe("workspaceStore.installConfirm");
    const html = renderToStaticMarkup(
      element.props.notice({
        checked: false,
        onChange: noop,
        disabled: false,
      }),
    );
    expect(html).toContain("workspaceStore.installCodeNote");
    expect(html).toContain("workspaceStore.installWarnBody");
    expect(html).toContain("workspaceStore.installCheck");
    expect(html).not.toContain("pluginStore.installWarnBody");
    expect(html).not.toContain("pluginStore.installCheck");
    const none = InstallFromStoreModal({
      entry: entry("notes"),
      version: "1.0.0",
      onConfirm: async () => null,
      close: noop,
      level: "workspace",
    }) as typeof element;
    expect(
      renderToStaticMarkup(
        none.props.notice({
          checked: false,
          onChange: noop,
          disabled: false,
        }),
      ),
    ).toContain("workspaceStore.installNoCodeNote");
  });

  it("has details without the release block when there is no way to release", () => {
    const html = render(
      <StoreDetailModal
        entry={entry("notes")}
        released={false}
        curatedOnly={false}
        onInstall={noop}
        close={noop}
      />,
    );
    expect(html).not.toContain("pluginStore.curationTitle");
    expect(switches).toEqual([]);
    expect(html).toContain("pluginStore.versions");
  });
});
