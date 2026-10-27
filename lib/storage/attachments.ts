import "server-only";
import { storageConfig } from "@/lib/storage/config";
import {
  attachmentObjectKey,
  isOwnAttachmentKey,
  sanitizeAttachmentExt,
} from "@/lib/storage/keys";
import {
  deleteObjectSafely,
  getObjectBytes,
  objectExists,
  presignGetUrl,
  presignPutUrl,
  putObject,
} from "@/lib/storage/presign";
import { ATTACHMENT_MAX_BYTES } from "@/lib/storage/validation";

export type RequestAttachmentUploadResult =
  | { ok: true; key: string; uploadUrl: string }
  | { error: string };

/**
 * Like `requestAvatarUpload`, just without a MIME allowlist — every file
 * type is permitted, only the size is limited. RBAC (permission to edit
 * the issue) stays outside this file, in `features/issues/actions.ts`.
 */
export async function requestAttachmentUpload(input: {
  issueId: string;
  fileName: string;
  contentType: string;
  contentLength: number;
}): Promise<RequestAttachmentUploadResult> {
  const config = storageConfig();
  if (!config?.bucketIssues) {
    return { error: "Attachment uploads are not configured." };
  }
  if (input.contentLength > ATTACHMENT_MAX_BYTES) {
    return { error: "File is too large (max. 100 MB)." };
  }

  const ext = sanitizeAttachmentExt(input.fileName);
  const key = attachmentObjectKey(input.issueId, ext);
  const uploadUrl = await presignPutUrl(config.bucketIssues, key, {
    contentType: input.contentType,
  });
  if (!uploadUrl) return { error: "Attachment uploads are not configured." };

  return { ok: true, key, uploadUrl };
}

export type FinalizeAttachmentUploadResult =
  | { ok: true; size: number }
  | { error: string };

/**
 * Confirms an upload after the direct PUT against S3 — checks ownership of
 * the key (against tampered keys from the client), that the object exists,
 * and reads the actual size (not the one the client claims).
 */
export async function finalizeAttachmentUpload(
  issueId: string,
  key: string,
): Promise<FinalizeAttachmentUploadResult> {
  if (!isOwnAttachmentKey(issueId, key)) {
    return { error: "Invalid upload key." };
  }

  const config = storageConfig();
  if (!config?.bucketIssues) {
    return { error: "Attachment uploads are not configured." };
  }

  const head = await objectExists(config.bucketIssues, key);
  if (!head.exists) return { error: "Upload not found — please try again." };
  if (head.size > ATTACHMENT_MAX_BYTES) {
    await deleteObjectSafely(config.bucketIssues, key);
    return { error: "File is too large (max. 100 MB)." };
  }

  return { ok: true, size: head.size };
}

export async function deleteAttachmentObject(
  key: string | null | undefined,
): Promise<void> {
  if (!key) return;
  const config = storageConfig();
  if (!config?.bucketIssues) return;
  await deleteObjectSafely(config.bucketIssues, key);
}

export async function resolveAttachmentUrl(
  key: string | null | undefined,
): Promise<string | null> {
  if (!key) return null;
  const config = storageConfig();
  if (!config?.bucketIssues) return null;
  return presignGetUrl(config.bucketIssues, key);
}

export type StoreAttachmentResult =
  | { ok: true; key: string; size: number }
  | { error: string };

/**
 * Stores a file the server already holds in memory (the public API's inline
 * upload, base64 in the request) — the same key scheme and size limit as a
 * browser upload, just without the presigned round trip.
 */
export async function storeAttachmentBytes(input: {
  issueId: string;
  fileName: string;
  contentType: string;
  bytes: Uint8Array<ArrayBuffer>;
}): Promise<StoreAttachmentResult> {
  const config = storageConfig();
  if (!config?.bucketIssues) {
    return { error: "Attachment uploads are not configured." };
  }
  if (input.bytes.byteLength > ATTACHMENT_MAX_BYTES) {
    return { error: "File is too large (max. 100 MB)." };
  }

  const key = attachmentObjectKey(
    input.issueId,
    sanitizeAttachmentExt(input.fileName),
  );
  const stored = await putObject(
    config.bucketIssues,
    key,
    input.bytes,
    input.contentType,
  );
  if (!stored) return { error: "Upload failed — please try again." };
  return { ok: true, key, size: input.bytes.byteLength };
}

/** A stored attachment's bytes, up to `maxBytes` — `null` when it's larger,
 *  missing, or storage isn't configured. */
export async function readAttachmentBytes(
  key: string | null | undefined,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  if (!key) return null;
  const config = storageConfig();
  if (!config?.bucketIssues) return null;
  return getObjectBytes(config.bucketIssues, key, maxBytes);
}
