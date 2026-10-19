// Pure, no `server-only` — the key scheme is plain string logic.

/**
 * `fieldoption` is not an avatar but shares the bucket, the presigned upload
 * and the key scheme: the image of a choice in a custom field, owned by the
 * workspace the field lives in.
 */
export type AvatarKind = "user" | "workspace" | "project" | "fieldoption";

/**
 * A random suffix per upload instead of a fixed name: "replace" therefore
 * always means "upload a new key, then delete the old one best-effort",
 * never an in-place overwrite — this avoids stale caches on signed URLs
 * that might keep serving the old content for a while.
 */
export function avatarObjectKey(
  kind: AvatarKind,
  ownerId: string,
  ext: string,
): string {
  return `${kind}s/${ownerId}/${crypto.randomUUID()}.${ext}`;
}

export function isOwnAvatarKey(
  kind: AvatarKind,
  ownerId: string,
  key: string,
): boolean {
  return key.startsWith(`${kind}s/${ownerId}/`);
}

/**
 * Derives the extension from the original file name — unlike avatars,
 * attachments have no MIME allowlist (every file type is permitted), so
 * also no MIME→extension table. Only printable, harmless characters; a
 * neutral fallback instead of an empty suffix when there's no usable
 * extension.
 */
export function sanitizeAttachmentExt(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot < 0 || dot === fileName.length - 1) return "bin";
  const ext = fileName
    .slice(dot + 1)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  return ext.slice(0, 10) || "bin";
}

/**
 * A random suffix per upload, same as for avatars — "replace" here too
 * always means "new key, old one gets deleted best-effort", never an
 * in-place overwrite.
 */
export function attachmentObjectKey(issueId: string, ext: string): string {
  return `attachments/${issueId}/${crypto.randomUUID()}.${ext}`;
}

export function isOwnAttachmentKey(issueId: string, key: string): boolean {
  return key.startsWith(`attachments/${issueId}/`);
}
