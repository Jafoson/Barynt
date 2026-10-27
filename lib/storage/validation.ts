// Pure, no `server-only` — also imported directly by the client component
// `AvatarUploader` (not through the server-only barrel), analogous to
// `lib/richtext`.

export const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const AVATAR_MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export function avatarExtensionFor(contentType: string): string | null {
  return AVATAR_MIME_EXTENSIONS[contentType] ?? null;
}

/// Every file type is permitted (images, general files, videos) — only the
/// size is limited. Generous enough for short video clips; easy to adjust
/// in this one place.
export const ATTACHMENT_MAX_BYTES = 100 * 1024 * 1024; // 100 MB

/** Common types by extension — so a file sent without a MIME type still
 *  opens in the browser (an image as an image, a PDF as a PDF) instead of
 *  downloading as an anonymous blob. Anything unknown stays a blob. */
const CONTENT_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  pdf: "application/pdf",
  txt: "text/plain",
  md: "text/markdown",
  csv: "text/csv",
  json: "application/json",
  xml: "application/xml",
  yaml: "application/yaml",
  yml: "application/yaml",
  html: "text/html",
  log: "text/plain",
  zip: "application/zip",
  mp4: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
};

export function guessContentType(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const ext = dot < 0 ? "" : fileName.slice(dot + 1).toLowerCase();
  return CONTENT_TYPES[ext] ?? "application/octet-stream";
}
