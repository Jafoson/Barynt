"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { EmptyState } from "@/components/ui/atoms/EmptyState/EmptyState";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import {
  createRole,
  deleteRole,
  setRoleGrants,
  updateRole,
} from "@/features/roles/actions";
import { NewRoleModal } from "@/features/roles/components/NewRoleModal/NewRoleModal";
import {
  cellId,
  PermissionMatrix,
} from "@/features/roles/components/PermissionMatrix/PermissionMatrix";
import { RoleCards } from "@/features/roles/components/RoleCards/RoleCards";
import { RoleEditor } from "@/features/roles/components/RoleEditor/RoleEditor";
import type {
  GrantChange,
  RoleView,
  RoleManagerView as View,
} from "@/features/roles/types";
import { useModal } from "@/lib/context";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { useUnsavedChanges } from "@/lib/utils/useUnsavedChanges";
import styles from "./roleManagerView.module.scss";

interface Props {
  view: View;
  title: string;
  subtitle: string;
  /** On pages with a tab switcher, the title is already on the tab. */
  showTitle?: boolean;
}

/**
 * Display and edit the roles of one pool.
 *
 * The same component serves all three scopes — what differs lives in
 * `target` and in the limits the server has already computed
 * (`manageable`, `grantable`, `maxRank`). The UI knows neither role names
 * nor rank rules.
 *
 * Shared system roles appear alongside the rest but are locked: they're the
 * same row for every tenant. They stay visible so it's possible to trace
 * what, say, "Member" grants — and because comparing against them is the
 * most common reason to be here at all.
 *
 * A role's core data (name, rank, delete) goes straight to the server —
 * these are individual fields with individual intents. The matrix doesn't:
 * there, `pending` collects the clicks until someone saves. Reworking a
 * role means working through an entire column, and for the same reason a
 * guard rides along that won't let the page be left without asking.
 */
export function RoleManagerView({
  view,
  title,
  subtitle,
  showTitle = true,
}: Props) {
  const t = useTranslations();
  const router = useRouter();
  const confirm = useConfirm();
  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);
  const [pending, startTransition] = useTransition();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Which columns the matrix is currently not showing. Stays in the
  // browser: it's a matter of view, not data — two people comparing the
  // same roles won't use the same selection, and `router.refresh()` after
  // every click in the matrix would just catch up to a saved selection anyway.
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());

  const toggleHidden = (roleId: string) =>
    setHidden((current) => {
      const next = new Set(current);
      if (!next.delete(roleId)) next.add(roleId);
      return next;
    });

  // The not-yet-written clicks in the matrix, one per cell.
  const [draft, setDraft] = useState<ReadonlyMap<string, GrantChange>>(
    new Map(),
  );

  const roles = withDraft(view.roles, draft);

  /** What the server currently says — the reference point for "changed". */
  const saved = (roleId: string, permission: string) =>
    view.roles
      .find((role) => role.id === roleId)
      ?.grants.includes(permission) ?? false;

  const stage = (change: GrantChange) =>
    setDraft((current) => {
      const next = new Map(current);
      const id = cellId(change.roleId, change.permission);
      // Whoever clicks twice is back at the starting value and hasn't
      // changed anything — the cell then disappears from the batch, and
      // with it possibly the entire bar.
      if (change.granted === saved(change.roleId, change.permission))
        next.delete(id);
      else next.set(id, change);
      return next;
    });

  // Every action returns either `ok` or a text. The error shows up visibly
  // above the matrix instead of silently in the console.
  const run = (action: () => Promise<{ ok: true } | { error: string }>) =>
    startTransition(async () => {
      const result = await action();
      setError("error" in result ? result.error : null);
      if (!("error" in result)) router.refresh();
    });

  const save = () => {
    if (draft.size === 0) return;
    run(async () => {
      const result = await setRoleGrants([...draft.values()]);
      // Only after the server's yes — and in the same transition as the
      // `router.refresh()` in `run`. React shows both together, otherwise
      // the old state you just overwrote would flash back for an instant.
      // On an error, the batch stays put: you don't throw away a quarter
      // hour of work over one error message.
      if (!("error" in result)) setDraft(new Map());
      return result;
    });
  };

  // The guard asks before the page navigates away — a click in the matrix
  // looks like a write, and whoever believes that keeps going unsuspecting.
  useUnsavedChanges(draft.size > 0, () =>
    confirm({
      title: t("roles.leaveTitle"),
      description: t("roles.leaveDesc"),
      confirmLabel: t("roles.leaveConfirm"),
      cancelLabel: t("roles.leaveStay"),
      danger: true,
    }),
  );

  // A dialog from a tablet up, a bottom sheet on a phone.
  const openNewRole = () =>
    openModal(
      ({ close }) => (
        <NewRoleModal
          close={close}
          sheet={isPhone}
          onCreate={async (name, desc) => {
            const result = await createRole(view.target, { name, desc });
            if ("error" in result) return result.error;
            router.refresh();
            return null;
          }}
        />
      ),
      {
        ...(isPhone ? { placement: "bottom" as const } : {}),
        label: t("roles.newRole"),
      },
    );

  const editing = editingId
    ? (roles.find((role) => role.id === editingId) ?? null)
    : null;

  // The carrier count on the cards counts the pool you're currently in.
  // Only this layer knows which one that is — the workspace's project
  // roles apply in all of its projects and are therefore counted across
  // all of them too.
  const carriersHint =
    view.target.scope === "PLATFORM"
      ? t("roles.carriersOnPlatform")
      : view.target.scope === "PROJECT" && view.target.projectId
        ? t("roles.carriersInProject")
        : t("roles.carriersInWorkspace");

  const shown = roles.filter((role) => !hidden.has(role.id));
  // Deleted roles can linger in the selection; what's counted is what can
  // actually still be hidden.
  const hiddenCount = roles.length - shown.length;

  return (
    <section className={styles.wrap}>
      {/* Without its own title, the switcher sits above the header, and it
          already brings the top line along — see `.underSwitcher`. */}
      <header
        className={`${styles.pageHeader} ${showTitle ? "" : styles.underSwitcher}`}
      >
        <div className={styles.headText}>
          {/* On pages with a tab switcher, the title is already on the tab. */}
          {showTitle && <h2 className={styles.pageTitle}>{title}</h2>}
          <p className={styles.subtitle}>{subtitle}</p>
        </div>

        <div className={styles.headAction}>
          {/* Only shown when there's something to bring back — and for
              people without permissions too: anyone watching is allowed to
              hide things. */}
          {hiddenCount > 0 && (
            <Button
              variant="text"
              icon={<Icon icon="lucide:eye" width={15} />}
              onClick={() => setHidden(new Set())}
            >
              {t("roles.showHidden", { count: hiddenCount })}
            </Button>
          )}

          {view.canManage && (
            <Button
              variant="primary"
              icon={<Icon icon="lucide:plus" width={15} />}
              onClick={openNewRole}
            >
              {t("roles.newRole")}
            </Button>
          )}
        </div>
      </header>

      <div className={styles.body}>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}

        {roles.length === 0 ? (
          <EmptyState
            icon={<Icon icon="lucide:shield" width={32} />}
            title={t("roles.emptyTitle")}
            description={t("roles.emptyDesc")}
          />
        ) : (
          <>
            <RoleCards
              roles={roles}
              total={view.permissions.length}
              carriersHint={carriersHint}
              hidden={hidden}
              editingId={editingId}
              onToggle={toggleHidden}
              onEdit={setEditingId}
            />

            {editing && (
              <RoleEditor
                key={editing.id}
                role={editing}
                maxRank={view.maxRank}
                pending={pending}
                onUpdate={(patch) => run(() => updateRole(editing.id, patch))}
                onDelete={() =>
                  run(async () => {
                    const result = await deleteRole(editing.id);
                    if (!("error" in result)) {
                      setEditingId(null);
                      // Whatever was pending for the role goes with it —
                      // otherwise the bar would hang onto a column that no
                      // longer exists, and saving would hit an error.
                      setDraft(withoutRole(editing.id));
                    }
                    return result;
                  })
                }
                onClose={() => setEditingId(null)}
              />
            )}

            <PermissionMatrix
              roles={shown}
              permissions={view.permissions}
              grantable={view.grantable}
              changed={new Set(draft.keys())}
              saving={pending}
              onChange={stage}
              onSave={save}
              onDiscard={() => setDraft(new Map())}
            />
          </>
        )}
      </div>
    </section>
  );
}

/** Removes everything from the batch that belongs to a role. */
const withoutRole =
  (roleId: string) => (current: ReadonlyMap<string, GrantChange>) =>
    new Map(
      [...current].filter(([, change]) => change.roleId !== roleId),
    ) as ReadonlyMap<string, GrantChange>;

/**
 * Overlays the not-yet-saved clicks on top of the server's state.
 *
 * This way the matrix only ever sees a list of roles and doesn't need to
 * know which value came from where — its `changed` prop tells it which
 * cell is pending.
 */
function withDraft(
  roles: RoleView[],
  draft: ReadonlyMap<string, GrantChange>,
): RoleView[] {
  if (draft.size === 0) return roles;

  const byRole = new Map<string, GrantChange[]>();
  for (const change of draft.values()) {
    const list = byRole.get(change.roleId);
    if (list) list.push(change);
    else byRole.set(change.roleId, [change]);
  }

  return roles.map((role) => {
    const changes = byRole.get(role.id);
    if (!changes) return role;

    const grants = new Set(role.grants);
    for (const change of changes) {
      if (change.granted) grants.add(change.permission);
      else grants.delete(change.permission);
    }
    return { ...role, grants: [...grants] };
  });
}
