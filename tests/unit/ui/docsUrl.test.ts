import { describe, expect, test } from "bun:test";
import { docsUrl } from "@/lib/docs-url";

describe("docsUrl", () => {
  test("points German readers at the German docs", () => {
    expect(docsUrl("de")).toBe("https://barynt.dev/de/docs/");
  });

  test("everyone else gets the English docs", () => {
    expect(docsUrl("en")).toBe("https://barynt.dev/docs/");
    expect(docsUrl("fr")).toBe("https://barynt.dev/docs/");
  });
});
