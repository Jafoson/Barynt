import { describe, expect, it } from "bun:test";
import { phoneListHref } from "@/features/issues/phone-list";

describe("phoneListHref", () => {
  it("sends a project's board to its list", () => {
    expect(phoneListHref("/acme/project/web", "")).toBe(
      "/acme/project/web/list",
    );
  });

  it("sends my issues' board to its list", () => {
    expect(phoneListHref("/acme/my", "")).toBe("/acme/my/list");
  });

  it("keeps filters, ordering and grouping", () => {
    expect(
      phoneListHref(
        "/acme/project/web",
        "status=todo&sort=priority&group=type",
      ),
    ).toBe("/acme/project/web/list?status=todo&sort=priority&group=type");
  });

  it("copes with a trailing slash", () => {
    expect(phoneListHref("/acme/my/", "q=login")).toBe("/acme/my/list?q=login");
  });
});
