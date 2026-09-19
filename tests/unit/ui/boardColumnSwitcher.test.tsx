import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));

import { BoardColumnSwitcher } from "@/features/issues/components/BoardColumnSwitcher/BoardColumnSwitcher";
import type { GroupDef } from "@/features/issues/group";

const groups: GroupDef[] = [
  { key: "status", id: "todo", label: "Todo", alwaysShow: true },
  { key: "status", id: "doing", label: "In Progress", alwaysShow: true },
  { key: "status", id: "done", label: "Done", alwaysShow: true },
];

function render(activeId: string | null) {
  return renderToStaticMarkup(
    <BoardColumnSwitcher
      label="Board columns"
      activeId={activeId}
      onSelect={() => {}}
      columns={[
        { group: groups[0], count: 4 },
        { group: groups[1], count: 0 },
        { group: groups[2], count: 12 },
      ]}
    />,
  );
}

describe("BoardColumnSwitcher", () => {
  it("is a labelled tab list with one tab per column", () => {
    const html = render("todo");
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-label="Board columns"');
    expect(html.match(/role="tab"/g)).toHaveLength(3);
  });

  it("shows each column's name and count", () => {
    const html = render("todo");
    for (const text of ["Todo", "In Progress", "Done", ">4<", ">0<", ">12<"]) {
      expect(html).toContain(text);
    }
  });

  it("marks only the active column as selected", () => {
    const html = render("doing");
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    expect(html.match(/aria-selected="false"/g)).toHaveLength(2);
    expect(html).toMatch(
      /aria-selected="true"[^>]*>(?:(?!<button)[\s\S])*In Progress/,
    );
  });

  it("has nothing selected without an active column", () => {
    expect(render(null)).not.toContain('aria-selected="true"');
  });
});
