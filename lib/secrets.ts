import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
} from "node:crypto";

// Secrets the app has to read back later, such as the access token for a private
// plugin store. A password is hashed and never read; this is for the other kind,
// where the value itself is needed again, so it has to be stored in a form that
// can be opened, and only by the app.
//
// AES-256-GCM, with a key derived from the environment: `SECRETS_KEY` if it is
// set, else `AUTH_SECRET`. Each value carries a random nonce and is bound to a
// *context* (for a store's token, that store's address). The context is
// authenticated but not stored, so a sealed value copied to another row, or
// another kind of column, does not open there: someone who can write to the
// database cannot point a token at a different host by swapping two values.
//
// What this protects: a database dump, a backup or a log line on its own. What
// it does not: whoever holds the key as well, and code that runs in the app's
// process, which can read the environment. That is the same limit as everywhere
// for in-process plugin code (docs/plugins/security.md).
//
// Changing the key makes every sealed value unreadable. `openSecret` then gives
// `null`, which callers treat as "there is no secret", never as a reason to fall
// back to something weaker; the admin enters the secret again.

const VERSION = "v1";
const MIN_KEY_LENGTH = 32;
const HKDF_SALT = "barynt/secrets/v1";
const HKDF_INFO = "aes-256-gcm";
const IV_BYTES = 12;
const TAG_BYTES = 16;
const PART = /^[A-Za-z0-9_-]*$/;

/** There is no usable key to seal with. The message names no value. */
export class SecretsKeyError extends Error {
  constructor() {
    super(
      `Secrets cannot be stored: set SECRETS_KEY (or AUTH_SECRET) to at least ${MIN_KEY_LENGTH} characters.`,
    );
    this.name = "SecretsKeyError";
  }
}

function keyMaterial(): string | null {
  const own = process.env.SECRETS_KEY;
  // A `SECRETS_KEY` that is set but too short does not fall back to
  // `AUTH_SECRET`: that would hide a mistake, and sealed values would change
  // key without anyone having asked for it.
  const material =
    own !== undefined && own !== "" ? own : process.env.AUTH_SECRET;
  return typeof material === "string" && material.length >= MIN_KEY_LENGTH
    ? material
    : null;
}

function deriveKey(): Buffer {
  const material = keyMaterial();
  if (!material) throw new SecretsKeyError();
  return Buffer.from(hkdfSync("sha256", material, HKDF_SALT, HKDF_INFO, 32));
}

function additionalData(context: string): Buffer {
  return Buffer.from(`barynt-secret:${VERSION}:${context}`, "utf8");
}

/** Is there a key to seal with? For a form that wants to say so before it is filled in. */
export function isSecretsKeyAvailable(): boolean {
  return keyMaterial() !== null;
}

/**
 * Seals `plaintext` for `context`. Throws `SecretsKeyError` if there is no key;
 * nothing else about the input is a reason to throw.
 */
export function sealSecret(plaintext: string, context: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(additionalData(context));
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString("base64url"),
    encrypted.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
  ].join(".");
}

/**
 * Opens a sealed value, or gives `null`. It never throws: a value that is
 * malformed, altered, sealed for another context or with another key is all the
 * same answer, and the reason is not told to the caller, because there is
 * nothing a caller may do differently.
 */
export function openSecret(sealed: string, context: string): string | null {
  try {
    if (typeof sealed !== "string" || typeof context !== "string") return null;
    const parts = sealed.split(".");
    if (parts.length !== 4 || parts[0] !== VERSION) return null;
    if (!parts.every((part) => PART.test(part))) return null;

    const iv = Buffer.from(parts[1], "base64url");
    const encrypted = Buffer.from(parts[2], "base64url");
    const tag = Buffer.from(parts[3], "base64url");
    // Checked twice on purpose, here and by `authTagLength` below: without
    // both, Node and Bun accept a tag cut to 4 bytes, which is far easier to
    // forge than a full one. Either alone is enough today; the second is there
    // so that dropping one in a refactor changes nothing.
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

    const decipher = createDecipheriv("aes-256-gcm", deriveKey(), iv, {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(additionalData(context));
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
