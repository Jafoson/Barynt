import { describe, expect, it } from "bun:test";
import { normalizeEmbedUrl, widgetsSchema } from "@/features/dashboard/widgets";
import { allowsFraming, isPublicAddress } from "@/lib/net/embed-check";

const ORIGIN = "https://app.barynt.io";

describe("whether a page may be framed (BARY-183)", () => {
  it("allows a page without any refusal", () => {
    expect(allowsFraming({}, ORIGIN)).toBe(true);
  });

  it("follows X-Frame-Options", () => {
    expect(allowsFraming({ xFrameOptions: "DENY" }, ORIGIN)).toBe(false);
    expect(allowsFraming({ xFrameOptions: "sameorigin" }, ORIGIN)).toBe(false);
  });

  it("reads frame-ancestors, which wins over X-Frame-Options", () => {
    expect(
      allowsFraming(
        { csp: "default-src 'self'; frame-ancestors 'none'" },
        ORIGIN,
      ),
    ).toBe(false);
    expect(allowsFraming({ csp: "frame-ancestors 'self'" }, ORIGIN)).toBe(
      false,
    );
    expect(allowsFraming({ csp: "frame-ancestors *" }, ORIGIN)).toBe(true);
    expect(
      allowsFraming(
        { csp: "frame-ancestors https://*.barynt.io", xFrameOptions: "DENY" },
        ORIGIN,
      ),
    ).toBe(true);
    expect(
      allowsFraming({ csp: "frame-ancestors https://other.example" }, ORIGIN),
    ).toBe(false);
    expect(allowsFraming({ csp: "frame-ancestors https:" }, ORIGIN)).toBe(true);
  });
});

describe("only public addresses are fetched (SSRF)", () => {
  it("refuses private, loopback, link-local and mapped ones", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.20.0.1",
      "192.168.1.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "fe80::1",
      "fd00::1",
      "::ffff:127.0.0.1",
      "not-an-ip",
    ])
      expect(isPublicAddress(ip)).toBe(false);
  });

  it("lets public ones through", () => {
    for (const ip of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"])
      expect(isPublicAddress(ip)).toBe(true);
  });
});

describe("an embed's address", () => {
  it("is https only", () => {
    expect(normalizeEmbedUrl("grafana.example.com/d/x")).toBe(
      "https://grafana.example.com/d/x",
    );
    expect(normalizeEmbedUrl("http://example.com")).toBeNull();
    expect(normalizeEmbedUrl("javascript:alert(1)")).toBeNull();
  });

  it("is checked when saved", () => {
    const embed = (url: string) => [
      { id: "w1", type: "embed", size: "L", config: { url } },
    ];
    expect(widgetsSchema.safeParse(embed("https://example.com/")).success).toBe(
      true,
    );
    expect(widgetsSchema.safeParse(embed("http://example.com/")).success).toBe(
      false,
    );
  });
});
