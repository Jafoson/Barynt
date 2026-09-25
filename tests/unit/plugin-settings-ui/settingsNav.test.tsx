import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// The second level of the settings. What matters here is which address makes a row the open one:
// its own by default, and what the row says (`<href>/*`) where its pages have pages beneath them
// (a plugin's settings per project), and that the start page's row says "the page, not the list".

mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));
mock.module("@/components/ui/layout/NavLink/NavLink", () => ({
  NavLink: ({
    href,
    activeHref,
    label,
  }: {
    href: string;
    activeHref?: string;
    label: string;
  }) => (
    <a href={href} data-active-href={activeHref}>
      {label}
    </a>
  ),
}));

import { SettingsNav } from "@/components/ui/layout/SettingsNav/SettingsNav";

const BASE = "/nimbus/plugin/settings";
const render = (
  items: { href: string; label: string; icon: string; activeHref?: string }[],
): string =>
  renderToStaticMarkup(
    <SettingsNav
      subject="Nimbus"
      color="#123456"
      title="Plugin settings"
      items={items}
      basePath={BASE}
    />,
  );
const rows = (
  html: string,
): { href: string; active: string; label: string }[] =>
  [
    ...html.matchAll(
      /<a href="([^"]*)" data-active-href="([^"]*)">([^<]*)<\/a>/g,
    ),
  ].map((m) => ({ href: m[1], active: m[2], label: m[3] }));

describe("the rows of the settings navigation", () => {
  it("are open on their own address, unless they say more", () => {
    const html = render([
      { href: `${BASE}/notes`, label: "Notes", icon: "lucide:puzzle" },
    ]);
    expect(rows(html)).toEqual([
      { href: `${BASE}/notes`, active: `${BASE}/notes`, label: "Notes" },
    ]);
  });

  it("are open on the pages beneath them when they say so", () => {
    const html = render([
      {
        href: `${BASE}/roadmap`,
        label: "Roadmap",
        icon: "lucide:folders",
        activeHref: `${BASE}/roadmap/*`,
      },
    ]);
    expect(rows(html)).toEqual([
      {
        href: `${BASE}/roadmap`,
        active: `${BASE}/roadmap/*`,
        label: "Roadmap",
      },
    ]);
  });

  it("link to the start page as the page, not the phone's list, and are open on it alone", () => {
    const html = render([
      { href: BASE, label: "Overview", icon: "lucide:layout-list" },
    ]);
    expect(rows(html)).toEqual([
      { href: `${BASE}?open=1`, active: BASE, label: "Overview" },
    ]);
  });

  it("keep the order they were given", () => {
    const html = render([
      { href: BASE, label: "Overview", icon: "lucide:layout-list" },
      { href: `${BASE}/b`, label: "B", icon: "lucide:puzzle" },
      { href: `${BASE}/a`, label: "A", icon: "lucide:puzzle" },
    ]);
    expect(rows(html).map((row) => row.label)).toEqual(["Overview", "B", "A"]);
  });

  it("say whose settings they are and what the list is", () => {
    const html = render([]);
    expect(html).toContain("Nimbus");
    expect(html).toContain("Plugin settings");
  });
});
