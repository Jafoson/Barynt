import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));

mock.module("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

mock.module("@/i18n/navigation", () => ({
  usePathname: () => "/acme/project/web",
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

mock.module("@/lib/context", () => ({
  useModal: () => ({ openModal: () => "" }),
}));

import {
  DisplayPanel,
  type DisplayState,
} from "@/features/issues/components/Topbar/components/ViewSettings";

const state: DisplayState = {
  groupKey: "status",
  sortKey: "manual",
  hidden: new Set(["labels"]),
  customFields: [],
  shownCustomFields: [],
  projectHiddenFields: [],
  groupLookups: {
    statuses: [
      { id: "todo", name: "Todo", color: "#111", isColumn: true },
      { id: "done", name: "Done", color: "#222", isColumn: true },
      { id: "canceled", name: "Canceled", color: "#333", isColumn: false },
    ] as never,
    priorities: [],
    issueTypes: [],
    members: [],
  },
  view: "list",
  hiddenGroups: ["status:done", "priority:3"],
  hideEmptyGroups: false,
};

function render(
  props: Partial<React.ComponentProps<typeof DisplayPanel>> = {},
) {
  return renderToStaticMarkup(
    <DisplayPanel
      state={state}
      onGroup={() => {}}
      onSort={() => {}}
      onToggleField={() => {}}
      onToggleCustomField={() => {}}
      onToggleGroup={() => {}}
      onToggleHideEmpty={() => {}}
      onReset={() => {}}
      facet={null}
      onFacetChange={() => {}}
      showBack={false}
      {...props}
    />,
  );
}

describe("DisplayPanel", () => {
  it("shows grouping and ordering as rows with their current value", () => {
    const html = render();
    expect(html).toContain("display.grouping");
    expect(html).toContain("display.ordering");
    // The current values, translated through the label keys.
    expect(html).toContain("fields.status");
    expect(html).toContain("sort.manual");
    expect(html).not.toContain("<select");
  });

  it("shows the fields as chips, the hidden ones not selected", () => {
    const html = render();
    expect(html).toContain("display.fieldsTitle");
    expect(html).toContain("fields.labels");
  });

  it("shows the groups as a row with how many are shown (BARY-47)", () => {
    const html = render();
    expect(html).toContain("display.groupsTitle");
    // Canceled counts too; only "done" is hidden here.
    expect(html).toContain("2/3");
  });

  it("has a switch for hiding empty groups automatically (BARY-47)", () => {
    expect(render()).toContain("display.hideEmptyGroups");
    expect(render()).toContain('aria-checked="false"');
    expect(render({ state: { ...state, hideEmptyGroups: true } })).toContain(
      "checked",
    );
  });

  it("opens the groups as a multi-select list, hidden ones not selected", () => {
    const html = render({ facet: "groups" });
    expect(html).toContain('aria-multiselectable="true"');
    expect(html).toContain("Todo");
    expect(html).toContain("Done");
    expect(html).toContain("Canceled");
    expect(html.match(/aria-selected="true"/g)).toHaveLength(2);
  });

  describe("the custom fields (BARY-81)", () => {
    const field = (id: string, name: string) =>
      ({
        id,
        key: id,
        name,
        description: "",
        type: "text",
        config: { maxLength: 20 },
        position: 0,
        archived: false,
        pluginId: null,
        workspaceId: "w",
        projectId: null,
      }) as never;
    const withFields = (
      count: number,
      shown: string[],
    ): React.ComponentProps<typeof DisplayPanel>["state"] => ({
      ...state,
      customFields: Array.from({ length: count }, (_, i) =>
        field(`f${i}`, `Field ${i}`),
      ),
      shownCustomFields: shown,
    });

    it("has no section for a view with no custom fields", () => {
      expect(render()).not.toContain("display.customFieldsTitle");
    });

    it("lists them as chips under a title of their own, the shown ones selected", () => {
      const html = render({ state: withFields(3, ["f1"]) });
      expect(html).toContain("display.customFieldsTitle");
      expect(html).toContain("Field 0");
      expect(html).toContain("Field 1");
      expect(html).toContain("Field 2");
      // The three built-in chips are not the custom ones: only f1 is on.
      const section = html.slice(html.indexOf("display.customFieldsTitle"));
      expect(section.match(/aria-pressed="true"/g)).toHaveLength(1);
      expect(section.match(/aria-pressed="false"/g)).toHaveLength(2);
    });

    it("turns the chips that are not shown off once six are, and leaves the shown ones on", () => {
      const shown = ["f0", "f1", "f2", "f3", "f4", "f5"];
      const html = render({ state: withFields(8, shown) });
      const section = html.slice(html.indexOf("display.customFieldsTitle"));
      const chips = section.split('<div class="chip ').slice(1);
      expect(chips).toHaveLength(8);
      const off = (chip: string) => /disabled/.test(chip);
      expect(chips.slice(0, 6).some(off)).toBe(false);
      expect(chips.slice(6).every(off)).toBe(true);
    });

    it("keeps every chip on below the most", () => {
      const html = render({ state: withFields(8, ["f0"]) });
      const section = html.slice(html.indexOf("display.customFieldsTitle"));
      expect(/disabled/.test(section)).toBe(false);
    });

    it("hides the section while a list is open", () => {
      expect(
        render({ state: withFields(2, []), facet: "group" }),
      ).not.toContain("display.customFieldsTitle");
    });
  });

  it("has a reset button below unless the sheet holds it in its bar", () => {
    expect(render()).toContain("display.reset");
    expect(render({ hideReset: true })).not.toContain("display.reset");
  });

  it("opens the choices for grouping as a single-select list", () => {
    const html = render({ facet: "group" });
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-multiselectable="false"');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    // The rows are gone while a list is open.
    expect(html).not.toContain("display.fieldsTitle");
  });

  it("offers a back row in the popup, none in the sheet", () => {
    expect(render({ facet: "sort", showBack: true })).toContain(
      "lucide:chevron-left",
    );
    expect(render({ facet: "sort", showBack: false })).not.toContain(
      "lucide:chevron-left",
    );
  });
});
