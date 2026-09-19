import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Table, type TableColumn } from "@/components/ui/layout/Table/Table";

interface Row {
  id: string;
  title: string;
}

const columns: TableColumn<Row>[] = [
  { id: "identifier", header: "Key", cell: (row) => <span>{row.id}</span> },
  { id: "title", header: "Title", cell: (row) => <span>{row.title}</span> },
  { id: "labels", header: "", cell: () => null },
];

const rows: Row[] = [{ id: "WEB-1", title: "Fix the login" }];

// The issue list lays its rows out again on a phone and finds the cells by
// the column id the table puts on them.
describe("Table cells carry their column id", () => {
  const html = renderToStaticMarkup(
    <Table
      label="Issues"
      columns={columns}
      groups={[{ id: "all", rows }]}
      getRowKey={(row) => row.id}
    />,
  );

  test("on every header and body cell", () => {
    for (const id of ["identifier", "title", "labels"]) {
      // One header cell and one body cell per column.
      expect(html.match(new RegExp(`data-col="${id}"`, "g"))).toHaveLength(2);
    }
  });

  test("and a row is findable by its key", () => {
    expect(html).toContain('data-row-key="WEB-1"');
  });

  test("an empty cell is still rendered, and empty, so CSS can drop it", () => {
    expect(html).toMatch(/<td[^>]*data-col="labels"[^>]*><\/td>/);
  });
});
