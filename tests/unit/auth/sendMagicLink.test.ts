import { beforeEach, describe, expect, it, mock } from "bun:test";
import { AuthError } from "next-auth";

const mockSignIn = mock();

mock.module("@/lib/db", () => ({ db: {} }));
mock.module("@/auth", () => ({ signIn: mockSignIn, signOut: mock() }));

import { sendMagicLink } from "@/features/auth/actions";

function authErrorOfType(type: string): AuthError {
  const err = new AuthError("test");
  // biome-ignore lint/suspicious/noExplicitAny: `.type` is set by subclass constructors (AccessDenied.type etc.), not assignable on the base class from userland.
  (err as any).type = type;
  return err;
}

describe("sendMagicLink()", () => {
  beforeEach(() => {
    mockSignIn.mockReset();
  });

  it("rejects an empty address without ever calling next-auth", async () => {
    const result = await sendMagicLink("   ");
    expect(result).toEqual({ error: "Please enter your email address." });
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it("reports success for an allowed request", async () => {
    mockSignIn.mockResolvedValue(undefined);
    const result = await sendMagicLink("person@example.com");
    expect(result).toEqual({ ok: true });
  });

  // The `signIn` callback (auth.ts) throws AccessDenied for an unknown
  // address once AUTH_REGISTRATION_ENABLED=false — reported back the exact
  // same way as success, so a caller can't tell "no account for this
  // address" apart from "check your inbox". That distinction is precisely
  // the account-enumeration leak invite-only mode exists to close.
  it("reports success even when next-auth denies it — no account-enumeration leak", async () => {
    mockSignIn.mockRejectedValue(authErrorOfType("AccessDenied"));
    const result = await sendMagicLink("unknown@example.com");
    expect(result).toEqual({ ok: true });
  });

  it("still surfaces a genuine, unrelated failure", async () => {
    mockSignIn.mockRejectedValue(authErrorOfType("Configuration"));
    const result = await sendMagicLink("person@example.com");
    expect(result).toEqual({
      error: "Could not send the magic link. Please try again.",
    });
  });

  it("re-throws a non-auth error instead of swallowing it", async () => {
    mockSignIn.mockRejectedValue(new Error("boom"));
    await expect(sendMagicLink("person@example.com")).rejects.toThrow("boom");
  });
});
