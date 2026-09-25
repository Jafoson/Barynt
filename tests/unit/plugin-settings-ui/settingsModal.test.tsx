import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// The window a plugin's settings open in. Static markup shows what it starts as: the title, the
// fields with their values, a Save button that is off while nothing was changed and belongs to
// the form (so the browser checks its limits first, and Enter presses it), and a Cancel button
// only where the window is a dialog. What a save does is `saveForm`'s (formState.test.ts).

mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));
mock.module("next-intl", () => {
  const t = (key: string, params?: Record<string, unknown>) =>
    params ? `${key}:${Object.values(params).join(",")}` : key;
  return { useTranslations: () => t };
});

import { PluginSettingsModal } from "@/features/plugins/components/PluginSettings/PluginSettingsModal";
import type { SettingField, SettingsForm } from "@/lib/plugins/settings";

const title: SettingField = {
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
const form: SettingsForm = { fields: [title], values: { title: "Hello" } };

function render(more: { sheet?: boolean; form?: SettingsForm } = {}): string {
  return renderToStaticMarkup(
    <PluginSettingsModal
      name="Notes"
      form={more.form ?? form}
      save={async () => ({ ok: true })}
      onSaved={() => {}}
      close={() => {}}
      sheet={more.sheet}
    />,
  );
}

/** The opening tag of the button whose text is `text`. */
function button(html: string, text: string): string {
  const match = html.match(new RegExp(`<button[^>]*>(?:<[^>]*>)*${text}<`));
  if (!match) throw new Error(`no button "${text}" in ${html}`);
  return match[0];
}

describe("a plugin's settings window", () => {
  it("is titled with the plugin's name", () => {
    expect(render()).toContain("title:Notes");
  });

  it("shows the fields with the values they have now", () => {
    const html = render();
    expect(html).toContain(">Title</label>");
    expect(html).toContain('value="Hello"');
  });

  it("has a Save button that is off while nothing was changed", () => {
    expect(button(render(), "actions.save")).toContain("disabled");
  });

  it("has a Save button that belongs to the form, so its limits are checked and Enter presses it", () => {
    const html = render();
    const formId = html.match(/<form[^>]*\bid="([^"]+)"/)?.[1];
    expect(formId).toBeTruthy();
    const save = button(html, "actions.save");
    expect(save).toContain('type="submit"');
    expect(save).toContain(`form="${formId}"`);
  });

  it("has a Cancel button in a dialog, and none in a sheet: a phone closes it by the header or a swipe", () => {
    expect(render()).toContain("actions.cancel");
    expect(render({ sheet: true })).not.toContain("actions.cancel");
  });

  it("is a dialog by default and a bottom sheet on a phone", () => {
    expect(render()).not.toContain("data-sheet");
    expect(render({ sheet: true })).toContain("data-sheet");
  });

  it("shows no problem before anything was saved", () => {
    const html = render();
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("hasError");
  });

  it("can be closed from its header", () => {
    expect(render()).toContain("actions.close");
    expect(render({ sheet: true })).toContain("actions.close");
  });
});
