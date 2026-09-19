import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));

mock.module("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

mock.module("@/i18n/navigation", () => ({
  usePathname: () => "/acme",
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import { NavToggle } from "@/components/ui/layout/AppShell/NavToggle";
import { parseNavWidth } from "@/components/ui/layout/AppShell/navState";
import { ShellFrame } from "@/components/ui/layout/AppShell/ShellFrame";

function render(initialCollapsed: boolean, initialWidthRem = 14.5) {
  return renderToStaticMarkup(
    <ShellFrame
      initialCollapsed={initialCollapsed}
      initialWidthRem={initialWidthRem}
      sidebar={<nav>sidebar</nav>}
      main={<NavToggle />}
    >
      <span>outlets</span>
    </ShellFrame>,
  );
}

describe("ShellFrame (first render)", () => {
  it("starts with the drawer closed", () => {
    const html = render(false);
    expect(html).not.toContain("data-nav-open");
    expect(html).not.toContain("inert");
  });

  it("renders a collapsed sidebar as collapsed right away (from the cookie)", () => {
    expect(render(true)).toContain("data-nav-collapsed");
    expect(render(false)).not.toContain("data-nav-collapsed");
  });

  it("exposes the sidebar as the controlled region of the menu button", () => {
    const html = render(false);
    expect(html).toContain('id="app-sidebar"');
    expect(html.match(/aria-controls="app-sidebar"/g)).toHaveLength(1);
  });

  it("reports the closed drawer to assistive tech, not a made-up state", () => {
    const html = render(false);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(1);
    expect(html).not.toContain('aria-expanded="true"');
  });

  it("renders the saved sidebar width as a CSS variable", () => {
    expect(render(false, 18)).toContain("--sidebar-w:18rem");
  });

  it("offers a keyboard-operable handle on the sidebar's edge", () => {
    const html = render(false);
    expect(html).toContain('role="separator"');
    expect(html).toContain('aria-label="resizeSidebar"');
  });
});

describe("parseNavWidth", () => {
  it("falls back to the default without a usable cookie", () => {
    expect(parseNavWidth(undefined)).toBe(14.5);
    expect(parseNavWidth("abc")).toBe(14.5);
  });

  it("keeps a value in range and clamps one outside it", () => {
    expect(parseNavWidth("18.25")).toBe(18.25);
    expect(parseNavWidth("3")).toBe(12);
    expect(parseNavWidth("400")).toBe(26);
  });
});
