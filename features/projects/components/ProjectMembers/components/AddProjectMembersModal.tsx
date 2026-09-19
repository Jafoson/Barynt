"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { CopyField } from "@/components/ui/atoms/CopyField/CopyField";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { Label } from "@/components/ui/atoms/Label/Label";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { UserCell } from "@/components/ui/atoms/UserCell/UserCell";
import {
  ModalFooter,
  ModalShortcut,
} from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import {
  addProjectMembers,
  inviteProjectMembers,
} from "@/features/projects/actions";
import { parseEmailList } from "@/lib/utils/parse-emails";
import { fullName } from "@/lib/utils/string";
import { useSubmitShortcut } from "@/lib/utils/useSubmitShortcut";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import type { Role, User } from "@/types";
import styles from "./addProjectMembersModal.module.scss";

type Mode = "workspace" | "invite";

type BulkResult = Awaited<ReturnType<typeof inviteProjectMembers>>;
type BulkRow = Extract<BulkResult, { rows: unknown }>["rows"][number];

interface AddProjectMembersModalProps {
  projectId: string;
  projectName: string;
  /** Workspace members without their own project entry. */
  candidates: User[];
  /** Roles the current user is allowed to assign. */
  roles: Role[];
  defaultRole: string;
  /** Without this permission the email path is missing — new accounts are taboo. */
  canInvite: boolean;
  close: () => void;
  /** A bottom sheet (phone) instead of a dialog. */
  sheet?: boolean;
}

/**
 * Two ways into the project: pick existing workspace members or invite an
 * outside address. Both end with the same role, so the role picker sits
 * below both modes instead of being duplicated in each.
 */
export function AddProjectMembersModal({
  projectId,
  projectName,
  candidates,
  roles,
  defaultRole,
  canInvite,
  close,
  sheet,
}: AddProjectMembersModalProps) {
  const t = useTranslations();
  const bodyRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [mode, setMode] = useState<Mode>(
    // If everyone is already in the project, the selection list would be
    // empty — in that case the dialog starts directly at inviting.
    candidates.length === 0 && canInvite ? "invite" : "workspace",
  );
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [emailsText, setEmailsText] = useState("");
  const [role, setRole] = useState(defaultRole);
  const [error, setError] = useState("");
  // Populated when inviting unknown addresses: those accounts have no
  // password, and their link is the only way in. An invalid or already-taken
  // address doesn't block the remaining rows.
  const [rows, setRows] = useState<BulkRow[] | null>(null);

  const roleName = roles.find((r) => r.id === role)?.name ?? role;

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? candidates.filter((user) =>
        `${fullName(user)} ${user.email ?? ""}`.toLowerCase().includes(needle),
      )
    : candidates;

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const emails = parseEmailList(emailsText);
  const done = rows !== null;

  const canSubmit =
    !isPending &&
    !!role &&
    (mode === "workspace" ? selected.size > 0 : emails.length > 0);

  const submit = () => {
    if (!canSubmit) return;
    setError("");
    startTransition(async () => {
      if (mode === "workspace") {
        const result = await addProjectMembers({
          projectId,
          userIds: [...selected],
          role,
        });
        if ("error" in result) {
          setError(result.error);
          return;
        }
        router.refresh();
        close();
        return;
      }

      const result = await inviteProjectMembers({ projectId, emails, role });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      router.refresh();
      // Newly created accounts need their invitation link — the dialog
      // stays open until it could be copied.
      setRows(result.rows);
    });
  };

  const finish = () => {
    router.refresh();
    close();
  };

  useSubmitShortcut(done ? finish : submit);

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
            done
              ? t("members.inviteResultsTitle")
              : t("projectMembers.addTitle", { project: projectName })
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
            done
              ? t("members.inviteResultsTitle")
              : t("projectMembers.addTitle", { project: projectName })
          }
          onClose={finish}
          closeLabel={t("actions.close")}
        />
      )}

      {done ? (
        <ModalBody className={styles.body} ref={bodyRef}>
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
        </ModalBody>
      ) : (
        <ModalBody className={styles.body} ref={bodyRef}>
          {canInvite && (
            <SegmentedControl
              items={[
                {
                  value: "workspace",
                  label: t("projectMembers.fromWorkspace"),
                },
                { value: "invite", label: t("projectMembers.byEmail") },
              ]}
              value={mode}
              onChange={(value) => {
                setMode(value as Mode);
                setError("");
              }}
            />
          )}

          {mode === "workspace" ? (
            candidates.length === 0 ? (
              <EmptyState
                icon={<Icon icon="lucide:users" width={28} />}
                title={t("projectMembers.allAdded")}
                description={
                  canInvite ? t("projectMembers.allAddedHint") : undefined
                }
              />
            ) : (
              <>
                <Input
                  autoFocus={!sheet}
                  variant="search"
                  size="sm"
                  placeholder={t("projectMembers.searchPlaceholder")}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />

                <ul className={styles.list}>
                  {filtered.map((user) => {
                    const isSelected = selected.has(user.id);
                    return (
                      <li key={user.id}>
                        <button
                          type="button"
                          className={styles.candidate}
                          aria-pressed={isSelected}
                          onClick={() => toggle(user.id)}
                        >
                          <UserCell
                            avatar={user}
                            name={fullName(user)}
                            meta={user.email}
                            size={28}
                            trailing={
                              user.pending && (
                                <Label size="xs" color="var(--amber)">
                                  {t("projectMembers.pending")}
                                </Label>
                              )
                            }
                          />
                          <Icon
                            className={styles.check}
                            icon={isSelected ? "lucide:check" : "lucide:plus"}
                            width={15}
                          />
                        </button>
                      </li>
                    );
                  })}

                  {filtered.length === 0 && (
                    <li className={styles.noResults}>
                      {t("empty.noResults", { q: query })}
                    </li>
                  )}
                </ul>
              </>
            )
          ) : (
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
              <span className={styles.hint}>
                {t("projectMembers.inviteHint")} {t("members.emailsHint")}
              </span>
            </div>
          )}

          <div className={styles.roleRow}>
            <span className={styles.roleLabel}>{t("fields.role")}</span>
            <InlinePicker
              trigger={
                <Badge as="button" mono={false} active>
                  {roleName}
                  <Icon icon="lucide:chevron-down" width={12} />
                </Badge>
              }
              width={220}
            >
              {(closePicker) => (
                <SelectMenu
                  items={roles.map((r) => ({ value: r.id, label: r.name }))}
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

          {error && <p className={styles.error}>{error}</p>}
        </ModalBody>
      )}

      <ModalFooter
        hint={
          done ? undefined : (
            <ModalShortcut keys="mod+enter">
              {mode === "workspace"
                ? t("projectMembers.toAdd")
                : t("projectMembers.toInvite")}
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
            <Button variant="primary" disabled={!canSubmit} onClick={submit}>
              {mode === "workspace"
                ? t("projectMembers.addSelected", { count: selected.size })
                : t("actions.inviteMember")}
            </Button>
          </>
        )}
      </ModalFooter>
    </Modal>
  );
}
