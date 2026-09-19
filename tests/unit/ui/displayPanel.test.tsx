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
  projectHiddenFields: [],
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
