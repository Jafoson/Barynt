import { describe, expect, it } from "bun:test";
import { isPlainHost, isPrivateAddress } from "@/lib/public-fetch";

describe("isPrivateAddress", () => {
  it("flags local and private addresses", () => {
    for (const a of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "0.0.0.0",
      "::1",
      "fd00::1",
      "fe80::1",
      "::ffff:127.0.0.1",
    ]) {
      expect(isPrivateAddress(a)).toBe(true);
    }
  });

  it("lets public addresses through", () => {
    expect(isPrivateAddress("8.8.8.8")).toBe(false);
    expect(isPrivateAddress("172.32.0.1")).toBe(false);
    expect(isPrivateAddress("2606:4700::1111")).toBe(false);
  });
});

describe("isPlainHost", () => {
  it("accepts names and refuses addresses and odd input", () => {
    expect(isPlainHost("github.com")).toBe(true);
    expect(isPlainHost("docs.example.co.uk")).toBe(true);
    expect(isPlainHost("localhost")).toBe(false);
    expect(isPlainHost("127.0.0.1")).toBe(false);
    expect(isPlainHost("a.com/../x")).toBe(false);
    expect(isPlainHost("evil.com:8080")).toBe(false);
  });
});

describe("titleOfHtml", () => {
  it("reads og:title before <title>, decodes entities, squeezes space", async () => {
    const { titleOfHtml } = await import("@/lib/link-title");
    expect(titleOfHtml("<head><title> Foo &amp;\n  Bar </title></head>")).toBe(
      "Foo & Bar",
    );
    expect(
      titleOfHtml(
        '<meta property="og:title" content="Social"><title>Plain</title>',
      ),
    ).toBe("Social");
    expect(titleOfHtml("<p>no title</p>")).toBeNull();
  });
});
