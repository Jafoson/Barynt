import { describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The page of a plugin that is set per project. What matters: what the plugin is, and one row for
// each project it can be set up in, each with a real link to that project's settings (this
// workspace's), in the order the area gave them.

mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));
mock.module("next-intl", () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key;
  return { useTranslations: () => t };
});
mock.module("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { PluginSettingsProjects } from "@/features/plugins/components/PluginSettingsProjects/PluginSettingsProjects";
import type {
  SettingsAreaProject,
  SettingsAreaProjectPlugin,
} from "@/features/plugins/settingsArea";

const project = (
  more: Partial<SettingsAreaProject> = {},
): SettingsAreaProject => ({
  id: "p-1",
  slug: "web-app",
  name: "Web App",
  color: "#3b82f6",
  avatarUrl: null,
  settings: { fields: [], values: {} },
  ...more,
});
const plugin = (
  more: Partial<SettingsAreaProjectPlugin> = {},
): SettingsAreaProjectPlugin => ({
  id: "roadmap",
  name: "Roadmap",
  description: "Plans a project",
  version: "0.4.0",
  projects: [project()],
  ...more,
});
const render = (p: SettingsAreaProjectPlugin): string =>
  renderToStaticMarkup(
    <PluginSettingsProjects workspaceId="nimbus" plugin={p} />,
  );

describe("the page of a plugin that is set per project", () => {
  it("says what the plugin is: its name, what it does, its version", () => {
    const html = render(plugin());
    for (const text of ["Roadmap", "Plans a project", "0.4.0"]) {
      expect(html).toContain(text);
    }
  });

  it("asks for the project to be chosen", () => {
    const html = render(plugin());
    expect(html).toContain("pluginSettings.chooseProject");
    expect(html).toContain("pluginSettings.projectsTitle");
  });

  it("has a row for each project, with a link to the plugin's settings there", () => {
    const html = render(
      plugin({
        projects: [
          project(),
          project({ id: "p-2", slug: "mobile", name: "Mobile" }),
        ],
      }),
    );
    expect(html).toContain("Web App");
    expect(html).toContain("Mobile");
    expect(html).toContain('href="/nimbus/plugin/settings/roadmap/web-app"');
    expect(html).toContain('href="/nimbus/plugin/settings/roadmap/mobile"');
    expect(html.match(/pluginSettings\.open/g)).toHaveLength(2);
  });

  it("lists the projects in the order it was given", () => {
    const html = render(
      plugin({
        projects: [
          project({ id: "p-2", slug: "api", name: "Api" }),
          project({ id: "p-3", slug: "web-app", name: "Web App" }),
        ],
      }),
    );
    expect(html.indexOf("Api")).toBeLessThan(html.indexOf("Web App"));
  });

  it("is this workspace's, and this plugin's: the address carries both", () => {
    const html = renderToStaticMarkup(
      <PluginSettingsProjects
        workspaceId="other"
        plugin={plugin({ id: "gantt" })}
      />,
    );
    expect(html).toContain('href="/other/plugin/settings/gantt/web-app"');
  });

  it("shows no description line when the plugin has none", () => {
    const html = render(plugin({ description: "" }));
    expect(html).toContain("Roadmap");
    expect(html).not.toContain("Plans a project");
    expect(html).not.toContain('<p class="description"></p>');
  });

  it("makes the way into a project a quiet text link", () => {
    const tokens = (
      render(plugin()).match(/<a [^>]*class="([^"]*)"/)?.[1] ?? ""
    ).split(" ");
    expect(tokens).toContain("text");
    expect(tokens).toContain("sm");
    expect(tokens).not.toContain("outline");
  });
});
