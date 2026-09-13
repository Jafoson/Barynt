import type { CSSProperties, ReactNode } from "react";
import { Chip } from "@/components/ui/atoms/Chip/Chip";
import { CopyButton } from "@/components/ui/layout/CopyButton/CopyButton";
import { clampAttachmentWidth, formatBytes } from "@/lib/richtext/attachments";
import { languageLabel } from "@/lib/richtext/code";
import { formatChipDate } from "@/lib/richtext/date";
import { toDoc } from "@/lib/richtext/doc";
import { highlightLines } from "@/lib/richtext/highlight";
import { faviconOf, hostOf } from "@/lib/richtext/link";
import type { PMDoc, PMMark, PMNode } from "@/lib/richtext/types";
import styles from "./richText.module.scss";

/**
 * Displays a ProseMirror document — without ProseMirror.
 *
 * The editor is heavy and only runs in the browser; an issue is read far
 * more often than it's written, though. So this component translates the
 * stored JSON to React by hand: no dependency, no `generateHTML`, and above
 * all no `dangerouslySetInnerHTML` — foreign text never ends up as HTML in
 * the document. URLs go through `safeUrl` so `javascript:` links can't even
 * arise.
 *
 * No client directive: renders in Server Components.
 *
 * Whoever adds a node type here must also supply the matching extension in
 * `RichTextEditor` — and vice versa.
 */

/**
 * Only URLs that are harmless in the browser — everything else stays text.
 * `blob:` is included because the create-issue composer previews a
 * not-yet-uploaded image via `URL.createObjectURL` (no `issueId` to upload
 * against until the issue is saved), and that draft document renders
 * through this same component once the field loses focus. A typed-in fake
 * `blob:` string is inert — it only resolves to something real if it names
 * an object this tab itself created.
 */
function safeUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  return /^(?:https?:\/\/|mailto:|blob:|\/|#)/i.test(url) ? url : null;
}

function attr(node: PMNode, key: string): string {
  const value = node.attrs?.[key];
  return typeof value === "string" ? value : "";
}

/**
 * Wraps the marks around a text node. Inside out, so the order in the tree
 * matches the editor's.
 */
function applyMarks(
  content: ReactNode,
  marks: PMMark[],
  key: string,
): ReactNode {
  return marks.reduce<ReactNode>((inner, mark, index) => {
    const markKey = `${key}m${index}`;
    switch (mark.type) {
      case "bold":
        return <strong key={markKey}>{inner}</strong>;
      case "italic":
        return <em key={markKey}>{inner}</em>;
      case "strike":
        return <del key={markKey}>{inner}</del>;
      case "code":
        return <code key={markKey}>{inner}</code>;
      case "link": {
        const href = safeUrl(mark.attrs?.href);
        if (!href) return inner;
        return (
          <a
            key={markKey}
            href={href}
            // The URL shows up on hover — in running text you otherwise
            // can't tell where a word leads.
            title={href}
            target="_blank"
            rel="noopener noreferrer"
          >
            {inner}
          </a>
        );
      }
      default:
        return inner;
    }
  }, content);
}

function renderAll(
  nodes: PMNode[] | undefined,
  keyPrefix: string,
  labels: RichTextLabels,
): ReactNode[] {
  return (nodes ?? []).map((node, index) =>
    renderNode(node, `${keyPrefix}.${index}`, labels),
  );
}

function renderNode(
  node: PMNode,
  key: string,
  labels: RichTextLabels,
): ReactNode {
  const children = () => renderAll(node.content, key, labels);

  switch (node.type) {
    case "text":
      return applyMarks(node.text ?? "", node.marks ?? [], key);

    case "paragraph":
      return <p key={key}>{children()}</p>;

    case "heading": {
      const raw = node.attrs?.level;
      const level = typeof raw === "number" ? Math.min(Math.max(raw, 1), 6) : 1;
      const Tag = `h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
      return <Tag key={key}>{children()}</Tag>;
    }

    case "bulletList":
      return <ul key={key}>{children()}</ul>;

    case "orderedList": {
      const start = node.attrs?.start;
      return (
        <ol key={key} start={typeof start === "number" ? start : undefined}>
          {children()}
        </ol>
      );
    }

    case "listItem":
      return <li key={key}>{children()}</li>;

    case "taskList":
      return (
        <ul key={key} className={styles.taskList}>
          {children()}
        </ul>
      );

    case "taskItem": {
      const checked = node.attrs?.checked === true;
      return (
        <li key={key} className={styles.taskItem} data-checked={checked}>
          {/* Display only — checking off happens in the editor, not in the read view. */}
          <input type="checkbox" checked={checked} disabled readOnly />
          <div>{children()}</div>
        </li>
      );
    }

    case "blockquote":
      return <blockquote key={key}>{children()}</blockquote>;

    case "codeBlock": {
      // The content of a code block is plain text — no marks, no child
      // nodes other than text nodes. So it's joined directly here instead
      // of going through `children()`: the lines each need their own
      // element so the numbers can sit next to them.
      const code = (node.content ?? []).map((n) => n.text ?? "").join("");
      const language = attr(node, "language");
      // Highlighted line by line, because the numbers sit next to them.
      const lines = highlightLines(code, language);

      return (
        <div key={key} className={styles.codeBlock}>
          <div className={styles.codeHead}>
            <span className={styles.codeLang}>{languageLabel(language)}</span>
            <CopyButton
              value={code}
              label={labels.copy}
              copiedLabel={labels.copied}
            />
          </div>

          <pre>
            <code data-language={language || undefined}>
              {lines.map((line, index) => (
                // The line number lives in CSS (`::before`), not in the
                // text: this way it isn't carried along when selecting and copying.
                <span
                  // biome-ignore lint/suspicious/noArrayIndexKey: lines have no identifier, their position is the identifier
                  key={index}
                  className={styles.codeLine}
                >
                  {line.map((token, at) =>
                    token.className ? (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: pieces of a line have no identifier
                        key={at}
                        className={token.className}
                      >
                        {token.text}
                      </span>
                    ) : (
                      token.text
                    ),
                  )}
                </span>
              ))}
            </code>
          </pre>
        </div>
      );
    }

    case "horizontalRule":
      return <hr key={key} />;

    case "hardBreak":
      return <br key={key} />;

    case "image": {
      const src = safeUrl(node.attrs?.src);
      if (!src) return null;
      // biome-ignore lint/performance/noImgElement: foreign URL, no known format and no known dimensions — `next/image` can't optimize this
      return <img key={key} src={src} alt={attr(node, "alt")} />;
    }

    case "attachment": {
      // `url`/`name`/`mimeType`/`size` are already resolved — the caller
      // (`features/issues/queries.ts`, `withResolvedAttachments`) enriches
      // them before the document reaches here. If `url` is missing
      // (attachment deleted), a quiet placeholder remains instead of a broken image.
      const src = safeUrl(node.attrs?.url);
      const name = attr(node, "name");
      const mimeType = attr(node, "mimeType");
      const size = node.attrs?.size;
      const sizeLabel = typeof size === "number" ? formatBytes(size) : null;

      if (!src) {
        return (
          <div key={key} className={styles.attachmentMissing}>
            {labels.attachmentRemoved}
          </div>
        );
      }

      if (mimeType.startsWith("image/")) {
        const width = clampAttachmentWidth(node.attrs?.width);
        return (
          <div
            key={key}
            className={styles.attachmentImage}
            style={{ width, maxWidth: "100%" }}
          >
            {/* biome-ignore lint/performance/noImgElement: presigned URL, next/image can't optimize it */}
            <img
              src={src}
              alt={name}
              className={styles.attachmentImagePreview}
            />
          </div>
        );
      }

      if (mimeType.startsWith("video/")) {
        const width = clampAttachmentWidth(node.attrs?.width);
        return (
          <div
            key={key}
            className={styles.attachmentVideo}
            style={{ width, maxWidth: "100%" }}
          >
            {/* biome-ignore lint/a11y/useMediaCaption: uploaded attachments carry no captions */}
            <video src={src} controls className={styles.attachmentPreview} />
            <div className={styles.attachmentCaption}>
              <span className={styles.attachmentName}>{name}</span>
              {sizeLabel && (
                <span className={styles.attachmentSize}>{sizeLabel}</span>
              )}
            </div>
          </div>
        );
      }

      return (
        <a
          key={key}
          href={src}
          target="_blank"
          rel="noopener noreferrer"
          className={styles.attachmentFile}
        >
          <span className={styles.attachmentName}>{name}</span>
          {sizeLabel && (
            <span className={styles.attachmentSize}>{sizeLabel}</span>
          )}
        </a>
      );
    }

    case "table":
      return (
        // Wide tables scroll within their block instead of stretching the panel.
        <div key={key} className={styles.tableWrap}>
          <table>
            <tbody>{children()}</tbody>
          </table>
        </div>
      );

    case "tableRow":
      return <tr key={key}>{children()}</tr>;

    case "tableHeader":
    case "tableCell": {
      const Tag = node.type === "tableHeader" ? "th" : "td";
      const span = (name: string) => {
        const value = node.attrs?.[name];
        return typeof value === "number" && value > 1 ? value : undefined;
      };
      return (
        <Tag key={key} colSpan={span("colspan")} rowSpan={span("rowspan")}>
          {children()}
        </Tag>
      );
    }

    case "panel":
      return (
        <aside
          key={key}
          className={styles.panel}
          data-kind={attr(node, "kind") || "info"}
        >
          {children()}
        </aside>
      );

    case "mention":
      // The `@` belongs in the text, not in a separate slot: this way it
      // naturally sits on the baseline and gets copied along when selected.
      return (
        <Chip key={key} as="span" size="inline" variant="elevated" data-mention>
          @{attr(node, "label")}
        </Chip>
      );

    case "issueLink": {
      const identifier = attr(node, "identifier");
      if (!identifier) return null;
      // The same URL that board, inbox, and command palette use to open an
      // issue: an `issue` parameter on the current route. The chip sits
      // inside the link rather than being one itself — `Chip` only knows `div` and `span`.
      return (
        <a
          key={key}
          className={styles.chipLink}
          href={`?issue=${encodeURIComponent(identifier)}`}
        >
          <Chip
            as="span"
            size="inline"
            variant="elevated"
            className={styles.chipHover}
            icon={<span className={styles.issueIcon} aria-hidden="true" />}
          >
            <span className={styles.issueLinkLabel}>{identifier}</span>
          </Chip>
        </a>
      );
    }

    case "linkChip": {
      const href = safeUrl(node.attrs?.href);
      if (!href) return null;
      const label = attr(node, "label") || hostOf(href);
      const favicon = faviconOf(href);
      // Like the issue link: the chip sits inside the link rather than
      // being one itself — `Chip` only knows `div` and `span`.
      return (
        <a
          key={key}
          className={styles.chipLink}
          href={href}
          title={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Chip
            as="span"
            size="inline"
            variant="elevated"
            className={styles.chipHover}
            icon={
              <span
                className={styles.linkIcon}
                // The favicon overlays it as a background; if it fails to
                // load, the chain-link icon underneath remains visible.
                style={
                  favicon
                    ? ({ "--favicon": `url("${favicon}")` } as CSSProperties)
                    : undefined
                }
                aria-hidden="true"
              />
            }
          >
            {label}
          </Chip>
        </a>
      );
    }

    case "dateChip": {
      const iso = attr(node, "date");
      return (
        <Chip
          key={key}
          as="span"
          size="inline"
          variant="elevated"
          icon={<span className={styles.dateIcon} aria-hidden="true" />}
          // The machine-readable value belongs on a `<time>`; the chip is
          // just the wrapper around it.
          title={iso}
          // The formatted output depends on the environment, and that
          // differs between server and browser. The machine-readable value
          // stays unchanged in the `datetime` attribute.
        >
          <time dateTime={iso} suppressHydrationWarning>
            {formatChipDate(iso)}
          </time>
        </Chip>
      );
    }

    case "emoji":
      return (
        <span key={key} role="img" aria-label={attr(node, "name")}>
          {attr(node, "emoji")}
        </span>
      );

    // Unknown node (older document, newer extension): the content should
    // still stay readable, just without its wrapper.
    default:
      return node.content?.length ? <div key={key}>{children()}</div> : null;
  }
}

/**
 * The few labels the display itself needs — so far only the code block.
 *
 * As a prop rather than via `next-intl`: the component renders in Server
 * Components and in tests without a provider. The defaults are English so
 * they show something sensible on their own; the app passes translated ones in.
 */
export interface RichTextLabels {
  copy: string;
  copied: string;
  attachmentRemoved: string;
}

const DEFAULT_LABELS: RichTextLabels = {
  copy: "Copy",
  copied: "Copied",
  attachmentRemoved: "Attachment removed",
};

interface RichTextProps {
  /** The stored document — unvalidated JSON from the database is allowed. */
  value: PMDoc | unknown;
  labels?: Partial<RichTextLabels>;
  className?: string;
}

export function RichText({ value, labels, className }: RichTextProps) {
  const doc = toDoc(value);
  return (
    <div className={[styles.richText, className].filter(Boolean).join(" ")}>
      {renderAll(doc.content, "n", { ...DEFAULT_LABELS, ...labels })}
    </div>
  );
}
