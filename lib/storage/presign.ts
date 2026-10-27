import "server-only";
import { getClient } from "@/lib/storage/client";
import { storageConfig } from "@/lib/storage/config";

// Short: the upload starts immediately after the request, no need for a
// long lifetime.
export const PUT_EXPIRES_IN = 120;
// Valid for one server-render's worth of time — generous, since it's
// re-signed the next time the page renders (no URL cache, see avatars.ts).
// The public API states it as `urlExpiresAt` next to each attachment URL.
export const GET_EXPIRES_IN = 3600;

/** `/` in an object key stays a path separator, everything else gets encoded. */
function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

/** Always path-style (`<endpoint>/<bucket>/<key>`) — works the same way
 *  for rustfs, MinIO, and AWS S3, without a bucket-specific subdomain. */
function objectUrl(endpoint: string, bucket: string, key: string): string {
  return `${endpoint.replace(/\/$/, "")}/${bucket}/${encodeKey(key)}`;
}

export async function presignPutUrl(
  bucket: string,
  key: string,
  opts: { contentType: string },
): Promise<string | null> {
  const config = storageConfig();
  const client = getClient();
  if (!config || !client) return null;

  const url = new URL(objectUrl(config.publicEndpoint, bucket, key));
  url.searchParams.set("X-Amz-Expires", String(PUT_EXPIRES_IN));

  const request = await client.sign(url.toString(), {
    method: "PUT",
    headers: { "content-type": opts.contentType },
    aws: { signQuery: true },
  });
  return request.url;
}

export async function presignGetUrl(
  bucket: string,
  key: string,
): Promise<string | null> {
  const config = storageConfig();
  const client = getClient();
  if (!config || !client) return null;

  const url = new URL(objectUrl(config.publicEndpoint, bucket, key));
  url.searchParams.set("X-Amz-Expires", String(GET_EXPIRES_IN));

  const request = await client.sign(url.toString(), {
    method: "GET",
    aws: { signQuery: true },
  });
  return request.url;
}

export async function objectExists(
  bucket: string,
  key: string,
): Promise<{ exists: true; size: number } | { exists: false }> {
  const config = storageConfig();
  const client = getClient();
  if (!config || !client) return { exists: false };

  try {
    const res = await client.fetch(objectUrl(config.endpoint, bucket, key), {
      method: "HEAD",
    });
    if (!res.ok) return { exists: false };
    return {
      exists: true,
      size: Number(res.headers.get("content-length") ?? 0),
    };
  } catch {
    return { exists: false };
  }
}

/**
 * Writes an object from the server itself (the API's inline upload), over
 * the internal endpoint — the browser path never goes through here, it PUTs
 * to a presigned URL directly. `false` on any failure.
 */
export async function putObject(
  bucket: string,
  key: string,
  body: Uint8Array<ArrayBuffer>,
  contentType: string,
): Promise<boolean> {
  const config = storageConfig();
  const client = getClient();
  if (!config || !client) return false;

  try {
    const res = await client.fetch(objectUrl(config.endpoint, bucket, key), {
      method: "PUT",
      headers: { "content-type": contentType },
      body,
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Reads an object into memory, but only up to `maxBytes` — anything larger
 * comes back as `null` without being downloaded (checked against
 * `content-length` first). For handing small files to an MCP client.
 */
export async function getObjectBytes(
  bucket: string,
  key: string,
  maxBytes: number,
): Promise<{ bytes: Uint8Array; contentType: string | null } | null> {
  const config = storageConfig();
  const client = getClient();
  if (!config || !client) return null;

  try {
    const res = await client.fetch(objectUrl(config.endpoint, bucket, key), {
      method: "GET",
    });
    if (!res.ok) return null;
    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > maxBytes) {
      await res.body?.cancel();
      return null;
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength > maxBytes) return null;
    return { bytes, contentType: res.headers.get("content-type") };
  } catch {
    return null;
  }
}

/** Deletes an object best-effort — never throws, analogous to `sendMail()`. */
export async function deleteObjectSafely(
  bucket: string,
  key: string,
): Promise<void> {
  const config = storageConfig();
  const client = getClient();
  if (!config || !client) return;

  try {
    await client.fetch(objectUrl(config.endpoint, bucket, key), {
      method: "DELETE",
    });
  } catch (error) {
    console.error(
      "[lib/storage] failed to delete object",
      { bucket, key },
      error,
    );
  }
}
