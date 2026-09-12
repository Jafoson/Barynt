import { describe, expect, it } from "bun:test";
import { createHash } from "node:crypto";
import { verifyPkce } from "@/lib/oauth/pkce";

function s256(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

describe("verifyPkce()", () => {
  it("accepts a matching S256 verifier/challenge pair", () => {
    const verifier = "a-random-verifier-with-enough-entropy";
    expect(verifyPkce(verifier, s256(verifier), "S256")).toBe(true);
  });

  it("rejects a verifier that doesn't hash to the stored challenge", () => {
    expect(
      verifyPkce("wrong-verifier", s256("original-verifier"), "S256"),
    ).toBe(false);
  });

  it("rejects the plain method outright — OAuth 2.1 requires S256", () => {
    const verifier = "some-verifier";
    // Even when the "challenge" is literally the verifier (what `plain`
    // would accept), a `plain` method must never pass here.
    expect(verifyPkce(verifier, verifier, "plain")).toBe(false);
  });

  it("rejects an unrecognized method", () => {
    expect(verifyPkce("v", s256("v"), "S1")).toBe(false);
  });
});
