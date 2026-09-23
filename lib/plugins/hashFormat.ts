// The format of the hash of a plugin's files, `sha512-<base64>`. In its own file
// with no dependencies, so `integrity.ts` (which reads the disk) and `policy.ts`
// (which decides) agree on what a valid one looks like without one importing the other.

export const INTEGRITY_PREFIX = "sha512-";

/** SHA-512 is 64 bytes, 88 characters of base64 with padding. */
export const INTEGRITY_FORMAT = /^sha512-[A-Za-z0-9+/]{86}==$/;

export function isIntegrityHash(value: unknown): value is string {
  return typeof value === "string" && INTEGRITY_FORMAT.test(value);
}
