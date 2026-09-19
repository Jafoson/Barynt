import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ComposerSlotContext,
  InComposerSlot,
} from "@/features/issues/components/IssueDetail/composerSlot";

describe("InComposerSlot", () => {
  it("renders in place when there is no slot (everywhere but a phone)", () => {
    const html = renderToStaticMarkup(
      <InComposerSlot>
        <p>composer</p>
      </InComposerSlot>,
    );
    expect(html).toBe("<p>composer</p>");
  });

  it("still renders in place while the slot element isn't there yet", () => {
    const html = renderToStaticMarkup(
      <ComposerSlotContext.Provider value={null}>
        <InComposerSlot>
          <p>composer</p>
        </InComposerSlot>
      </ComposerSlotContext.Provider>,
    );
    expect(html).toContain("composer");
  });
});
