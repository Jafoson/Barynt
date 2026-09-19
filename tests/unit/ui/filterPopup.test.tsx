import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));

mock.module("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

mock.module("@/lib/context", () => ({
  useModal: () => ({ openModal: () => "" }),
}));

import {
  type Facet,
  FilterOptions,
  FilterPopup,
  FilterRow,
} from "@/features/issues/components/Topbar/components/FilterPopup";
import type { FilterState } from "@/features/issues/components/Topbar/useTopbar";

const empty: FilterState = {
  status: [],
  priority: [],
  assignee: [],
  label: [],
  project: [],
  storyPoints: [],
  dueDate: [],
};

function render(filterCount: number) {
  return renderToStaticMarkup(
    <FilterPopup
      filters={empty}
      filterCount={filterCount}
      area="project"
      hiddenDetailFields={[]}
      statuses={[]}
      priorities={[]}
      members={[]}
      labels={[]}
      projects={[]}
      onToggle={() => {}}
      onClearAll={() => {}}
    />,
  );
}

describe("FilterPopup trigger", () => {
  it("is one button labelled Filter", () => {
    const html = render(0);
    expect(html).toContain("filters.label");
    expect(html).toContain('data-icon="lucide:list-filter"');
  });

  it("shows no count while nothing is filtered", () => {
    expect(render(0)).not.toMatch(/>0</);
  });

  it("shows how many filters are active", () => {
    expect(render(3)).toContain(">3<");
  });
});

const options = [
  { value: "todo", label: "Todo" },
  { value: "doing", label: "In Progress" },
  { value: "done", label: "Done" },
];

function facet(selected: string[], opts = options): Facet {
  return { key: "status", title: "Status", options: opts, selected };
}

describe("FilterRow", () => {
  function row(selected: string[]) {
    return renderToStaticMarkup(
      <FilterRow
        facet={facet(selected)}
        onOpen={() => {}}
        onToggle={() => {}}
      />,
    );
  }

  it("is a row with the name on the left and a button to open the values", () => {
    const html = row([]);
    expect(html).toContain(">Status<");
    expect(html).toContain("filters.choose");
    expect(html).not.toContain("<select");
  });

  it("shows no chips while nothing is chosen", () => {
    expect(row([])).not.toContain("In Progress");
  });

  it("shows what is chosen as chips underneath", () => {
    const html = row(["todo", "done"]);
    expect(html).toContain("Todo");
    expect(html).toContain("Done");
    expect(html).not.toContain("In Progress");
  });
});

describe("FilterOptions", () => {
  function list(selected: string[], opts = options) {
    return renderToStaticMarkup(
      <FilterOptions facet={facet(selected, opts)} onToggle={() => {}} />,
    );
  }

  it("lists every value as an option of a multi-select listbox", () => {
    const html = list([]);
    expect(html).toContain('role="listbox"');
    expect(html).toContain('aria-multiselectable="true"');
    expect(html.match(/role="option"/g)).toHaveLength(3);
  });

  it("marks the chosen values and only those", () => {
    const html = list(["doing"]);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/aria-selected="false"/g)).toHaveLength(2);
    expect(html).toContain('data-icon="lucide:check"');
  });

  it("has no search field for a short list", () => {
    expect(list([])).not.toContain('type="search"');
  });

  it("can ask for the search field on a short list too (the phone's sheet)", () => {
    const html = renderToStaticMarkup(
      <FilterOptions facet={facet([])} alwaysSearch onToggle={() => {}} />,
    );
    expect(html).toContain("placeholders.search");
  });

  it("adds a search field once the list is long", () => {
    const many = Array.from({ length: 8 }, (_, i) => ({
      value: `v${i}`,
      label: `Value ${i}`,
    }));
    expect(list([], many)).toContain("placeholders.search");
  });
});
