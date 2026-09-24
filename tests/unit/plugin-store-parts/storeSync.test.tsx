import "../plugin-store-support/setup";
import { beforeEach, describe, expect, it, mock } from "bun:test";
import type { ReactElement, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  mockSync,
  refresh,
  resetStarted,
  settled,
  transition,
} from "../plugin-store-support/setup";

// One store's row on the store page: what it says about the state of the store, and the
// button that fetches it now. The button is a stand-in that keeps the function it was given.

interface Pressed {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}
let buttons: Pressed[] = [];

mock.module("@/components/ui/atoms/Button/Button", () => ({
  Button: (props: {
    children?: ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    "aria-label"?: string;
    "aria-busy"?: boolean;
  }) => {
    buttons.push({
      label: typeof props.children === "string" ? props.children : "",
      onClick: props.onClick,
      disabled: props.disabled,
      ariaLabel: props["aria-label"],
    });
    return (
      <button
        type="button"
        aria-label={props["aria-label"]}
        aria-busy={props["aria-busy"]}
      >
        {props.children}
      </button>
    );
  },
}));

import { StoreSync } from "@/features/plugins/components/PluginStore/StoreSync";

const state = (more: object = {}) => ({
  id: "store-7",
  name: "Acme",
  official: false,
  error: null,
  errorCode: null,
  syncedAt: null,
  syncError: null,
  problems: [],
  ...more,
});
const render = (node: ReactElement): string => {
  buttons = [];
  resetStarted();
  return renderToStaticMarkup(node);
};

beforeEach(() => {
  transition.pending = false;
  mockSync.mockReset();
  mockSync.mockResolvedValue({ ok: true });
  refresh.mockClear();
});

describe("the button", () => {
  it("is named for the store it updates, and says what it does", () => {
    render(<StoreSync store={state()} />);
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.ariaLabel).toBe(
      'pluginStore.syncLabel|{"store":"Acme"}',
    );
    expect(buttons[0]?.label).toBe("pluginStore.sync");
  });

  it("asks the server to update this store, and then reads the page again", async () => {
    render(<StoreSync store={state()} />);
    buttons[0]?.onClick?.();
    await settled();
    expect(mockSync).toHaveBeenCalledTimes(1);
    expect(mockSync).toHaveBeenCalledWith("store-7");
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("reads the page again only after the server has answered, so it shows how it went", async () => {
    let answer: (value: { ok: true }) => void = () => {};
    mockSync.mockReturnValue(
      new Promise((resolve) => {
        answer = resolve;
      }),
    );
    render(<StoreSync store={state()} />);
    buttons[0]?.onClick?.();
    await Promise.resolve();
    expect(refresh).not.toHaveBeenCalled();
    answer({ ok: true });
    await settled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("says it is working, and cannot be pressed again, while the server is", () => {
    transition.pending = true;
    const html = render(<StoreSync store={state()} />);
    expect(html).toContain("pluginStore.syncing");
    expect(html).not.toContain(">pluginStore.sync<");
    expect(buttons[0]?.disabled).toBe(true);
    expect(html).toContain('aria-busy="true"');
  });

  it("can be pressed when nothing is running", () => {
    const html = render(<StoreSync store={state()} />);
    expect(buttons[0]?.disabled).toBe(false);
    expect(html).not.toContain("pluginStore.syncing");
  });

  it("reads the page again also when the server could not try, so what it says is what is there", async () => {
    mockSync.mockResolvedValue({ error: "The store is switched off." });
    render(<StoreSync store={state()} />);
    buttons[0]?.onClick?.();
    await settled();
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});

describe("what the row says", () => {
  it("says nothing is wrong when nothing is", () => {
    const html = render(<StoreSync store={state({ syncedAt: new Date() })} />);
    for (const word of [
      "storeProblems",
      "syncFailed",
      "storeError",
      "storeNotFetched",
      'role="alert"',
    ]) {
      expect(html).not.toContain(word);
    }
  });

  it("says the store was not fetched yet", () => {
    const html = render(<StoreSync store={state()} />);
    expect(html).toContain("pluginStore.syncNever");
    expect(html).not.toContain("pluginStore.syncedAt");
  });

  it("says when it was fetched, in the short form the rest of the app uses", () => {
    const html = render(
      <StoreSync
        store={state({ syncedAt: new Date(Date.now() - 3 * 3600 * 1000) })}
      />,
    );
    expect(html).toContain("pluginStore.syncedAt");
    expect(html).toContain("hours");
    expect(html).not.toContain("pluginStore.syncNever");
  });

  it("names the store in every notice", () => {
    const html = render(
      <StoreSync
        store={state({
          syncedAt: new Date(),
          syncError: "The server answered 404.",
          error: "Not a store: store.json is missing.",
          errorCode: "unreadable",
          problems: [{ id: "x", issues: ["y"] }],
        })}
      />,
    );
    expect(
      (html.match(/&quot;store&quot;:&quot;Acme&quot;/g) ?? []).length,
    ).toBeGreaterThanOrEqual(4);
  });

  it("says a store's clone cannot be read, apart from why the last update failed", () => {
    const html = render(
      <StoreSync
        store={state({
          syncError: "The server answered 404.",
          error: "Not a store: store.json is missing.",
          errorCode: "unreadable",
        })}
      />,
    );
    expect(html).toContain("The server answered 404.");
    expect(html).toContain("Not a store: store.json is missing.");
  });
});
