"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { type DragEvent, useRef, useState } from "react";
import { FilePreview } from "@/components/ui/atoms/FilePreview/FilePreview";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { LinkForm } from "@/components/ui/layout/RichTextEditor/components/LinkForm/LinkForm";
import {
  addIssueLinkAttachment,
  deleteIssueAttachment,
} from "@/features/issues/actions";
import { uploadIssueAttachment } from "@/features/issues/uploadAttachment";
import { useModal } from "@/lib/context/ModalContext/modalContext";
import {
  ATTACHMENT_DRAG_MIME,
  type AttachmentDragPayload,
  formatBytes,
  iconForMimeType,
} from "@/lib/richtext/attachments";
import { faviconOf } from "@/lib/richtext/link";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import type { IssueAttachment } from "@/types";
import styles from "../issueDetail.module.scss";

interface IssueAttachmentsProps {
  issueId: string;
  attachments: IssueAttachment[];
  readOnly?: boolean;
  /** Refetches the issue — uploads/deletes go through their own server
   *  actions, the panel isn't tied to any server render (`useIssueDetail`). */
  onRefresh: () => Promise<void>;
}

/** Preview of a single tile: a real image for an image attachment — upload
 *  or link with a recognized image MIME type (see `guessImageMimeType`,
 *  `lib/richtext/imageMime.ts`) — the site's favicon for any other link
 *  (the same derivation as for the link chip in the editor,
 *  `lib/richtext/link.ts`), otherwise an icon based on the file type. */
function TilePreview({ a }: { a: IssueAttachment }) {
  if (a.mimeType?.startsWith("image/") && a.url) {
    // biome-ignore lint/performance/noImgElement: presigned or external URL, next/image can't optimize it
    return <img src={a.url} alt="" />;
  }
  const favicon = a.kind === "link" ? faviconOf(a.url ?? "") : null;
  if (favicon) {
    return (
      <span
        className={styles.attachmentTileFavicon}
        style={{ "--favicon": `url("${favicon}")` } as React.CSSProperties}
      />
    );
  }
  return (
    <Icon
      icon={a.kind === "link" ? "lucide:link" : iconForMimeType(a.mimeType)}
      width={22}
      aria-hidden="true"
    />
  );
}

/**
 * Menu behind the add button: upload a file or add a link — like the image
 * dialog in the editor (`RichTextEditor.tsx`'s `imagePicker`). A separate
 * component instead of state in the caller, because `Popover` fully unmounts
 * its content on close (`if (!open) return null`) — so every reopen
 * naturally starts back at the choice screen, never mid-way through the
 * link form.
 */
function AddAttachmentMenu({
  onPickFile,
  onSubmitLink,
  close,
}: {
  onPickFile: () => void;
  onSubmitLink: (href: string, name: string) => void;
  close: () => void;
}) {
  const t = useTranslations();
  const [mode, setMode] = useState<"choose" | "link">("choose");

  if (mode === "link") {
    return (
      <LinkForm
        withName
        onSubmit={onSubmitLink}
        onCancel={close}
        label={t("editor.link")}
        placeholder={t("editor.linkPlaceholder")}
        nameLabel={t("editor.linkName")}
        namePlaceholder={t("editor.linkNamePlaceholder")}
        applyLabel={t("editor.linkApply")}
        removeLabel={t("editor.linkRemove")}
      />
    );
  }

  return (
    <div className={styles.attachmentChooser}>
      <button
        type="button"
        className={styles.attachmentChooserOption}
        onClick={() => {
          close();
          onPickFile();
        }}
      >
        <Icon icon="lucide:upload" width={15} />
        {t("attachments.addFile")}
      </button>
      <button
        type="button"
        className={styles.attachmentChooserOption}
        onClick={() => setMode("link")}
      >
        <Icon icon="lucide:link" width={15} />
        {t("attachments.addLink")}
      </button>
    </div>
  );
}

export function IssueAttachments({
  issueId,
  attachments,
  readOnly,
  onRefresh,
}: IssueAttachmentsProps) {
  const t = useTranslations();
  const timeAgo = useTimeAgo();
  const { openModal } = useModal();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canAdd = !readOnly;
  const isEmpty = attachments.length === 0;

  /** Instead of linking directly to the (for uploads, presigned and
   *  expiring) URL: a preview in a dialog, from which a targeted download
   *  is possible. Only `kind: "file"` gets the real download button — for a
   *  link attachment the URL points to someone else's content, not an
   *  upload of our own that could be forced to download. */
  const openPreview = (a: IssueAttachment) => {
    if (!a.url) return;
    const url = a.url;
    openModal(
      ({ close }) => (
        <FilePreview
          url={url}
          name={a.name}
          mimeType={a.mimeType}
          size={a.size}
          downloadable={a.kind === "file"}
          addedAt={timeAgo(a.createdAt)}
          close={close}
          closeLabel={t("actions.close")}
          downloadLabel={t("attachments.download")}
          downloadFailedLabel={t("attachments.downloadFailed")}
          openOriginalLabel={t("attachments.openOriginal")}
          noPreviewLabel={t("attachments.noPreview")}
        />
      ),
      { label: a.name },
    );
  };

  const upload = async (file: File) => {
    setError(null);
    setBusy(true);
    try {
      const result = await uploadIssueAttachment(issueId, file);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  /** Several dropped files one after another — starting them concurrently
   *  would only produce multiple loading indicators with no real benefit. */
  const uploadAll = async (files: FileList | File[]) => {
    for (const file of Array.from(files)) await upload(file);
  };

  const addLink = async (href: string, name: string, close: () => void) => {
    setError(null);
    setBusy(true);
    try {
      const result = await addIssueLinkAttachment(issueId, {
        url: href,
        name,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      close();
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    setBusy(true);
    try {
      const result = await deleteIssueAttachment(issueId, id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (!canAdd) return;
    if (e.dataTransfer.files.length) uploadAll(e.dataTransfer.files);
  };

  /** The same add button for the empty box and the tile grid — only the
   *  label/size differs. */
  const addTrigger = (variant: "empty" | "tile") => (
    <InlinePicker
      width={200}
      align="start"
      stop
      trigger={
        variant === "empty" ? (
          <button
            type="button"
            className={styles.attachmentEmptyAction}
            disabled={busy}
            data-field-nav
          >
            <Icon icon="lucide:paperclip" width={20} aria-hidden="true" />
            <span>{t("attachments.dropHint")}</span>
          </button>
        ) : (
          <button
            type="button"
            className={styles.attachmentTileAdd}
            disabled={busy}
            data-field-nav
          >
            <Icon icon="lucide:plus" width={18} aria-hidden="true" />
            <span>{t("attachments.add")}</span>
          </button>
        )
      }
    >
      {(close) => (
        <AddAttachmentMenu
          close={close}
          onPickFile={() => fileInputRef.current?.click()}
          onSubmitLink={(href, name) => addLink(href, name, close)}
        />
      )}
    </InlinePicker>
  );

  return (
    <section className={styles.section}>
      <header className={styles.sectionHead}>
        <Icon icon="lucide:paperclip" width={15} aria-hidden="true" />
        <h3 className={styles.sectionTitle}>{t("attachments.title")}</h3>
      </header>

      {/* One box for both purposes: drag-and-drop target and tile grid at
          once — a dropped attachment lands in exactly the area that would
          already be showing it. When empty, it already acts as the
          call-to-action itself, rather than just showing an empty state. */}
      {/* biome-ignore lint/a11y/noStaticElementInteractions: drag-and-drop target — actual interaction sits in the tiles/buttons within it */}
      <div
        className={styles.attachmentBox}
        data-drag-over={dragOver ? "" : undefined}
        onDragOver={(e) => {
          if (!canAdd) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {isEmpty ? (
          canAdd ? (
            addTrigger("empty")
          ) : (
            <span className={styles.attachmentEmpty}>
              {t("attachments.empty")}
            </span>
          )
        ) : (
          <div className={styles.attachmentGrid}>
            {canAdd && addTrigger("tile")}

            {attachments.map((a) => (
              // biome-ignore lint/a11y/noStaticElementInteractions: `draggable` only provides the drag handle — click/open stays with the link/tile content inside it
              <div
                key={a.id}
                className={styles.attachmentTile}
                draggable={!!a.url}
                onDragStart={
                  a.url
                    ? (e) => {
                        // Dragged into the editor (`RichTextEditor.tsx`'s
                        // `handleDrop`), the tile ends up there as an
                        // ordinary `attachment` node by reference — no
                        // re-upload, the same `Attachment` row.
                        const payload: AttachmentDragPayload = {
                          id: a.id,
                          url: a.url as string,
                          name: a.name,
                          mimeType: a.mimeType,
                          size: a.size,
                        };
                        e.dataTransfer.setData(
                          ATTACHMENT_DRAG_MIME,
                          JSON.stringify(payload),
                        );
                        e.dataTransfer.effectAllowed = "copy";
                      }
                    : undefined
                }
              >
                <button
                  type="button"
                  className={styles.attachmentTileVisual}
                  title={a.name}
                  disabled={!a.url}
                  onClick={() => openPreview(a)}
                >
                  <TilePreview a={a} />
                </button>
                <div className={styles.attachmentTileCaption} title={a.name}>
                  <span>{a.name}</span>
                  <span className={styles.attachmentTileSize}>
                    {timeAgo(a.createdAt)}
                  </span>
                  {a.size != null && (
                    <span className={styles.attachmentTileSize}>
                      {formatBytes(a.size)}
                    </span>
                  )}
                </div>
                {canAdd && (
                  <button
                    type="button"
                    className={styles.attachmentTileRemove}
                    disabled={busy}
                    aria-label={t("attachments.remove")}
                    title={t("attachments.remove")}
                    onClick={() => remove(a.id)}
                  >
                    <Icon icon="lucide:x" width={12} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canAdd && (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          hidden
          disabled={busy}
          onChange={(e) => {
            // `Array.from` instead of the `FileList` itself: that one is
            // bound to the input's value — once `value` is cleared below,
            // a later access to the same list would already read empty.
            const files = Array.from(e.target.files ?? []);
            e.target.value = "";
            if (files.length) uploadAll(files);
          }}
        />
      )}

      {error && (
        <p className={styles.attachmentError} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
