"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Button } from "@/components/ui/atoms/Button/Button";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { FullscreenEdit } from "@/components/ui/layout/FullscreenEdit/FullscreenEdit";
import { ModalShortcut } from "@/components/ui/layout/Modal/components/ModalFooter";
import { CommandsButton } from "@/components/ui/layout/RichTextEditor/components/CommandsButton";
import type {
  RichTextEditorHandle,
  UploadedAttachment,
} from "@/components/ui/layout/RichTextEditor/RichTextEditor";
import { ActivityFeed } from "@/features/audit/components/ActivityFeed/ActivityFeed";
import {
  addComment,
  addIssueLinkAttachment,
  deleteComment,
  deleteIssueAttachment,
  toggleCommentReaction,
  updateComment,
} from "@/features/issues/actions";
import { useEditorSources } from "@/features/issues/components/IssueRichText/IssueRichText";
import { issuePath } from "@/features/issues/issue-links";
import type { IssueEditorData } from "@/features/issues/types";
import { uploadIssueAttachment } from "@/features/issues/uploadAttachment";
import type { AuditEntry } from "@/lib/audit/actions";
import { useHasOpenModal } from "@/lib/context";
import { markLocalMutation } from "@/lib/realtime/localMutation";
import { emptyDoc, isEmptyDoc } from "@/lib/richtext/doc";
import { toPreview } from "@/lib/richtext/text";
import type { PMDoc } from "@/lib/richtext/types";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import { COMPACT_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import type { Comment, User } from "@/types";
import { InComposerSlot } from "../composerSlot";
import styles from "../issueDetail.module.scss";
import { CommentThread } from "./CommentThread";

/**
 * The comment history along with the input field.
 *
 * The field is the same editor as for the description — this is exactly
 * where it pays off: a mention belongs in a comment more often than in the
 * description. Just as there, it's loaded only on demand.
 */

const RichTextEditor = dynamic(
  () =>
    import("@/components/ui/layout/RichTextEditor/RichTextEditor").then(
      (m) => m.RichTextEditor,
    ),
  { ssr: false, loading: () => <div className={styles.composerLoading} /> },
);

/** This many top-level threads (with all their replies) are shown right
 *  away — the rest only follows via "Load more comments", in equal-sized
 *  batches. */
const COMMENTS_PAGE_SIZE = 5;

interface IssueCommentsProps {
  issueId: string;
  /** For the copyable link to a single comment. */
  workspaceId: string;
  identifier: string;
  comments: Comment[];
  /** Field-change history for this issue — the "Aktivität" tab. */
  activity: AuditEntry[];
  members: User[];
  me: User;
  /** For the suggestions behind `@` and `#`. */
  data: IssueEditorData;
  /** `issue.access.canUpdateAnyComment`/`canDeleteAnyComment`. */
  canUpdateAnyComment: boolean;
  canDeleteAnyComment: boolean;
  /** Submits the comment; only after that does the field clear. */
  onSubmit: (body: PMDoc) => Promise<void>;
  /**
   * Refetches the issue — replies, edits, deletes, reactions, and
   * attachments in the comment field go through their own server actions
   * instead of `onSubmit` (that stays reserved for the top-level composer)
   * and report back through this — the panel isn't tied to any server
   * render.
   */
  onRefresh: () => Promise<void>;
}

/** Builds the same three handlers `RichTextEditor` expects out of the
 *  `issueId`-scoped actions — once for the top-level composer, once per
 *  reply and edit editor, without writing the block out three times. */
function makeAttachmentHandlers(
  issueId: string,
  onRefresh: () => Promise<void>,
  uploadFailedLabel: string,
) {
  return {
    onUploadAttachment: async (
      file: File,
    ): Promise<UploadedAttachment | { error: string }> => {
      // After the await — see the comment in useBoardDnd.ts's onDrop for
      // why: the server timestamps its own record on receipt, always later
      // than anything marked before the request is even sent.
      const result = await uploadIssueAttachment(issueId, file);
      markLocalMutation();
      if ("error" in result) return result;
      const { attachment } = result;
      if (!attachment.url) return { error: uploadFailedLabel };
      // Not awaited: the node should appear in the comment field
      // immediately, the attachments section catches up shortly after.
      onRefresh();
      return {
        id: attachment.id,
        url: attachment.url,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
      };
    },
    onRemoveAttachment: async (id: string) => {
      const result = await deleteIssueAttachment(issueId, id);
      markLocalMutation();
      if ("error" in result) throw new Error(result.error);
      onRefresh();
    },
    onAddLinkAttachment: async (input: {
      url: string;
      name?: string;
      mimeType?: string | null;
    }): Promise<UploadedAttachment | { error: string }> => {
      const result = await addIssueLinkAttachment(issueId, input);
      markLocalMutation();
      if ("error" in result) return result;
      const { attachment } = result;
      if (!attachment.url) return { error: uploadFailedLabel };
      onRefresh();
      return {
        id: attachment.id,
        url: attachment.url,
        name: attachment.name,
        mimeType: attachment.mimeType,
        size: attachment.size,
      };
    },
  };
}

export function IssueComments({
  issueId,
  workspaceId,
  identifier,
  comments,
  activity,
  members,
  me,
  data,
  canUpdateAnyComment,
  canDeleteAnyComment,
  onSubmit,
  onRefresh,
}: IssueCommentsProps) {
  const t = useTranslations();
  const sources = useEditorSources(data);
  const searchParams = useSearchParams();
  const [body, setBody] = useState<PMDoc>(emptyDoc);
  const [isSending, setIsSending] = useState(false);
  // Increments on every submitted comment and remounts the editor via this.
  // Without it, ProseMirror would keep its old content — `value` is only
  // its initial value as far as it's concerned.
  const [round, setRound] = useState(0);
  const hasOpenModal = useHasOpenModal();
  const editorHandle = useRef<RichTextEditorHandle>(null);
  // Phone and tablet: the composer rests as one line, like a messenger's;
  // tapping the line opens the editor full screen (`FullscreenEdit`).
  const isCompact = useMediaQuery(COMPACT_QUERY);
  const [isWriting, setIsWriting] = useState(false);
  const fullHandle = useRef<RichTextEditorHandle>(null);
  // "m" ("comment" — Linear's own binding) — the composer is always
  // mounted and visible here, unlike status/priority/assignee/labels, so
  // there's no picker to open: focusing the field is the whole job.
  useShortcut(
    "m",
    () => (isCompact ? setIsWriting(true) : editorHandle.current?.focus()),
    { enabled: !hasOpenModal },
  );
  const [flashId, setFlashId] = useState<string | null>(null);
  // Tracks which comment has already been scrolled to — `comments` changes
  // after every `onRefresh()` (new reference); without this flag, every
  // follow-up action (e.g. a reaction) would trigger another jump.
  const scrolledTo = useRef<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(COMMENTS_PAGE_SIZE);
  const [tab, setTab] = useState<"comments" | "activity">("comments");

  const isEmpty = isEmptyDoc(body);
  const attachmentHandlers = makeAttachmentHandlers(
    issueId,
    onRefresh,
    t("editor.attachmentUploadFailed"),
  );

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, Comment[]>();
    for (const c of comments) {
      const list = map.get(c.parentId) ?? [];
      list.push(c);
      map.set(c.parentId, list);
    }
    return map;
  }, [comments]);
  // Resolves the actual parent comment beyond MAX_INDENT_DEPTH ("Reply to
  // …" in CommentThread.tsx) — indentation no longer reveals it there,
  // because whole branches end up as siblings next to each other.
  const commentsById = useMemo(
    () => new Map(comments.map((c) => [c.id, c])),
    [comments],
  );
  const topLevel = childrenByParent.get(null) ?? [];
  const visibleTopLevel = topLevel.slice(0, visibleCount);
  const remainingCount = topLevel.length - visibleTopLevel.length;

  const highlightId = searchParams.get("comment");
  // Replies are now collapsed by default (see CommentThread.tsx) — a linked
  // comment therefore needs its entire ancestor chain already expanded on
  // the first render, otherwise `scrollIntoView` below finds no element (it
  // simply isn't in the DOM).
  const highlightAncestorIds = useMemo(() => {
    const ids = new Set<string>();
    if (!highlightId) return ids;
    let node = commentsById.get(highlightId);
    while (node?.parentId) {
      ids.add(node.parentId);
      node = commentsById.get(node.parentId);
    }
    return ids;
  }, [highlightId, commentsById]);

  // A linked comment can be outside the first page (or a reply within one
  // of those later threads) — before scrolling, first reveal enough
  // top-level threads that its branch is included.
  useEffect(() => {
    if (!highlightId) return;
    let node = commentsById.get(highlightId);
    while (node?.parentId) {
      const parent = commentsById.get(node.parentId);
      if (!parent) break;
      node = parent;
    }
    if (!node) return;
    const index = topLevel.findIndex((c) => c.id === node.id);
    if (index >= 0 && index + 1 > visibleCount) setVisibleCount(index + 1);
  }, [highlightId, commentsById, topLevel, visibleCount]);

  useEffect(() => {
    // `comments` doesn't appear in the effect body, but it still triggers a
    // re-attempt: the target might be missing on the first pass, when
    // `onRefresh()` after a reply/edit brings a new list that now includes
    // it. Same for `visibleCount` — the anchor only appears after the
    // effect above has revealed it.
    void comments;
    void visibleCount;
    if (!highlightId || scrolledTo.current === highlightId) return;
    const el = document.getElementById(`comment-${highlightId}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    scrolledTo.current = highlightId;
    setFlashId(highlightId);
    const timeout = setTimeout(() => setFlashId(null), 2000);
    return () => clearTimeout(timeout);
  }, [highlightId, comments, visibleCount]);

  const submit = async () => {
    if (isEmpty || isSending) return;
    setIsSending(true);
    try {
      await onSubmit(body);
      setBody(emptyDoc());
      setRound((r) => r + 1);
      setIsWriting(false);
    } finally {
      setIsSending(false);
    }
  };

  const editComment = async (commentId: string, value: PMDoc) => {
    // After the await — see the comment in useBoardDnd.ts's onDrop for why:
    // the server timestamps its own record on receipt, always later than
    // anything marked before the request is even sent.
    await updateComment(commentId, value);
    markLocalMutation();
    await onRefresh();
  };

  const removeComment = (commentId: string) => {
    // No confirmation dialog — the same convention as "delete task"
    // (`IssueDetailActions.tsx`): immediate, no detour.
    deleteComment(commentId).then(() => {
      markLocalMutation();
      onRefresh();
    });
  };

  const replyToComment = async (parentId: string, value: PMDoc) => {
    await addComment(issueId, value, me.id, parentId);
    markLocalMutation();
    await onRefresh();
  };

  const toggleReaction = (commentId: string, emoji: string) => {
    toggleCommentReaction(commentId, emoji).then(() => {
      markLocalMutation();
      onRefresh();
    });
  };

  const copyLink = (commentId: string) => {
    const url = `${window.location.origin}${issuePath(workspaceId, identifier)}?comment=${commentId}`;
    navigator.clipboard.writeText(url).catch(() => {
      // Without permission, or over an insecure connection, there is no
      // clipboard — nothing happens in that case.
    });
  };

  return (
    <section className={styles.comments}>
      <header className={styles.sectionHead}>
        <SegmentedControl
          items={[
            { value: "comments", label: t("comments.title") },
            { value: "activity", label: t("issueActivity.title") },
          ]}
          value={tab}
          onChange={(value) => setTab(value as "comments" | "activity")}
          variant="surface"
        />
      </header>

      {tab === "comments" ? (
        comments.length === 0 ? (
          <p className={styles.commentsEmpty}>{t("comments.empty")}</p>
        ) : (
          <>
            <ol className={styles.commentList}>
              {visibleTopLevel.map((comment) => (
                <CommentThread
                  key={comment.id}
                  comment={comment}
                  depth={0}
                  childrenByParent={childrenByParent}
                  commentsById={commentsById}
                  highlightAncestorIds={highlightAncestorIds}
                  members={members}
                  me={me}
                  data={data}
                  canUpdateAnyComment={canUpdateAnyComment}
                  canDeleteAnyComment={canDeleteAnyComment}
                  flashId={flashId}
                  attachmentHandlers={attachmentHandlers}
                  onEdit={editComment}
                  onDelete={removeComment}
                  onReply={replyToComment}
                  onToggleReaction={toggleReaction}
                  onCopyLink={copyLink}
                />
              ))}
            </ol>

            {remainingCount > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                full
                className={styles.loadMoreComments}
                onClick={() =>
                  setVisibleCount((v) =>
                    Math.min(v + COMMENTS_PAGE_SIZE, topLevel.length),
                  )
                }
              >
                {t("comments.loadMore", {
                  count: Math.min(COMMENTS_PAGE_SIZE, remainingCount),
                })}
              </Button>
            )}
          </>
        )
      ) : activity.length === 0 ? (
        <p className={styles.commentsEmpty}>{t("issueActivity.empty")}</p>
      ) : (
        <div className={styles.activityCard}>
          <div className={styles.activityScroll}>
            <ActivityFeed
              entries={activity}
              workspaceSlug={workspaceId}
              hideRef
            />
          </div>
        </div>
      )}

      {/* No more `<form action=…>`: the editor isn't a form field, and
          submission happens via the button or Cmd/Ctrl + Enter. Only on the
          comments tab — the activity tab is a read-only log, nothing to
          compose there. */}
      {tab === "comments" && (
        <InComposerSlot>
          <div className={styles.composer}>
            <Avatar avatar={me} size={28} />
            {/* Marks the composer for the panel's field-roving (`IssueDetailView.tsx`):
              ArrowUp out of it, back to the last field, only while it's still
              empty — once there's real multi-line text, ArrowUp goes back to
              being the cursor's, same as the description once editing. */}
            {isCompact ? (
              <div className={styles.composerCompact}>
                {/* Not a real field: a tap opens the full-screen editor,
                    and the typed draft (if any) is shown here. */}
                <button
                  type="button"
                  className={styles.composerFake}
                  data-empty={isEmpty || undefined}
                  onClick={() => setIsWriting(true)}
                >
                  {isEmpty ? t("placeholders.addComment") : toPreview(body)}
                </button>
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  disabled={isEmpty || isSending}
                  onClick={submit}
                >
                  {t("actions.comment")}
                </Button>
              </div>
            ) : (
              <div className={styles.composerBox} data-comment-editor>
                <RichTextEditor
                  key={round}
                  ref={editorHandle}
                  value={body}
                  onChange={setBody}
                  onSubmit={submit}
                  label={t("fields.description")}
                  placeholder={t("placeholders.addComment")}
                  members={sources.members}
                  issues={sources.issues}
                  {...attachmentHandlers}
                />
                <div className={styles.composerFoot}>
                  <ModalShortcut keys="mod+enter">
                    {t("comments.toSend")}
                  </ModalShortcut>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={isEmpty || isSending}
                    onClick={submit}
                  >
                    {t("actions.comment")}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </InComposerSlot>
      )}
      {tab === "comments" && isCompact && isWriting && (
        <FullscreenEdit>
          <div className={styles.composerFull}>
            <RichTextEditor
              key={round}
              ref={fullHandle}
              value={body}
              onChange={setBody}
              onSubmit={submit}
              label={t("fields.description")}
              placeholder={t("placeholders.addComment")}
              autoFocus
              fill
              members={sources.members}
              issues={sources.issues}
              {...attachmentHandlers}
            />
            <div className={styles.composerFoot}>
              <CommandsButton
                className={styles.composerCommands}
                onClick={() => fullHandle.current?.openCommands()}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsWriting(false)}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isEmpty || isSending}
                onClick={submit}
              >
                {t("actions.comment")}
              </Button>
            </div>
          </div>
        </FullscreenEdit>
      )}
    </section>
  );
}
