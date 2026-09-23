import { MAX_STORE_TOKEN_LENGTH, MAX_STORE_USERNAME_LENGTH } from "./constants";

// What may be entered as access to a private store. Kept strict on purpose: the
// values end up in an HTTP header or a command line later (the store client,
// BARY-105), so anything that could break out of one, a space, a line break or
// any other control character, is refused here rather than escaped there. Real
// tokens (GitHub, GitLab, Gitea, Bitbucket, Azure DevOps) are plain visible ASCII.

/** Visible ASCII, no space. */
const VISIBLE = /^[\x21-\x7e]+$/;

export type ParsedStoreCredential =
  | { ok: true; username: string | null; token: string }
  | { error: string };

export function parseStoreCredential(input: {
  username?: unknown;
  token?: unknown;
}): ParsedStoreCredential {
  const token = typeof input?.token === "string" ? input.token.trim() : "";
  if (!token) return { error: "Enter the access token." };
  if (token.length > MAX_STORE_TOKEN_LENGTH) {
    return {
      error: `The access token can be at most ${MAX_STORE_TOKEN_LENGTH} characters.`,
    };
  }
  if (!VISIBLE.test(token)) {
    return {
      error:
        "The access token may only contain visible characters, without spaces or line breaks.",
    };
  }

  const raw = typeof input.username === "string" ? input.username.trim() : "";
  if (!raw) return { ok: true, username: null, token };
  if (raw.length > MAX_STORE_USERNAME_LENGTH) {
    return {
      error: `The user name can be at most ${MAX_STORE_USERNAME_LENGTH} characters.`,
    };
  }
  // A colon separates user name and token in HTTP basic authentication.
  if (!VISIBLE.test(raw) || raw.includes(":")) {
    return {
      error:
        "The user name may only contain visible characters, without spaces, line breaks or a colon.",
    };
  }
  return { ok: true, username: raw, token };
}
