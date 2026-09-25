import { describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The row that switches between the settings areas. What matters: every choice is a link with its
// icon and its word in a span of its own (so a phone can show the word of the open choice only and
// still name the others for a screen reader), and the open one is marked.

mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));
mock.module("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { SettingsHeader } from "@/components/ui/layout/SettingsHeader/SettingsHeader";
import type { VisibleSettingsScopeEntry } from "@/lib/nav";

const items: VisibleSettingsScopeEntry[] = [
  { key: "account", label: "Personal", icon: "lucide:circle-user", href: "/a" },
  {
    key: "workspace",
    label: "Workspace",
    icon: "lucide:building-2",
    href: "/w",
  },
  { key: "plugin", label: "Plugins", icon: "lucide:puzzle", href: "/p" },
];
const render = (active: "account" | "workspace" | "plugin") =>
  renderToStaticMarkup(
    <SettingsHeader items={items} active={active} label="Settings area" />,
  );

describe("the switcher of the settings areas", () => {
  it("is a navigation with a name for screen readers", () => {
    expect(render("plugin")).toContain('aria-label="Settings area"');
  });

  it("has a link for each area, in the order it was given, to its address", () => {
    const html = render("plugin");
    const hrefs = [...html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["/a", "/w", "/p"]);
  });

  it("shows each area's icon before its word, and the word in a span of its own", () => {
    const html = render("plugin");
    expect(html).toContain(
      '<i data-icon="lucide:puzzle"></i><span class="label">Plugins</span>',
    );
    expect(html).toContain(
      '<i data-icon="lucide:circle-user"></i><span class="label">Personal</span>',
    );
  });

  it("marks the open area and only that one", () => {
    const html = render("workspace");
    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html.match(/data-active/g)).toHaveLength(1);
    expect(html).toMatch(/<a href="\/w"[^>]*aria-current="page"/);
    expect(html).not.toMatch(/<a href="\/a"[^>]*aria-current/);
  });

  it("marks the plugins when they are the open area", () => {
    expect(render("plugin")).toMatch(/<a href="\/p"[^>]*aria-current="page"/);
  });
});
