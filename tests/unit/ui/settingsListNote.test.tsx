import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SettingsList } from "@/components/ui/layout/SettingsList/SettingsList";

// The note under a list's heading: something to say before the list, such as why its
// buttons do not work yet. It belongs to the heading, so without one there is no note.

const rows = [
  { id: "a", label: "Row A", control: <button type="button">Go</button> },
];

describe("SettingsList note", () => {
  it("stands between the heading and the list", () => {
    const html = renderToStaticMarkup(
      <SettingsList
        title="Available"
        note={<p>Not yet possible</p>}
        rows={rows}
      />,
    );
    const heading = html.indexOf("Available");
    const note = html.indexOf("Not yet possible");
    const list = html.indexOf("Row A");
    expect(heading).toBeGreaterThan(-1);
    expect(note).toBeGreaterThan(heading);
    expect(list).toBeGreaterThan(note);
  });

  it("is left out when there is nothing to say", () => {
    for (const note of [undefined, false, null, ""]) {
      const html = renderToStaticMarkup(
        <SettingsList title="Available" note={note} rows={rows} />,
      );
      expect(html).not.toContain("note");
    }
  });

  it("is not shown without a heading, as it belongs to it", () => {
    const html = renderToStaticMarkup(
      <SettingsList note={<p>Not yet possible</p>} rows={rows} />,
    );
    expect(html).not.toContain("Not yet possible");
    expect(html).toContain("Row A");
  });
});
