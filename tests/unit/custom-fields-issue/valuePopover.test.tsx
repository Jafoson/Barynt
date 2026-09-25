import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// The popover around a typed value. What matters here is what the custom fields added: a value that
// cannot be saved says why under the field and keeps Save off, and without a check every value can be
// confirmed, as before.

mock.module("next-intl", () => {
  const t = (key: string) => key;
  return { useTranslations: () => t };
});

import { ValuePopover } from "@/features/issues/components/ValuePopover/ValuePopover";

function render(more: {
  problem?: (value: string) => string | null;
  clearable?: boolean;
}) {
  return renderToStaticMarkup(
    <ValuePopover<string>
      initialValue="start"
      clearable={more.clearable ?? false}
      problem={more.problem}
      onConfirm={() => {}}
      onClear={() => {}}
      close={() => {}}
    >
      {(value) => <input defaultValue={value} />}
    </ValuePopover>,
  );
}

const saveDisabled = (html: string) =>
  /<button[^>]*disabled[^>]*>actions\.save/.test(html);

describe("a value without a check", () => {
  it("can always be confirmed, and says nothing", () => {
    const html = render({});
    expect(saveDisabled(html)).toBe(false);
    expect(html).not.toContain("alert");
  });

  it("is the same when the check finds nothing wrong", () => {
    const html = render({ problem: () => null });
    expect(saveDisabled(html)).toBe(false);
    expect(html).not.toContain("alert");
  });
});

describe("a value that cannot be saved", () => {
  it("says why under the field and keeps Save off", () => {
    const html = render({ problem: () => "Too long" });
    expect(html).toContain('<p class="problem" role="alert">Too long</p>');
    expect(saveDisabled(html)).toBe(true);
  });

  it("asks about the value that is pending", () => {
    const problem = mock((_value: string) => null as string | null);
    render({ problem });
    expect(problem).toHaveBeenCalledWith("start");
  });

  it("puts the reason between the field and the buttons", () => {
    const html = render({ problem: () => "Nope" });
    expect(html.indexOf("<input")).toBeLessThan(html.indexOf("Nope"));
    expect(html.indexOf("Nope")).toBeLessThan(html.indexOf("actions.save"));
  });
});

describe("clearing", () => {
  it("is offered only while there is something to clear", () => {
    expect(render({ clearable: true })).toContain("actions.clear");
    expect(render({ clearable: false })).not.toContain("actions.clear");
  });

  it("is not held back by a value that cannot be saved", () => {
    const html = render({ clearable: true, problem: () => "Nope" });
    expect(html).toContain("actions.clear");
  });
});
