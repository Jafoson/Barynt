"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { ColorPicker } from "@/components/ui/atoms/ColorPicker/ColorPicker";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { UserCell } from "@/components/ui/atoms/UserCell/UserCell";
import {
  ModalFooter,
  ModalShortcut,
} from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { SheetHeader } from "@/components/ui/layout/Modal/components/SheetHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import { createTeam, updateTeam } from "@/features/workspaces/actions";
import type { WorkspaceTeamRow } from "@/features/workspaces/types";
import { PALETTE } from "@/lib/utils";
import { fullName } from "@/lib/utils/string";
import { useSubmitShortcut } from "@/lib/utils/useSubmitShortcut";
import { useSwipeToClose } from "@/lib/utils/useSwipeToClose";
import type { User } from "@/types";
import styles from "./teamModal.module.scss";

interface Props {
  workspaceId: string;
  /** Set = editing, unset = creating. */
  team?: WorkspaceTeamRow;
  /** Members of the workspace — only they can join a team. */
  candidates: User[];
  projects: { id: string; name: string; color: string }[];
  /** Roles assignable to a project — see the type comment. */
  assignableProjectRoles: { key: string; name: string; rank: number }[];
  canManageMembers: boolean;
  canManageProjects: boolean;
  onDone: () => void;
  close: () => void;
  /** A bottom sheet (phone) instead of a dialog. */
  sheet?: boolean;
}

/** Short code like for a project: up to four characters, letters and digits. */
function suggestKey(value: string) {
  return value
    .replace(/[^a-zA-Z0-9]/g, "")
    .toUpperCase()
    .slice(0, 4);
}

function toggle(set: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(set);
  if (!next.delete(id)) next.add(id);
  return next;
}

/**
 * Create and edit in one dialog — they're the same fields.
 *
 * Four fields make up the team (name, short code, color, lead), two lists
 * fill it (members, projects). The lists only appear where they're also
 * editable: `team.member.manage` and `team.project.manage` are separate
 * permissions, and a selection that silently expires on save would be a lie.
 *
 * The lead is also a member — the server adds them to the list regardless,
 * so here they're already marked as such.
 *
 * A chosen project additionally carries a role (or none, for pure
 * grouping) — that's what team members receive there
 * (`syncProjectTeamRoles`, lib/project-membership.ts). Newly picked
 * projects start without a role: whoever wants to grant one selects it
 * explicitly, instead of a checkbox handing out access in passing.
 */
export function TeamModal({
  workspaceId,
  team,
  candidates,
  projects,
  assignableProjectRoles,
  canManageMembers,
  canManageProjects,
  onDone,
  close,
  sheet,
}: Props) {
  const t = useTranslations();
  const [isPending, startTransition] = useTransition();
  const bodyRef = useRef<HTMLDivElement>(null);
  const swipe = useSwipeToClose(close, bodyRef);

  const [name, setName] = useState(team?.name ?? "");
  const [key, setKey] = useState(team?.key ?? "");
  const [keyTouched, setKeyTouched] = useState(Boolean(team));
  const [color, setColor] = useState(team?.color ?? PALETTE[0]);
  const [desc, setDesc] = useState(team?.desc ?? "");
  const [leadId, setLeadId] = useState(
    team?.lead?.id ?? candidates[0]?.id ?? "",
  );
  const [members, setMembers] = useState<ReadonlySet<string>>(
    new Set(team?.members.map((m) => m.id) ?? []),
  );
  // Project id → role key, or `null` for pure grouping without a role.
  // Whoever's in the map is selected — this replaces the former `Set`.
  const [projectRoles, setProjectRoles] = useState<
    ReadonlyMap<string, string | null>
  >(new Map(team?.projects.map((p) => [p.id, p.role?.key ?? null]) ?? []));
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const trimmed = name.trim();
  // As long as the short code hasn't been touched by hand, it follows the name.
  const effectiveKey = keyTouched ? key : suggestKey(trimmed);
  // The previous lead is kept as a fallback: they may have left the
  // workspace and then be missing from the candidate list — the trigger
  // should still say who's set, instead of showing "pick a person".
  const lead = candidates.find((c) => c.id === leadId) ?? team?.lead ?? null;

  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? candidates.filter((user) =>
        `${fullName(user)} ${user.email}`.toLowerCase().includes(needle),
      )
    : candidates;

  const projectById = new Map(projects.map((p) => [p.id, p]));
  // Only what isn't already in there qualifies as an offering in the
  // dropdown — a project appears in the team at most once.
  const availableProjects = projects.filter((p) => !projectRoles.has(p.id));

  const submit = () => {
    if (!trimmed || !leadId || isPending) return;

    const data = {
      name: trimmed,
      key: effectiveKey,
      color,
      desc,
      leadId,
      memberIds: [...members],
      projects: [...projectRoles].map(([projectId, roleKey]) => ({
        projectId,
        roleKey,
      })),
    };

    startTransition(async () => {
      const result = team
        ? await updateTeam(team.id, data)
        : await createTeam(workspaceId, data);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      onDone();
      close();
    });
  };

  useSubmitShortcut(submit);

  return (
    <Modal
      width={560}
      variant={sheet ? "sheet" : "dialog"}
      style={sheet ? swipe.style : undefined}
      {...(sheet ? swipe.handlers : {})}
    >
      {sheet ? (
        <SheetHeader
          title={
            team ? t("workspaceTeams.editTitle") : t("workspaceTeams.newTitle")
          }
          onClose={close}
          closeLabel={t("actions.cancel")}
        />
      ) : (
        <ModalHeader
          leading={
            <Icon
              icon="lucide:users-round"
              width={16}
              className={styles.headerIcon}
            />
          }
          title={
            team ? t("workspaceTeams.editTitle") : t("workspaceTeams.newTitle")
          }
          onClose={close}
          closeLabel={t("actions.cancel")}
        />
      )}

      <ModalBody className={styles.body} ref={bodyRef}>
        <div className={styles.row}>
          <Input
            autoFocus={!sheet}
            className={styles.grow}
            label={t("fields.name")}
            placeholder={t("workspaceTeams.namePlaceholder")}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
          />
          <Input
            className={styles.keyInput}
            label={t("workspaceTeams.key")}
            value={effectiveKey}
            spellCheck={false}
            maxLength={4}
            onChange={(e) => {
              setKeyTouched(true);
              setKey(suggestKey(e.target.value));
              setError("");
            }}
          />
        </div>

        <Input
          label={t("fields.description")}
          placeholder={t("workspaceTeams.descPlaceholder")}
          value={desc}
          onChange={(e) => setDesc(e.target.value)}
        />

        <div className={styles.field}>
          <span className={styles.label}>{t("fields.color")}</span>
          <ColorPicker value={color} onChange={setColor} />
        </div>

        <div className={styles.field}>
          <span className={styles.label}>{t("workspaceTeams.lead")}</span>
          <InlinePicker
            trigger={
              <Badge as="button" mono={false} active>
                {lead ? fullName(lead) : t("workspaceTeams.pickLead")}
                <Icon icon="lucide:chevron-down" width={12} />
              </Badge>
            }
            width={260}
            stop
          >
            {(closePicker) => (
              <SelectMenu
                items={candidates.map((user) => ({
                  value: user.id,
                  label: fullName(user),
                  hint: user.email ?? undefined,
                }))}
                value={leadId}
                onPick={(value) => {
                  const next = String(value);
                  setLeadId(next);
                  // Whoever leads is a member — otherwise the row would
                  // have a person in charge who doesn't belong to the team.
                  setMembers((prev) => new Set(prev).add(next));
                  closePicker();
                }}
                onClose={closePicker}
              />
            )}
          </InlinePicker>
        </div>

        {canManageMembers && (
          <div className={styles.field}>
            <span className={styles.label}>
              {t("workspaceTeams.membersCount", { count: members.size })}
            </span>
            <Input
              variant="search"
              size="sm"
              placeholder={t("projectMembers.searchPlaceholder")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <ul className={styles.list}>
              {filtered.map((user) => {
                const picked = members.has(user.id);
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      className={styles.option}
                      aria-pressed={picked}
                      onClick={() =>
                        setMembers((prev) => toggle(prev, user.id))
                      }
                    >
                      <UserCell
                        avatar={user}
                        name={fullName(user)}
                        meta={user.email}
                        size={26}
                      />
                      <Icon
                        className={styles.check}
                        icon={picked ? "lucide:check" : "lucide:plus"}
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
          </div>
        )}

        {canManageProjects && projects.length > 0 && (
          <div className={styles.field}>
            <div className={styles.projectsHead}>
              <span className={styles.label}>
                {t("workspaceTeams.projectsCount", {
                  count: projectRoles.size,
                })}
              </span>

              {availableProjects.length > 0 && (
                <InlinePicker
                  trigger={
                    <button type="button" className={styles.addProject}>
                      <Icon icon="lucide:plus" width={13} />
                      {t("workspaceTeams.addProject")}
                    </button>
                  }
                  width={240}
                  stop
                >
                  {(closePicker) => (
                    <SelectMenu
                      searchable={availableProjects.length > 6}
                      items={availableProjects.map((project) => ({
                        value: project.id,
                        label: project.name,
                      }))}
                      value=""
                      onPick={(value) => {
                        // Newly added means without a role: whoever wants
                        // to grant one selects it explicitly in the next step.
                        setProjectRoles((prev) =>
                          new Map(prev).set(String(value), null),
                        );
                        closePicker();
                      }}
                      onClose={closePicker}
                    />
                  )}
                </InlinePicker>
              )}
            </div>

            {projectRoles.size > 0 ? (
              <ul className={styles.projectList}>
                {[...projectRoles.keys()].map((projectId) => {
                  const project = projectById.get(projectId);
                  if (!project) return null;
                  const roleKey = projectRoles.get(projectId) ?? null;
                  const roleName = roleKey
                    ? (assignableProjectRoles.find((r) => r.key === roleKey)
                        ?.name ?? roleKey)
                    : t("workspaceTeams.noRole");

                  return (
                    <li key={projectId} className={styles.projectRow}>
                      <span className={styles.projectName}>
                        <span
                          className={styles.chipDot}
                          style={{ background: project.color }}
                          aria-hidden
                        />
                        {project.name}
                      </span>

                      <InlinePicker
                        trigger={
                          <button
                            type="button"
                            className={styles.roleChip}
                            title={t("workspaceTeams.projectRole")}
                          >
                            {roleName}
                            <Icon icon="lucide:chevron-down" width={11} />
                          </button>
                        }
                        width={200}
                        stop
                      >
                        {(closePicker) => (
                          <SelectMenu
                            items={[
                              { value: "", label: t("workspaceTeams.noRole") },
                              ...assignableProjectRoles.map((r) => ({
                                value: r.key,
                                label: r.name,
                              })),
                            ]}
                            value={roleKey ?? ""}
                            onPick={(value) => {
                              const next = String(value) || null;
                              setProjectRoles((prev) =>
                                new Map(prev).set(projectId, next),
                              );
                              closePicker();
                            }}
                            onClose={closePicker}
                          />
                        )}
                      </InlinePicker>

                      <button
                        type="button"
                        className={styles.removeProject}
                        aria-label={t("actions.remove")}
                        title={t("actions.remove")}
                        onClick={() =>
                          setProjectRoles((prev) => {
                            const next = new Map(prev);
                            next.delete(projectId);
                            return next;
                          })
                        }
                      >
                        <Icon icon="lucide:x" width={14} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.noResults}>
                {t("workspaceTeams.noProjectsPicked")}
              </p>
            )}
          </div>
        )}

        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}
      </ModalBody>

      <ModalFooter hint={<ModalShortcut keys="mod+enter" />}>
        {!sheet && (
          <Button variant="ghost" disabled={isPending} onClick={close}>
            {t("actions.cancel")}
          </Button>
        )}
        <Button
          variant="primary"
          disabled={!trimmed || !leadId || isPending}
          onClick={submit}
        >
          {team ? t("actions.save") : t("actions.create")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
