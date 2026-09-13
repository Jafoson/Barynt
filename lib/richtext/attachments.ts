import type { PMDoc, PMNode } from "./types";

/** Attributes of the `attachment` node, as read by the editor and the display. */
export interface AttachmentAttrs {
  id: string | null;
  url: string | null;
  name: string;
  mimeType: string | null;
  size: number | null;
  /** Width in pixels, set by the drag handle in the editor. `null` ⇒ default width. */
  width: number | null;
}

export const ATTACHMENT_IMAGE_MIN_WIDTH = 160;
export const ATTACHMENT_IMAGE_MAX_WIDTH = 720;
export const ATTACHMENT_IMAGE_DEFAULT_WIDTH = 320;

/**
 * Forces a width within the draggable range — the same range for the drag
 * handle in the editor (`AttachmentView`) and the display (`RichText`), so
 * a stored value never appears a different size between the two. If the
 * width is missing (no attribute, or not a valid number), the default
 * applies.
 */
export function clampAttachmentWidth(width: unknown): number {
  const n =
    typeof width === "number" && Number.isFinite(width)
      ? width
      : ATTACHMENT_IMAGE_DEFAULT_WIDTH;
  return Math.min(
    ATTACHMENT_IMAGE_MAX_WIDTH,
    Math.max(ATTACHMENT_IMAGE_MIN_WIDTH, Math.round(n)),
  );
}

/** What a resolved `Attachment` row contributes for rendering in the document. */
export interface ResolvedAttachmentRef {
  url: string;
  name: string;
  mimeType: string | null;
  size: number | null;
}

/**
 * MIME type for dragging an existing attachment tile out of the attachments
 * section (`IssueAttachments.tsx`) into the editor — there it lands as a
 * perfectly normal `attachment` node, without a re-upload, simply by
 * referencing the same `Attachment` row. A dedicated MIME type instead of
 * `text/plain`/`text/html`, so `RichTextEditor.tsx`'s `handleDrop` can tell
 * an external file drop (a real file from the OS) apart from this internal
 * reference drop. Defined here rather than in either UI layer, because both
 * the attachments section (source, in `features/`) and the editor (target,
 * in `components/ui`) need it, without either one depending on the other.
 */
export const ATTACHMENT_DRAG_MIME = "application/x-issue-tracker-attachment";

/** Payload behind `ATTACHMENT_DRAG_MIME` — the same fields as a freshly
 *  uploaded attachment (`UploadedAttachment` in `RichTextEditor.tsx`). */
export interface AttachmentDragPayload {
  id: string;
  url: string;
  name: string;
  mimeType: string | null;
  size: number | null;
}

/** Human-readable file size — `RichText`, `AttachmentView`, and the
 *  attachments section all show the same format, hence one place for it. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unit]}`;
}

/** Icon for an attachment with no real thumbnail (tile fallback, preview
 *  dialog) — `RichText`, `AttachmentView`, the attachments section, and the
 *  preview dialog should all agree on one view of a MIME type, hence one
 *  place for it, same as `formatBytes`. */
export function iconForMimeType(mimeType: string | null): string {
  if (mimeType === "application/pdf") return "lucide:file-text";
  if (mimeType?.startsWith("image/")) return "lucide:image";
  if (mimeType?.startsWith("video/")) return "lucide:film";
  if (mimeType?.startsWith("audio/")) return "lucide:file-audio";
  return "lucide:file";
}

function mapAttachmentNodes(
  nodes: PMNode[] | undefined,
  fn: (
    attrs: Record<string, unknown> | null | undefined,
  ) => Record<string, unknown>,
): PMNode[] | undefined {
  if (!nodes) return nodes;
  return nodes.map((node) =>
    node.type === "attachment"
      ? { ...node, attrs: fn(node.attrs) }
      : node.content
        ? { ...node, content: mapAttachmentNodes(node.content, fn) }
        : node,
  );
}

/**
 * Read path: enriches every `attachment` node with the resolved URL, name,
 * MIME type, and size — `byId` comes from the issue's freshly loaded
 * `Attachment` rows. If the id is missing from `byId` (a deleted
 * attachment), the node is left without a `url`; the display and editor
 * then show a "attachment removed" placeholder instead of a dead image.
 */
export function withResolvedAttachments(
  doc: PMDoc,
  byId: Record<string, ResolvedAttachmentRef>,
): PMDoc {
  return {
    ...doc,
    content: mapAttachmentNodes(doc.content, (attrs) => {
      const id = typeof attrs?.id === "string" ? attrs.id : null;
      const resolved = id ? byId[id] : undefined;
      return {
        id,
        url: resolved?.url ?? null,
        name: resolved?.name ?? "",
        mimeType: resolved?.mimeType ?? null,
        size: resolved?.size ?? null,
        // Unlike the other attributes, not derived from the `Attachment`
        // row but a setting of the document itself — therefore preserved
        // from the original node instead of coming from `byId`.
        width: typeof attrs?.width === "number" ? attrs.width : null,
      };
    }),
  };
}

/**
 * Write path: strips the display-resolved attributes back off every
 * `attachment` node before `description` is written to the database —
 * guards against a client that accidentally sends them back. A presigned
 * URL expires after an hour; storing it would be pointless anyway (same as
 * avatars, see `lib/storage`).
 *
 * `width` is exempt from this: unlike `url`/`name`/`mimeType`/`size`, it's
 * not derived from the `Attachment` row but a genuine setting of the
 * document (set by the drag handle in the editor) — if it's lost, the
 * image snaps back to the default width on the next load.
 */
export function stripAttachmentAttrs(doc: PMDoc): PMDoc {
  return {
    ...doc,
    content: mapAttachmentNodes(doc.content, (attrs) => ({
      id: typeof attrs?.id === "string" ? attrs.id : null,
      width: typeof attrs?.width === "number" ? attrs.width : null,
    })),
  };
}

function transformAttachmentNodes(
  nodes: PMNode[] | undefined,
  fn: (
    attrs: Record<string, unknown> | null | undefined,
  ) => Record<string, unknown> | null,
): PMNode[] | undefined {
  if (!nodes) return nodes;
  return nodes.flatMap((node) => {
    if (node.type === "attachment") {
      const attrs = fn(node.attrs);
      return attrs ? [{ ...node, attrs }] : [];
    }
    if (node.content) {
      return [{ ...node, content: transformAttachmentNodes(node.content, fn) }];
    }
    return [node];
  });
}

/**
 * Create-issue composer only: before the issue exists there's no
 * `Attachment` row yet to reference, so a pasted/dropped image there gets a
 * locally generated draft id and a `blob:` URL for preview instead of going
 * through the upload endpoints (those all require an `issueId`). Once the
 * issue is actually created and the pending files/links turn into real
 * `Attachment` rows, this swaps each draft id in `doc` for the real one —
 * `idMap` maps draft id → real id, or `null` for an upload that failed, in
 * which case the node is dropped instead of pointing at nothing.
 */
export function remapAttachmentIds(
  doc: PMDoc,
  idMap: Map<string, string | null>,
): PMDoc {
  return {
    ...doc,
    content: transformAttachmentNodes(doc.content, (attrs) => {
      const draftId = typeof attrs?.id === "string" ? attrs.id : null;
      if (!draftId || !idMap.has(draftId)) return attrs ?? null;
      const realId = idMap.get(draftId);
      if (!realId) return null;
      return {
        id: realId,
        width: typeof attrs?.width === "number" ? attrs.width : null,
      };
    }),
  };
}
