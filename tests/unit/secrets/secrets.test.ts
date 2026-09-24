import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  isSecretsKeyAvailable,
  openSecret,
  SecretsKeyError,
  sealSecret,
} from "@/lib/secrets";

// Sealing for values the app has to read back, such as a private store's token.
// What matters: the plaintext is not in the sealed form, a value only opens for
// the context it was sealed for and with the key it was sealed with, any change
// to it makes it fail instead of giving something else, and opening never
// throws. Real crypto, no mocks.

const KEY_A = "a".repeat(40);
const KEY_B = "b".repeat(40);
const CONTEXT = "pluginStore:https://git.example.com/team/plugins";

let saved: { SECRETS_KEY?: string; AUTH_SECRET?: string };

beforeEach(() => {
  saved = {
    SECRETS_KEY: process.env.SECRETS_KEY,
    AUTH_SECRET: process.env.AUTH_SECRET,
  };
  delete process.env.SECRETS_KEY;
  process.env.AUTH_SECRET = KEY_A;
});

afterEach(() => {
  for (const name of ["SECRETS_KEY", "AUTH_SECRET"] as const) {
    if (saved[name] === undefined) delete process.env[name];
    else process.env[name] = saved[name];
  }
});

/** Replaces one dot-separated part of a sealed value. */
function withPart(sealed: string, index: number, value: string): string {
  const parts = sealed.split(".");
  parts[index] = value;
  return parts.join(".");
}

/** Flips one character of a part to another valid one. */
function flip(part: string): string {
  return (part[0] === "A" ? "B" : "A") + part.slice(1);
}

describe("sealSecret and openSecret", () => {
  it("opens what it sealed", () => {
    const sealed = sealSecret("ghp_exampleToken123", CONTEXT);
    expect(openSecret(sealed, CONTEXT)).toBe("ghp_exampleToken123");
  });

  it("keeps any text, including non-ASCII and an empty one", () => {
    for (const value of ["", "ä ö ü ß 日本語 🔐", "a.b.c", "x".repeat(5000)]) {
      expect(openSecret(sealSecret(value, CONTEXT), CONTEXT)).toBe(value);
    }
  });

  it("does not contain the plaintext or the context", () => {
    const sealed = sealSecret("ghp_exampleToken123", CONTEXT);
    expect(sealed).not.toContain("ghp_exampleToken123");
    expect(sealed).not.toContain(CONTEXT);
    expect(sealed).not.toContain(
      Buffer.from("ghp_exampleToken123").toString("base64url"),
    );
  });

  it("has the shape v1.<nonce>.<data>.<tag>", () => {
    const parts = sealSecret("secret", CONTEXT).split(".");
    expect(parts).toHaveLength(4);
    expect(parts[0]).toBe("v1");
    expect(Buffer.from(parts[1], "base64url")).toHaveLength(12);
    expect(Buffer.from(parts[3], "base64url")).toHaveLength(16);
  });

  it("gives a different value every time, so equal secrets cannot be seen as equal", () => {
    const first = sealSecret("secret", CONTEXT);
    const second = sealSecret("secret", CONTEXT);
    expect(first).not.toBe(second);
    expect(openSecret(first, CONTEXT)).toBe("secret");
    expect(openSecret(second, CONTEXT)).toBe("secret");
  });
});

describe("context binding", () => {
  it("does not open for another context", () => {
    const sealed = sealSecret("secret", CONTEXT);
    expect(
      openSecret(sealed, "pluginStore:https://evil.example.com/plugins"),
    ).toBeNull();
    expect(openSecret(sealed, "")).toBeNull();
    // The same text as another kind of column would use it.
    expect(openSecret(sealed, `other:${CONTEXT}`)).toBeNull();
  });

  it("does not open when the context only differs in case or a trailing slash", () => {
    const sealed = sealSecret("secret", CONTEXT);
    expect(openSecret(sealed, CONTEXT.toUpperCase())).toBeNull();
    expect(openSecret(sealed, `${CONTEXT}/`)).toBeNull();
  });
});

describe("keys", () => {
  it("does not open with another key", () => {
    const sealed = sealSecret("secret", CONTEXT);
    process.env.AUTH_SECRET = KEY_B;
    expect(openSecret(sealed, CONTEXT)).toBeNull();
    process.env.AUTH_SECRET = KEY_A;
    expect(openSecret(sealed, CONTEXT)).toBe("secret");
  });

  it("uses SECRETS_KEY over AUTH_SECRET when it is set", () => {
    process.env.SECRETS_KEY = KEY_B;
    const sealed = sealSecret("secret", CONTEXT);
    expect(openSecret(sealed, CONTEXT)).toBe("secret");
    // Without the own key, AUTH_SECRET alone cannot open it.
    delete process.env.SECRETS_KEY;
    expect(openSecret(sealed, CONTEXT)).toBeNull();
  });

  it("falls back to AUTH_SECRET when SECRETS_KEY is empty", () => {
    process.env.SECRETS_KEY = "";
    const sealed = sealSecret("secret", CONTEXT);
    delete process.env.SECRETS_KEY;
    expect(openSecret(sealed, CONTEXT)).toBe("secret");
  });

  it("does not fall back to AUTH_SECRET when SECRETS_KEY is set but too short", () => {
    process.env.SECRETS_KEY = "short";
    expect(isSecretsKeyAvailable()).toBe(false);
    expect(() => sealSecret("secret", CONTEXT)).toThrow(SecretsKeyError);
  });

  it("needs at least 32 characters", () => {
    process.env.AUTH_SECRET = "x".repeat(31);
    expect(isSecretsKeyAvailable()).toBe(false);
    process.env.AUTH_SECRET = "x".repeat(32);
    expect(isSecretsKeyAvailable()).toBe(true);
  });

  it("refuses to seal without a key, and the message does not contain a key", () => {
    delete process.env.AUTH_SECRET;
    expect(isSecretsKeyAvailable()).toBe(false);
    let thrown: unknown;
    try {
      sealSecret("secret", CONTEXT);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(SecretsKeyError);
    expect((thrown as Error).message).toContain("SECRETS_KEY");
    expect((thrown as Error).message).not.toContain(KEY_A);
  });

  it("gives null, not an error, when it cannot open for want of a key", () => {
    const sealed = sealSecret("secret", CONTEXT);
    delete process.env.AUTH_SECRET;
    expect(openSecret(sealed, CONTEXT)).toBeNull();
  });
});

describe("altered values", () => {
  const sealed = () => sealSecret("secret", CONTEXT);

  it.each([
    ["the version", 0],
    ["the nonce", 1],
    ["the data", 2],
    ["the tag", 3],
  ])("does not open when %s is changed", (_name, index) => {
    const value = sealed();
    const parts = value.split(".");
    expect(
      openSecret(withPart(value, index, flip(parts[index])), CONTEXT),
    ).toBeNull();
  });

  it("does not open when a part is left out, added or empty", () => {
    const value = sealed();
    const [v, iv, data, tag] = value.split(".");
    expect(openSecret([v, iv, data].join("."), CONTEXT)).toBeNull();
    expect(openSecret([v, iv, data, tag, "x"].join("."), CONTEXT)).toBeNull();
    expect(openSecret([v, "", data, tag].join("."), CONTEXT)).toBeNull();
    expect(openSecret([v, iv, data, ""].join("."), CONTEXT)).toBeNull();
  });

  it("does not open when a character that is not base64url is slipped in", () => {
    // The lenient decoder would skip it and still open the same bytes; a value
    // that is not exactly what was sealed is refused instead.
    const value = sealed();
    const parts = value.split(".");
    for (const index of [1, 2, 3]) {
      for (const junk of ["=", "+", "/", " ", "\n", "\u0000"]) {
        expect(
          openSecret(withPart(value, index, parts[index] + junk), CONTEXT),
        ).toBeNull();
      }
    }
  });

  it("does not open with a shortened tag", () => {
    // GCM allows short tags, which are much easier to forge. The first four
    // bytes of the real tag are a correct prefix, so only a check on the
    // length keeps such a value from opening.
    const value = sealed();
    const tag = Buffer.from(value.split(".")[3], "base64url");
    for (const length of [0, 1, 4, 8, 12, 15]) {
      const shortened = tag.subarray(0, length).toString("base64url");
      expect(openSecret(withPart(value, 3, shortened), CONTEXT)).toBeNull();
    }
  });

  it("does not open with a nonce of another length", () => {
    const value = sealed();
    const nonce = Buffer.from(value.split(".")[1], "base64url");
    for (const other of [nonce.subarray(0, 8), Buffer.concat([nonce, nonce])]) {
      expect(
        openSecret(withPart(value, 1, other.toString("base64url")), CONTEXT),
      ).toBeNull();
    }
  });

  it("does not open a value of another version", () => {
    expect(openSecret(withPart(sealed(), 0, "v2"), CONTEXT)).toBeNull();
    expect(openSecret(withPart(sealed(), 0, "V1"), CONTEXT)).toBeNull();
  });

  it("never throws on anything that is not a sealed value", () => {
    const garbage: unknown[] = [
      "",
      ".",
      "...",
      "v1...",
      "not a sealed value",
      "v1.AAAA.AAAA.AAAA",
      "a".repeat(10_000),
      undefined,
      null,
      42,
      {},
      [],
    ];
    for (const value of garbage) {
      expect(openSecret(value as string, CONTEXT)).toBeNull();
    }
    expect(openSecret(sealed(), undefined as unknown as string)).toBeNull();
  });
});
