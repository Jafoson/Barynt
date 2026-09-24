import "../plugin-store-support/setup";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ComponentProps, ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { CatalogEntry } from "@/lib/plugins/store/catalog";
import { entry, view } from "../plugin-store-support/fixtures";
import {
  mockInstall,
  mockSetCurated,
  openModal,
  refresh,
  resetStarted,
} from "../plugin-store-support/setup";

// The plugin store page. The cards and the featured shelf are stand-ins that keep the
// functions they were given, so a test can press them and see what opens and which action
// runs with which arguments. What matters: what is shown for each state a store can be in,
// that a store that could not be read says so instead of looking empty, and that each
// dialog passes on exactly the store, the plugin, the version and the yes it was shown.

const cards: {
  entry: CatalogEntry;
  released?: boolean;
  onOpen: (e: CatalogEntry) => void;
  onInstall: (e: CatalogEntry, v: string) => void;
}[] = [];
const featuredShown: CatalogEntry[][] = [];

mock.module("@/features/plugins/components/PluginStore/PluginCard", () => ({
  PluginCard: (props: (typeof cards)[number]) => {
    cards.push(props);
    return <div data-card={props.entry.key} />;
  },
}));
mock.module(
  "@/features/plugins/components/PluginStore/FeaturedPlugins",
  () => ({
    FeaturedPlugins: (props: { entries: CatalogEntry[] }) => {
      featuredShown.push(props.entries);
      return <div data-featured={props.entries.map((e) => e.id).join(",")} />;
    },
  }),
);

import { PluginStore } from "@/features/plugins/components/PluginStore/PluginStore";
import type { StoreCatalogView } from "@/features/plugins/storeQueries";

function render(
  v: StoreCatalogView,
  initial?: ComponentProps<typeof PluginStore>["initial"],
): string {
  cards.length = 0;
  featuredShown.length = 0;
  resetStarted();
  return renderToStaticMarkup(<PluginStore view={v} initial={initial} />);
}

const dated = (
  id: string,
  released: string,
  more: Partial<CatalogEntry> = {},
) =>
  entry(id, {
    versions: [
      {
        version: "1.0.0",
        released,
        changelog: null,
        revoked: false,
        revokedReason: null,
      },
    ],
    ...more,
  });

const four = () => [
  dated("a-plugin", "2026-01-01"),
  dated("b-plugin", "2026-02-01"),
  dated("c-plugin", "2026-03-01"),
  dated("d-plugin", "2026-04-01"),
];

beforeEach(() => {
  for (const m of [openModal, refresh, mockInstall, mockSetCurated])
    m.mockClear();
  mockInstall.mockResolvedValue({ ok: true });
  mockSetCurated.mockResolvedValue({ ok: true });
});

describe("the page", () => {
  it("has the title, the tabs, the hero with the search, and a card for each plugin", () => {
    const html = render(view({ entries: four() }));
    expect(html).toContain("pluginStore.title");
    expect(html).toContain('href="/admin/plugins/store"');
    expect(html).toContain("pluginStore.heroTitle");
    expect(html).toContain("pluginStore.heroText");
    expect(html).toContain('placeholder="pluginStore.searchPlaceholder"');
    expect(cards.map((c) => c.entry.id)).toEqual([
      "a-plugin",
      "b-plugin",
      "c-plugin",
      "d-plugin",
    ]);
  });

  it("counts the categories, all of them first, and the installed ones next to the view", () => {
    const html = render(
      view({
        entries: [
          entry("a-plugin", { categories: ["planning", "other"] }),
          entry("b-plugin", {
            categories: ["planning"],
            installed: { version: "1.0.0", fromThisStore: true, update: null },
          }),
          entry("c-plugin", { categories: ["reporting"] }),
        ],
      }),
    );
    expect(html).toContain("pluginStore.all");
    expect(html).toContain("pluginStore.category.planning");
    expect(html).toContain("pluginStore.category.reporting");
    expect(html).toContain("pluginStore.category.other");
    expect(html).not.toContain("pluginStore.category.security");
    expect(html).toContain("pluginStore.viewDiscover");
    expect(html).toContain("pluginStore.viewInstalled");
    expect(html).toMatch(/pluginStore\.viewInstalled 1/);
  });

  it("has no filters and no grid when there is nothing to list", () => {
    const html = render(view());
    expect(html).not.toContain("pluginStore.viewDiscover");
    expect(cards).toEqual([]);
    expect(html).toContain("pluginStore.noEntries");
  });
});

describe("the featured shelf", () => {
  it("shows the most recently released when there are enough plugins", () => {
    const html = render(view({ entries: four() }));
    expect(featuredShown[0]?.map((e) => e.id)).toEqual([
      "d-plugin",
      "c-plugin",
      "b-plugin",
    ]);
    expect(html).toContain('data-featured="d-plugin,c-plugin,b-plugin"');
  });

  it("is not shown for a small store", () => {
    render(view({ entries: four().slice(0, 3) }));
    expect(featuredShown).toEqual([]);
  });
});

describe("searching and filtering", () => {
  const some = () => [
    dated("notes", "2026-01-01", {
      categories: ["planning"],
      keywords: ["writing"],
    }),
    dated("gantt", "2026-02-01", { categories: ["planning", "reporting"] }),
    dated("board", "2026-03-01", {
      categories: ["reporting"],
      installed: { version: "1.0.0", fromThisStore: true, update: null },
    }),
    dated("wiki", "2026-04-01", { categories: ["other"] }),
  ];

  it("lists what the search matches, and no shelf while someone is searching", () => {
    const html = render(view({ entries: some() }), { query: "writing" });
    expect(cards.map((c) => c.entry.id)).toEqual(["notes"]);
    expect(featuredShown).toEqual([]);
    expect(html).not.toContain("data-featured");
  });

  it("lists one category, and no shelf while one is open", () => {
    render(view({ entries: some() }), { category: "reporting" });
    expect(cards.map((c) => c.entry.id)).toEqual(["gantt", "board"]);
    expect(featuredShown).toEqual([]);
  });

  it("lists what is installed under installed, and no shelf there", () => {
    render(view({ entries: some() }), { view: "installed" });
    expect(cards.map((c) => c.entry.id)).toEqual(["board"]);
    expect(featuredShown).toEqual([]);
  });

  it("counts the categories over what the search leaves", () => {
    const html = render(view({ entries: some() }), { query: "gantt" });
    expect(html).toContain("pluginStore.category.planning");
    expect(html).toContain("pluginStore.category.reporting");
    expect(html).not.toContain("pluginStore.category.other");
  });

  it("says nothing was found for what was typed, with the words", () => {
    const html = render(view({ entries: some() }), { query: "  zzz  " });
    expect(cards).toEqual([]);
    expect(html).toContain(
      "pluginStore.noResults|{&quot;query&quot;:&quot;zzz&quot;}",
    );
  });

  it("says nothing is in a category or installed, in each case", () => {
    expect(
      render(view({ entries: some() }), { category: "security" }),
    ).toContain("pluginStore.noResultsCategory");
    expect(
      render(view({ entries: [entry("a-plugin")] }), { view: "installed" }),
    ).toContain("pluginStore.noInstalled");
  });

  it("starts with the search field showing what was typed", () => {
    expect(render(view({ entries: some() }), { query: "gantt" })).toContain(
      'value="gantt"',
    );
  });
});

describe("what a store can be in", () => {
  const store = (more: object = {}) => ({
    id: "store-1",
    name: "Official",
    official: true,
    error: null,
    errorCode: null,
    syncedAt: null,
    problems: [],
    ...more,
  });

  it("says so, with a way to switch one on, when no store is on", () => {
    const html = render(view({ stores: [] }));
    expect(html).toContain("pluginStore.noStores");
    expect(html).toContain('href="/admin/plugin-stores"');
    expect(html).not.toContain("pluginStore.noEntries");
  });

  it("says a store was not fetched yet, as a plain notice and not as a fault", () => {
    const html = render(
      view({
        stores: [
          store({
            error: "The store has not been fetched yet.",
            errorCode: "not-fetched",
          }),
        ],
      }),
    );
    expect(html).toContain(
      "pluginStore.storeNotFetched|{&quot;store&quot;:&quot;Official&quot;}",
    );
    expect(html).not.toContain('role="alert"');
    expect(html).toContain("pluginStore.notFetchedHint");
    expect(html).not.toContain("pluginStore.noEntries");
  });

  it("says why a store cannot be read, as an alert, in the server's words", () => {
    const html = render(
      view({
        stores: [
          store({
            error: "Not a store: store.json is missing.",
            errorCode: "unreadable",
          }),
        ],
      }),
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("Not a store: store.json is missing.");
    expect(html).toContain("pluginStore.notFetchedHint");
  });

  it("says how many entries of a store cannot be used", () => {
    const html = render(
      view({
        entries: four(),
        stores: [
          store({
            problems: [
              { id: "bad-one", issues: ["x"] },
              { id: "bad-two", issues: ["y"] },
            ],
          }),
        ],
      }),
    );
    expect(html).toContain(
      "pluginStore.storeProblems|{&quot;count&quot;:2,&quot;store&quot;:&quot;Official&quot;}",
    );
  });

  it("lists what the stores that could be read have, though another could not", () => {
    render(
      view({
        entries: four(),
        stores: [
          store(),
          store({
            id: "store-2",
            name: "Acme",
            error: "gone",
            errorCode: "unreadable",
          }),
        ],
      }),
    );
    expect(cards).toHaveLength(4);
  });

  it("says why plugins are off, as an alert, and not that there is no store", () => {
    const html = render(
      view({
        stores: [],
        problem: "BARYNT_PLUGINS_DIR must be an absolute path",
      }),
    );
    expect(html).toContain("must be an absolute path");
    expect(html).not.toContain("pluginStore.noStores");
  });
});

describe("what a card is told", () => {
  it("says whether the admin released the plugin, only where the release counts", () => {
    render(
      view({
        entries: four(),
        released: ["store-1/b-plugin"],
        visibility: { inWorkspaces: true, inProjects: true, curatedOnly: true },
      }),
    );
    expect(
      Object.fromEntries(cards.map((c) => [c.entry.id, c.released])),
    ).toEqual({
      "a-plugin": false,
      "b-plugin": true,
      "c-plugin": false,
      "d-plugin": false,
    });
    render(view({ entries: four(), released: ["store-1/b-plugin"] }));
    expect(cards.every((c) => !c.released)).toBe(true);
  });

  it("does not take a release of the same plugin in another store for this one", () => {
    render(
      view({
        entries: [entry("notes", { key: "store-2/notes", storeId: "store-2" })],
        released: ["store-1/notes"],
        visibility: { inWorkspaces: true, inProjects: true, curatedOnly: true },
      }),
    );
    expect(cards[0]?.released).toBe(false);
  });
});

describe("opening the details", () => {
  const open = (v = view({ entries: four() })) => {
    render(v);
    cards[1]?.onOpen(cards[1].entry);
    const call = openModal.mock.calls.at(-1);
    if (!call) throw new Error("no dialog");
    const element = (call[0] as (a: { close: () => void }) => ReactElement)({
      close: () => {},
    });
    return {
      props: element.props as {
        entry: CatalogEntry;
        released: boolean;
        curatedOnly: boolean;
        sheet?: boolean;
        onRelease: (r: boolean) => Promise<string | null>;
        onInstall: (e: CatalogEntry, v: string) => void;
      },
      options: call[1] as { label: string; placement?: string },
    };
  };

  it("opens the details of that plugin, named for it, as a dialog", () => {
    const { props, options } = open();
    expect(props.entry.id).toBe("b-plugin");
    expect(options).toEqual({ label: "b-plugin" });
    expect(props.sheet).toBe(false);
  });

  it("tells the dialog whether the plugin is released and whether that counts", () => {
    const v = view({
      entries: four(),
      released: ["store-1/b-plugin"],
      visibility: { inWorkspaces: true, inProjects: true, curatedOnly: true },
    });
    const { props } = open(v);
    expect(props.released).toBe(true);
    expect(props.curatedOnly).toBe(true);
    const off = open();
    expect(off.props.released).toBe(false);
    expect(off.props.curatedOnly).toBe(false);
  });

  it("releases and withdraws for that store and plugin, and reloads on success", async () => {
    const { props } = open();
    expect(await props.onRelease(true)).toBeNull();
    expect(await props.onRelease(false)).toBeNull();
    expect(mockSetCurated.mock.calls).toEqual([
      ["store-1", "b-plugin", true],
      ["store-1", "b-plugin", false],
    ]);
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it("gives back the server's reason and does not reload when it refuses", async () => {
    const { props } = open();
    mockSetCurated.mockResolvedValue({ error: "Unknown store." });
    expect(await props.onRelease(true)).toBe("Unknown store.");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("installing", () => {
  const install = (version = "1.0.0") => {
    render(view({ entries: four() }));
    cards[2]?.onInstall(cards[2].entry, version);
    const call = openModal.mock.calls.at(-1);
    if (!call) throw new Error("no dialog");
    const element = (call[0] as (a: { close: () => void }) => ReactElement)({
      close: () => {},
    });
    return {
      props: element.props as {
        entry: CatalogEntry;
        version: string;
        sheet?: boolean;
        onConfirm: () => Promise<string | null>;
      },
      options: call[1] as { label: string },
    };
  };

  it("opens the consent for that plugin and that version, and installs nothing yet", () => {
    const { props, options } = install("2.3.4");
    expect(props.entry.id).toBe("c-plugin");
    expect(props.version).toBe("2.3.4");
    expect(options.label).toBe("c-plugin");
    expect(mockInstall).not.toHaveBeenCalled();
  });

  it("installs that plugin from that store in that version, with the yes it asked for", async () => {
    const { props } = install("2.3.4");
    expect(await props.onConfirm()).toBeNull();
    expect(mockInstall.mock.calls).toEqual([
      ["store-1", "c-plugin", "2.3.4", { acknowledged: true }],
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("gives back the server's reason and does not reload when it refuses", async () => {
    const { props } = install();
    mockInstall.mockResolvedValue({
      error: "The download does not match the store's hash.",
    });
    expect(await props.onConfirm()).toBe(
      "The download does not match the store's hash.",
    );
    expect(refresh).not.toHaveBeenCalled();
  });

  it("is reachable from the details too: the dialog opens the consent", () => {
    render(view({ entries: four() }));
    cards[0]?.onOpen(cards[0].entry);
    const call = openModal.mock.calls.at(-1);
    const element = (call?.[0] as (a: { close: () => void }) => ReactElement)({
      close: () => {},
    });
    const onInstall = (
      element.props as { onInstall: (e: CatalogEntry, v: string) => void }
    ).onInstall;
    onInstall(cards[0]?.entry as CatalogEntry, "1.0.0");
    const consent = (
      openModal.mock.calls.at(-1)?.[0] as (a: {
        close: () => void;
      }) => ReactElement
    )({ close: () => {} });
    expect((consent.props as { version: string }).version).toBe("1.0.0");
    expect((consent.props as { entry: CatalogEntry }).entry.id).toBe(
      "a-plugin",
    );
  });
});
