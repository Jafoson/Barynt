import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));

import { WarningBox } from "@/components/ui/atoms/WarningBox/WarningBox";

// A warning that has to be answered: it says what it is about, and the box that says
// it was read is the last thing in it. What matters is that the box shows what it is
// told to (checked, disabled) and carries the sentence.

function render(more: { checked?: boolean; disabled?: boolean } = {}) {
  return renderToStaticMarkup(
    <WarningBox
      title="You are letting this run"
      checkLabel="I understand"
      checked={more.checked ?? false}
      onChange={() => {}}
      disabled={more.disabled}
    >
      <p>First paragraph.</p>
      <p>Second paragraph.</p>
    </WarningBox>,
  );
}

describe("WarningBox", () => {
  it("shows the title with a warning icon, the paragraphs and the sentence next to the box", () => {
    const html = render();
    expect(html).toContain("You are letting this run");
    expect(html).toContain('data-icon="lucide:triangle-alert"');
    expect(html).toContain("<p>First paragraph.</p>");
    expect(html).toContain("<p>Second paragraph.</p>");
    expect(html).toContain("I understand");
    expect(html).toContain('type="checkbox"');
  });

  it("puts the box after the text, so it is the last thing read", () => {
    const html = render();
    expect(html.indexOf("Second paragraph.")).toBeLessThan(
      html.indexOf('type="checkbox"'),
    );
  });

  it("shows the box unticked, ticked, or off, as told", () => {
    expect(render()).not.toContain("checked");
    expect(render({ checked: true })).toContain('checked=""');
    expect(render({ disabled: true })).toContain('disabled=""');
    expect(render()).not.toContain("disabled");
  });
});
