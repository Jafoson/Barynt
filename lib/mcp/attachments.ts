import "server-only";
import type { CallToolResult } from "@modelcontextprotocol/server";
import type { ApiAttachment } from "@/features/api-v1/queries";
import { readAttachmentBytes } from "@/lib/storage";

// `get_attachment` with `includeContent`: hands a stored file to the agent
// itself, so it can look at a screenshot or read a log without a browser.
// Only what an MCP client can actually take in — an image as an image
// block, a text file as text — and only small ones. Links are never
// fetched: that would make the server request arbitrary addresses on the
// caller's behalf.

const IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
const TEXT_MAX_BYTES = 512 * 1024;

/** Text-like, judged by the stored MIME type — or, without a useful one, by
 *  the file name's extension. */
function isText(mimeType: string | null, name: string): boolean {
  if (mimeType?.startsWith("text/")) return true;
  if (
    mimeType &&
    /^application\/(json|xml|yaml|x-yaml|javascript|x-sh|sql|toml|x-ndjson)$/.test(
      mimeType,
    )
  )
    return true;
  return /\.(txt|md|markdown|csv|tsv|json|ndjson|xml|ya?ml|toml|ini|log|diff|patch|sql|sh|[cm]?[jt]sx?|py|rb|go|rs|java|kt|swift|php|cs|c|h|cpp|hpp|css|scss|html?)$/i.test(
    name,
  );
}

function withNote(attachment: ApiAttachment, note: string): CallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({ ...attachment, note }, null, 2),
      },
    ],
  };
}

export async function attachmentContent(
  attachment: ApiAttachment,
  key: string | null,
): Promise<CallToolResult> {
  const meta = {
    type: "text" as const,
    text: JSON.stringify(attachment, null, 2),
  };

  if (attachment.kind === "link") {
    return withNote(
      attachment,
      "A link — its content isn't fetched. Open `url` to view it.",
    );
  }

  const mimeType = attachment.mimeType?.toLowerCase() ?? null;
  if (mimeType && IMAGE_TYPES.has(mimeType)) {
    const file = await readAttachmentBytes(key, IMAGE_MAX_BYTES);
    if (!file) {
      return withNote(
        attachment,
        "Content not included: the image is over 5 MB or couldn't be read. Open `url` to view it.",
      );
    }
    return {
      content: [
        meta,
        {
          type: "image",
          data: Buffer.from(file.bytes).toString("base64"),
          mimeType,
        },
      ],
    };
  }

  if (isText(mimeType, attachment.name)) {
    const file = await readAttachmentBytes(key, TEXT_MAX_BYTES);
    if (!file) {
      return withNote(
        attachment,
        "Content not included: the file is over 512 KB or couldn't be read. Open `url` to view it.",
      );
    }
    return {
      content: [
        meta,
        { type: "text", text: new TextDecoder().decode(file.bytes) },
      ],
    };
  }

  return withNote(
    attachment,
    "Content not included: only images (PNG, JPEG, GIF, WebP) and text files can be inlined. Open `url` to view it.",
  );
}
