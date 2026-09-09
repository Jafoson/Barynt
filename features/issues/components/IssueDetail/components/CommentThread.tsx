"use client";

import { Icon } from "@iconify/react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { Button } from "@/components/ui/atoms/Button/Button";
import type { ReactionSummary } from "@/components/ui/atoms/ReactionBar/ReactionBar";
import { ReactionBar } from "@/components/ui/atoms/ReactionBar/ReactionBar";
import type { UploadedAttachment } from "@/components/ui/layout/RichTextEditor/RichTextEditor";
import {
  IssueRichText,
  useEditorSources,
} from "@/features/issues/components/IssueRichText/IssueRichText";
import type { IssueEditorData } from "@/features/issues/types";
import { emptyDoc, isEmptyDoc } from "@/lib/richtext/doc";
import type { PMDoc } from "@/lib/richtext/types";
import { fullName } from "@/lib/utils/string";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import type { Comment, User } from "@/types";
import styles from "../issueDetail.module.scss";

const RichTextEditor = dynamic(
  () =>
    import("@/components/ui/layout/RichTextEditor/RichTextEditor").then(
      (m) => m.RichTextEditor,
    ),
  { ssr: false, loading: () => <div className={styles.composerLoading} /> },
);

/** Beyond this depth, indentation no longer grows — otherwise a long chain
 *  of replies-to-replies would eventually run out of the column. Replies
 *  are still always attributed to the exact comment that was clicked,
 *  regardless of the visible nesting cap.
 *
 *  Pure CSS isn't enough for this: every level brings its own offset via
 *  `.comment` (avatar + content as a flex row), independent of the
 *  surrounding `<ol>`'s padding. Beyond this depth, the entire descendant
 *  tree (not just the direct replies) is therefore flattened into a single
 *  sibling list with `collectDescendants` — each comment keeps its real
 *  handlers (replies still land on the actually clicked parent comment) but
 *  no longer renders its own further nesting itself (`skipOwnReplies`). */
const MAX_INDENT_DEPTH = 3;

/** Total horizontal offset one nesting level contributes: 20px padding +
 *  2px border from `.replies`, plus 28px avatar + 12px gap from `.comment`.
 *  Pulls the reply editor below left by `depth * this value`, so the input
 *  field itself doesn't get indented — if these measurements change in the
 *  SCSS file, this value has to be kept in sync. */
const REPLY_COMPOSER_INDENT_PER_LEVEL = 20 + 2 + 28 + 12;

/** A comment in the flattened list, together with the ID of the direct
 *  child whose branch it originates from (`branchId`) — different branches
 *  that end up as siblings next to each other beyond `MAX_INDENT_DEPTH` get
 *  a divider between them this way (see `.branchDivider`). */
interface FlatReply {
  comment: Comment;
  branchId: string;
}

/** Resolves a comment's entire descendant tree in tree order (pre-order) —
 *  used to render it as a single flat list beyond `MAX_INDENT_DEPTH`. */
function collectDescendants(
  parentId: string,
  childrenByParent: Map<string | null, Comment[]>,
): FlatReply[] {
  const direct = childrenByParent.get(parentId) ?? [];
  return direct.flatMap((child) =>
    tagBranch(child, child.id, childrenByParent),
  );
}

function tagBranch(
  comment: Comment,
  branchId: string,
  childrenByParent: Map<string | null, Comment[]>,
): FlatReply[] {
  const children = childrenByParent.get(comment.id) ?? [];
  return [
    { comment, branchId },
    ...children.flatMap((child) =>
      tagBranch(child, branchId, childrenByParent),
    ),
  ];
}

interface AttachmentHandlers {
  onUploadAttachment: (
    file: File,
  ) => Promise<UploadedAttachment | { error: string }>;
  onRemoveAttachment: (id: string) => Promise<void>;
  onAddLinkAttachment: (input: {
    url: string;
    name?: string;
    mimeType?: string | null;
  }) => Promise<UploadedAttachment | { error: string }>;
}

interface CommentThreadProps {
  comment: Comment;
  depth: number;
  /** Its own descendants are already rendered as flat siblings by an
   *  ancestor beyond `MAX_INDENT_DEPTH` (`collectDescendants`) — this
   *  instance therefore no longer renders its own reply list. */
  skipOwnReplies?: boolean;
  childrenByParent: Map<string | null, Comment[]>;
  /** For resolving the actual parent comment beyond `MAX_INDENT_DEPTH` —
   *  indentation no longer reveals it there. */
  commentsById: Map<string, Comment>;
  /** IDs of all ancestors of the comment linked via a `?comment=` link — if
   *  this instance is among them, it expands its replies initially,
   *  otherwise `scrollIntoView` in `IssueComments.tsx` wouldn't find the
   *  target in the DOM. */
  highlightAncestorIds: Set<string>;
  members: User[];
  me: User;
  data: IssueEditorData;
  /** `comment.update.any` — edit others' comments, not just your own. */
  canUpdateAnyComment: boolean;
  /** `comment.delete.any` — delete others' comments, not just your own. */
  canDeleteAnyComment: boolean;
  /** Briefly highlighted after jumping via "copy link". */
  flashId: string | null;
  attachmentHandlers: AttachmentHandlers;
  onEdit: (commentId: string, body: PMDoc) => Promise<void>;
  onDelete: (commentId: string) => void;
  onReply: (parentId: string, body: PMDoc) => Promise<void>;
  onToggleReaction: (commentId: string, emoji: string) => void;
  onCopyLink: (commentId: string) => void;
}

/**
 * A comment together with its replies, recursively. The kebab menu, edit
 * mode, and the embedded reply composer are local state of this one
 * instance — the actual server calls (including `onRefresh`) live in
 * `IssueComments.tsx`, here they only arrive as callbacks.
 */
export function CommentThread({
  comment,
  depth,
  skipOwnReplies = false,
  childrenByParent,
  commentsById,
  highlightAncestorIds,
  members,
  me,
  data,
  canUpdateAnyComment,
  canDeleteAnyComment,
  flashId,
  attachmentHandlers,
  onEdit,
  onDelete,
  onReply,
  onToggleReaction,
  onCopyLink,
}: CommentThreadProps) {
  const t = useTranslations();
  const timeAgo = useTimeAgo();
  const sources = useEditorSources(data);
  const [isEditing, setIsEditing] = useState(false);
  const [isReplying, setIsReplying] = useState(false);
  const [replyBody, setReplyBody] = useState<PMDoc>(emptyDoc);
  const [isSending, setIsSending] = useState(false);
  // Replies are collapsed by default — they're only rendered once expanded,
  // so a long thread doesn't load all at once. If the comment jumped to via
  // a link is within this branch, it still expands right away (see
  // `highlightAncestorIds`).
  const [repliesCollapsed, setRepliesCollapsed] = useState(
    () => !highlightAncestorIds.has(comment.id),
  );

  const author = members.find((m) => m.id === comment.author) ?? null;
  const isOwn = comment.author === me.id;
  const canEdit = isOwn || canUpdateAnyComment;
  const canDelete = isOwn || canDeleteAnyComment;

  // Beyond MAX_INDENT_DEPTH, not just the direct replies but the entire
  // descendant tree is rendered as a flat sibling list (see the comment at
  // MAX_INDENT_DEPTH) — the children then render nothing themselves anymore
  // (`skipOwnReplies`).
  const flattensChildren = !skipOwnReplies && depth + 1 > MAX_INDENT_DEPTH;
  const flatEntries = flattensChildren
    ? collectDescendants(comment.id, childrenByParent)
    : null;
  const visibleReplies = skipOwnReplies
    ? []
    : (flatEntries?.map((entry) => entry.comment) ??
      childrenByParent.get(comment.id) ??
      []);

  const reactions: ReactionSummary[] = comment.reactions;

  // Beyond MAX_INDENT_DEPTH this comment no longer indents further visually
  // — instead of the missing indentation, "Reply to …" explicitly shows the
  // actual parent comment, because several formerly nested branches end up
  // as siblings there and the mere list context (just the branch line from
  // `.replies`) no longer reveals who's replying to whom.
  const isFlattened = depth > MAX_INDENT_DEPTH;
  const parentComment =
    isFlattened && comment.parentId
      ? (commentsById.get(comment.parentId) ?? null)
      : null;
  const parentAuthor = parentComment
    ? (members.find((m) => m.id === parentComment.author) ?? null)
    : null;

  const submitReply = async () => {
    if (isEmptyDoc(replyBody) || isSending) return;
    setIsSending(true);
    try {
      await onReply(comment.id, replyBody);
      setReplyBody(emptyDoc());
      setIsReplying(false);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <li
      id={`comment-${comment.id}`}
      className={styles.comment}
      data-flash={flashId === comment.id ? "" : undefined}
    >
      <Avatar avatar={author} size={28} placeholder />
      <div className={styles.commentBody}>
        {parentComment && (
          <a
            href={`#comment-${parentComment.id}`}
            className={styles.nestedReplyLink}
          >
            <Icon
              icon="lucide:corner-down-right"
              width={13}
              aria-hidden="true"
            />
            {t("comments.replyingTo", {
              name: parentAuthor ? fullName(parentAuthor) : "—",
            })}
          </a>
        )}

        <div className={styles.commentMeta}>
          <span className={styles.commentAuthor}>
            {author ? fullName(author) : "—"}
          </span>
          <span className={styles.commentTime} suppressHydrationWarning>
            {timeAgo(comment.time)}
          </span>
          {comment.updated && (
            <span className={styles.commentEdited}>{t("comments.edited")}</span>
          )}
        </div>

        <IssueRichText
          className={styles.commentText}
          value={comment.body}
          data={data}
          label={t("fields.description")}
          saveLabel={t("actions.save")}
          cancelLabel={t("actions.cancel")}
          editing={isEditing}
          onEditingChange={setIsEditing}
          onCommit={(value) => onEdit(comment.id, value)}
          {...attachmentHandlers}
        />

        <div className={styles.commentActions}>
          <ReactionBar
            reactions={reactions}
            onToggle={(emoji) => onToggleReaction(comment.id, emoji)}
            addLabel={t("comments.addReaction")}
            searchPlaceholder={t("comments.reactionSearchPlaceholder")}
          />

          <div className={styles.commentActionButtons}>
            {canEdit && (
              <button
                type="button"
                className={styles.commentActionButton}
                aria-label={t("actions.edit")}
                title={t("actions.edit")}
                onClick={() => setIsEditing(true)}
              >
                <Icon icon="lucide:pencil" width={14} />
              </button>
            )}
            <button
              type="button"
              className={styles.commentActionButton}
              aria-label={t("comments.reply")}
              title={t("comments.reply")}
              onClick={() => setIsReplying(true)}
            >
              <Icon icon="lucide:reply" width={14} />
            </button>
            <button
              type="button"
              className={styles.commentActionButton}
              aria-label={t("actions.copyLink")}
              title={t("actions.copyLink")}
              onClick={() => onCopyLink(comment.id)}
            >
              <Icon icon="lucide:link" width={14} />
            </button>
            {canDelete && (
              <button
                type="button"
                className={styles.commentActionButton}
                aria-label={t("actions.delete")}
                title={t("actions.delete")}
                onClick={() => onDelete(comment.id)}
              >
                <Icon icon="lucide:trash-2" width={14} />
              </button>
            )}
          </div>
        </div>

        {isReplying && (
          <div
            className={styles.reply}
            style={
              depth > 0
                ? { marginLeft: -(depth * REPLY_COMPOSER_INDENT_PER_LEVEL) }
                : undefined
            }
          >
            <RichTextEditor
              value={replyBody}
              onChange={setReplyBody}
              onSubmit={submitReply}
              label={t("comments.replyPlaceholder")}
              placeholder={t("comments.replyPlaceholder")}
              autoFocus
              members={sources.members}
              issues={sources.issues}
              {...attachmentHandlers}
            />
            <div className={styles.composerFoot}>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsReplying(false)}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={isEmptyDoc(replyBody) || isSending}
                onClick={submitReply}
              >
                {t("comments.reply")}
              </Button>
            </div>
          </div>
        )}

        {visibleReplies.length > 0 && (
          <button
            type="button"
            className={styles.repliesToggle}
            onClick={() => setRepliesCollapsed((v) => !v)}
            aria-expanded={!repliesCollapsed}
          >
            <Icon
              icon={
                repliesCollapsed
                  ? "lucide:chevron-right"
                  : "lucide:chevron-down"
              }
              width={14}
              aria-hidden="true"
            />
            {t(
              repliesCollapsed
                ? "comments.showReplies"
                : "comments.hideReplies",
              { count: visibleReplies.length },
            )}
          </button>
        )}

        {visibleReplies.length > 0 && !repliesCollapsed && (
          <ol className={styles.replies}>
            {visibleReplies.map((reply, index) => {
              // Two formerly separate branches end up as siblings here — a
              // divider marks where one ends and the next (new reply
              // branch) begins.
              const isNewBranch =
                !!flatEntries &&
                index > 0 &&
                flatEntries[index].branchId !== flatEntries[index - 1].branchId;
              return (
                <Fragment key={reply.id}>
                  {isNewBranch && (
                    <li className={styles.branchDivider} aria-hidden="true" />
                  )}
                  <CommentThread
                    comment={reply}
                    depth={flattensChildren ? MAX_INDENT_DEPTH + 1 : depth + 1}
                    skipOwnReplies={flattensChildren}
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
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onReply={onReply}
                    onToggleReaction={onToggleReaction}
                    onCopyLink={onCopyLink}
                  />
                </Fragment>
              );
            })}
          </ol>
        )}
      </div>
    </li>
  );
}
