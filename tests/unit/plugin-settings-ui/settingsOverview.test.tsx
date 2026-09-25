import { describe, expect, it, mock } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// The start page of the plugins' settings. What matters: every plugin that is on here is listed
// with its name and version, one that has settings has a real link to its page (this workspace's),
// one that has none says so and links nowhere, and where nothing is on there is a note and a way to
// where plugins are switched on.

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

import { PluginSettingsOverview } from "@/features/plugins/components/PluginSettingsOverview/PluginSettingsOverview";
import type {
  SettingsArea,
  SettingsAreaPlugin,
} from "@/features/plugins/settingsArea";
import type { SettingsForm } from "@/lib/plugins/settings";

const form: SettingsForm = { fields: [], values: {} };
function entry(more: Partial<SettingsAreaPlugin> = {}): SettingsAreaPlugin {
  return {
    id: "notes",
    name: "Notes",
    description: "Takes notes",
    version: "1.2.0",
    settings: form,
    ...more,
  };
}
const render = (plugins: SettingsAreaPlugin[]): string =>
  renderToStaticMarkup(
    <PluginSettingsOverview
      workspaceId="nimbus"
      area={{ plugins } satisfies SettingsArea}
    />,
  );

describe("the start page of the plugins' settings", () => {
  it("is titled, and says what this is", () => {
    const html = render([entry()]);
    expect(html).toContain("pluginSettings.overviewTitle");
    expect(html).toContain("pluginSettings.overviewIntro");
    expect(html).toContain("pluginSettings.listTitle");
  });

  it("lists every plugin with its name, what it does and its version", () => {
    const html = render([
      entry({
        id: "a",
        name: "Alpha",
        description: "Does alpha",
        version: "2.0.1",
      }),
      entry({
        id: "b",
        name: "Beta",
        description: "Does beta",
        version: "0.3.0",
      }),
    ]);
    for (const text of [
      "Alpha",
      "Does alpha",
      "2.0.1",
      "Beta",
      "Does beta",
      "0.3.0",
    ]) {
      expect(html).toContain(text);
    }
    expect(html.indexOf("Alpha")).toBeLessThan(html.indexOf("Beta"));
  });

  it("links a plugin that has settings to its page in this workspace", () => {
    const html = render([entry({ id: "github-sync" })]);
    expect(html).toContain('href="/nimbus/plugin/settings/github-sync"');
    expect(html).toContain("pluginSettings.open");
    expect(html).not.toContain("pluginSettings.noSettings");
  });

  it("links each plugin to its own page", () => {
    const html = render([entry({ id: "a" }), entry({ id: "b", name: "B" })]);
    expect(html).toContain('href="/nimbus/plugin/settings/a"');
    expect(html).toContain('href="/nimbus/plugin/settings/b"');
  });

  it("says a plugin that declares none has none, and links nowhere for it", () => {
    const html = render([entry({ id: "quiet", settings: null })]);
    expect(html).toContain("pluginSettings.noSettings");
    expect(html).not.toContain("/plugin/settings/quiet");
    expect(html).not.toContain("pluginSettings.open");
  });

  it("does not show a plugin's description when it has none, and no empty line for it", () => {
    const html = render([entry({ description: "" })]);
    expect(html).toContain("Notes");
    expect(html).not.toContain("Takes notes");
    expect(html).not.toContain("<span></span>");
  });

  it("makes the way into the settings a quiet text link, and the way to the plugins an outline one", () => {
    const linked = render([entry()]).match(/<a [^>]*>/)?.[0] ?? "";
    expect(linked).toContain("text");
    expect(linked).toContain("sm");
    expect(linked).not.toContain("outline");
    const empty = render([]).match(/<a [^>]*>/)?.[0] ?? "";
    expect(empty).toContain("outline");
    expect(empty).toContain("sm");
  });

  it("puts the settings icon before the words of the link", () => {
    const html = render([entry()]);
    expect(html).toContain('data-icon="lucide:sliders-horizontal"');
    expect(html.indexOf("lucide:sliders-horizontal")).toBeLessThan(
      html.indexOf("pluginSettings.open"),
    );
  });

  it("has a note and a way to switch plugins on where none is on here", () => {
    const html = render([]);
    expect(html).toContain("<p>pluginSettings.empty</p>");
    expect(html).toContain('href="/nimbus/settings/plugins"');
    expect(html).toContain("pluginSettings.emptyLink");
    expect(html).not.toContain("pluginSettings.listTitle");
  });

  it("does not show the empty note when there is something to list", () => {
    const html = render([entry()]);
    expect(html).not.toContain("<p>pluginSettings.empty</p>");
    expect(html).not.toContain('href="/nimbus/settings/plugins"');
  });
});
