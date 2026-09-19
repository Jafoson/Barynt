"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { CopyField } from "@/components/ui/atoms/CopyField/CopyField";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Label } from "@/components/ui/atoms/Label/Label";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import {
  ModalFooter,
  ModalShortcut,
} from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import { inviteWorkspaceMembers } from "@/features/workspaces/actions";
import { roleColor } from "@/lib/rbac";
import { parseEmailList } from "@/lib/utils/parse-emails";
import { useSubmitShortcut } from "@/lib/utils/useSubmitShortcut";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import type { Role } from "@/types";
import styles from "./inviteMemberModal.module.scss";

interface Props {
  workspaceId: string;
  /** Roles the current user is allowed to assign — filtered by the server. */
  roles: Role[];
  close: () => void;
  /** A bottom sheet (phone) instead of a dialog. */
  sheet?: boolean;
}

type BulkResult = Awaited<ReturnType<typeof inviteWorkspaceMembers>>;
type BulkRow = Extract<BulkResult, { rows: unknown }>["rows"][number];

/**
 * Invite one or more addresses into the workspace.
 *
 * After submitting, each address gets its own row: a known account simply
 * ends up as a member, an unknown address gets an invitation link. That
 * link goes out by mail when SMTP is configured (`mailSent`) — it stays
 * displayed regardless, until it's been copied, rather than vanishing with
 * the dialog, in case mail isn't sent or delivery falters. An invalid or
 * already-taken address doesn't block the remaining rows.
 */
export function InviteMemberModal({ workspaceId, roles, close, sheet }: Props) {
  const t = useTranslations();
  const bodyRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [emailsText, setEmailsText] = useState("");
  const [role, setRole] = useState(
    roles.find((r) => r.id === "member")?.id ?? roles.at(-1)?.id ?? "",
  );
  const [error, setError] = useState("");
  const [rows, setRows] = useState<BulkRow[] | null>(null);

  const selected = roles.find((r) => r.id === role);
  const done = rows !== null;
  const emails = parseEmailList(emailsText);

  const submit = () => {
    if (done) {
      finish();
      return;
    }
    if (emails.length === 0 || !role || isPending) return;
    setError("");

    startTransition(async () => {
      const result = await inviteWorkspaceMembers({
        workspaceId,
        emails,
        role,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setRows(result.rows);
      router.refresh();
    });
  };

  const finish = () => {
    router.refresh();
    close();
  };

  useSubmitShortcut(submit);

  const swipe = useSwipeToClose(finish, bodyRef);

  return (
    <Modal
      width={520}
      variant={sheet ? "sheet" : "dialog"}
      style={sheet ? swipe.style : undefined}
      {...(sheet ? swipe.handlers : {})}
    >
      {sheet ? (
        <SheetHeader
          title={
            done ? t("members.inviteResultsTitle") : t("members.inviteTitle")
          }
          onClose={finish}
          closeLabel={t("actions.close")}
        />
      ) : (
        <ModalHeader
          leading={
            <Icon
              icon={done ? "lucide:mail-check" : "lucide:user-plus"}
              width={16}
              className={styles.headerIcon}
            />
          }
          title={
            done ? t("members.inviteResultsTitle") : t("members.inviteTitle")
          }
          onClose={finish}
          closeLabel={t("actions.close")}
        />
      )}

      <ModalBody className={styles.body} ref={bodyRef}>
        {done ? (
          <ul className={styles.resultList}>
            {rows.map((row) => (
              <li key={row.email} className={styles.resultRow}>
                <div className={styles.resultHead}>
                  <Icon
                    icon={
                      "error" in row.result
                        ? "lucide:circle-alert"
                        : row.result.inviteUrl
                          ? "lucide:mail"
                          : "lucide:check"
                    }
                    width={14}
                    className={
                      "error" in row.result
                        ? styles.resultIconError
                        : styles.resultIconOk
                    }
                  />
                  <span className={styles.resultEmail}>{row.email}</span>
                </div>
                {"error" in row.result ? (
                  <p className={styles.resultError}>{row.result.error}</p>
                ) : row.result.inviteUrl ? (
                  <>
                    <p className={styles.resultNote}>
                      {t(
                        row.result.mailSent
                          ? "members.inviteMailedShort"
                          : "members.inviteLinkOnlyShort",
                      )}
                    </p>
                    <CopyField
                      value={row.result.inviteUrl}
                      copyLabel={t("members.inviteLinkCopy")}
                      copiedLabel={t("members.inviteLinkCopied")}
                    />
                  </>
                ) : (
                  <p className={styles.resultNote}>
                    {t("members.inviteAddedShort")}
                  </p>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <>
            <p className={styles.desc}>{t("members.inviteDesc")}</p>

            <div className={styles.field}>
              <span className={styles.label}>{t("members.emailsLabel")}</span>
              <textarea
                className={styles.emailsInput}
                placeholder={t("members.emailsPlaceholder")}
                value={emailsText}
                onChange={(e) => setEmailsText(e.target.value)}
                rows={3}
                spellCheck={false}
              />
              <span className={styles.hint}>{t("members.emailsHint")}</span>
            </div>

            <div className={styles.field}>
              <span className={styles.label}>{t("fields.role")}</span>
              <InlinePicker
                trigger={
                  <button type="button" className={styles.roleTrigger}>
                    <Label
                      size="sm"
                      filled
                      color={roleColor(selected?.rank ?? 0)}
                    >
                      {selected?.name ?? role}
                    </Label>
                    <Icon icon="lucide:chevron-down" width={14} />
                  </button>
                }
                width={240}
                stop
              >
                {(closePicker) => (
                  <SelectMenu
                    items={roles.map((r) => ({
                      value: r.id,
                      label: r.name,
                      hint: r.desc,
                    }))}
                    value={role}
                    onPick={(value) => {
                      setRole(String(value));
                      closePicker();
                    }}
                    onClose={closePicker}
                  />
                )}
              </InlinePicker>
            </div>

            {error && (
              <p className={styles.error} role="alert">
                <Icon icon="lucide:circle-alert" width={14} />
                {error}
              </p>
            )}
          </>
        )}
      </ModalBody>

      <ModalFooter
        hint={
          done ? undefined : (
            <ModalShortcut keys="mod+enter">
              {t("projectMembers.toInvite")}
            </ModalShortcut>
          )
        }
      >
        {done ? (
          <Button variant="primary" onClick={finish}>
            {t("actions.close")}
          </Button>
        ) : (
          <>
            {!sheet && (
              <Button variant="ghost" onClick={close}>
                {t("actions.cancel")}
              </Button>
            )}
            <Button
              variant="primary"
              disabled={emails.length === 0 || !role || isPending}
              onClick={submit}
            >
              {t("actions.inviteMember")}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
