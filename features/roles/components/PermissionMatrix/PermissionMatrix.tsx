"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Fragment, useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Input } from "@/components/ui/atoms/Input/Input";
import type { GrantChange, RoleView } from "@/features/roles/types";
import { roleColor } from "@/lib/rbac";
import { COMPACT_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import styles from "./permissionMatrix.module.scss";

/** A cell's address — the caller uses the same construction for `changed`. */
export const cellId = (roleId: string, permission: string) =>
  `${roleId}|${permission}`;

interface Props {
  /** Columns. Order as passed in (rank descending), without the hidden
   *  ones — the matrix only knows what it should display. The still-pending
   *  changes are already factored in. */
  roles: RoleView[];
  /** Rows — the permissions that may be assigned in this scope. */
  permissions: { key: string; desc: string }[];
  /** Permissions the actor is allowed to pass on. */
  grantable: string[];
  /**
   * Cells that differ from the server's state (`cellId`) — including the
   * currently hidden ones: the bar counts everything that would be included
   * on save.
   */
  changed: ReadonlySet<string>;
  /** The batch is currently being sent to the server. */
  saving: boolean;
  onChange: (change: GrantChange) => void;
  onSave: () => void;
  onDiscard: () => void;
}

/**
 * A table instead of a list per role: rows are permissions, columns are
 * roles.
 *
 * The comparison is this page's actual purpose — "can the Viewer do what
 * the Contributor can?" is answered by one row, not by expanding two cards
 * one after another. That's why the header row and first column stay fixed
 * while scrolling; without both, a matrix loses its usefulness.
 *
 * A cell has two states: the role has the permission, or it doesn't. There
 * used to be a third, "explicitly denied"; since every context resolves to
 * exactly one role, it would be indistinguishable from "doesn't have it" —
 * a no-entry sign that denies nothing belongs in no permissions table.
 *
 * Writes only happen on button press. A click on a single cell is rarely
 * meant in isolation: reworking a role means going down a column, and
 * missing along the way happens too. As its own separate write, every
 * misclick would become law immediately — collected, it stays an intention
 * until saved, one that can still be undone.
 */
export function PermissionMatrix({
  roles,
  permissions,
  grantable,
  changed,
  saving,
  onChange,
  onSave,
  onDiscard,
}: Props) {
  const t = useTranslations();
  const [query, setQuery] = useState("");
  // A phone or tablet shows one role's column at a time, picked from the chips above
  // the table — six columns of a matrix don't fit next to the permission.
  const isPhone = useMediaQuery(COMPACT_QUERY);
  const [focusId, setFocusId] = useState<string | null>(null);
  const focused = roles.find((role) => role.id === focusId) ?? roles[0];
  const columns = isPhone && focused ? [focused] : roles;

  const canGrant = new Set(grantable);
  const needle = query.trim().toLowerCase();
  const visible = needle
    ? permissions.filter(
        (p) =>
          p.key.toLowerCase().includes(needle) ||
          p.desc.toLowerCase().includes(needle),
      )
    : permissions;

  const groups = groupPermissions(visible);

  return (
    <div className={styles.matrix}>
      <div className={styles.toolbar}>
        {/* The wrapper carries the width, not the field: `Input` passes its
            `className` down to the `<input>`, and its border is drawn one
            level up — set there, the box would still stay as wide as the
            toolbar. */}
        <div className={styles.search}>
          <Input
            variant="search"
            size="sm"
            placeholder={t("roles.searchPermissions")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label={t("roles.searchPermissions")}
          />
        </div>

        {/* The instructions sit before the table, not after it: whoever
            targets a checkbox for the first time has already read the
            sentence by then — below a table that scrolls on its own, it
            would practically never be in view. */}
        <p className={styles.hint}>{t("roles.cycleHint")}</p>

        <ul className={styles.legend}>
          <li>
            <span className={styles.swatch} data-granted>
              <Icon icon="lucide:check" width={11} />
            </span>
            {t("roles.allowed")}
          </li>
          <li>
            <span className={styles.swatch} />
            {t("roles.notAllowed")}
          </li>
        </ul>
      </div>

      {isPhone && roles.length > 1 && (
        <div className={styles.rolePicker} role="tablist">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              role="tab"
              aria-selected={role.id === focused?.id}
              className={styles.roleChip}
              onClick={() => setFocusId(role.id)}
            >
              <span
                className={styles.roleDot}
                style={{ background: roleColor(role.rank) }}
              />
              {role.name}
              {!role.manageable && (
                <Icon icon="lucide:lock" width={11} className={styles.lock} />
              )}
            </button>
          ))}
        </div>
      )}

      <div className={styles.card}>
        {roles.length === 0 ? (
          <p className={styles.noMatch}>{t("roles.allHidden")}</p>
        ) : visible.length === 0 ? (
          <p className={styles.noMatch}>{t("roles.noMatchingPermissions")}</p>
        ) : (
          <div className={styles.scroller}>
            <table
              className={styles.table}
              style={{ "--role-cols": columns.length } as React.CSSProperties}
            >
              <colgroup>
                <col className={styles.colPerm} />
                {columns.map((role) => (
                  <col key={role.id} className={styles.colRole} />
                ))}
              </colgroup>

              <thead>
                <tr>
                  <th scope="col" className={styles.corner}>
                    {t("roles.permission")}
                  </th>
                  {columns.map((role) => (
                    <th
                      key={role.id}
                      scope="col"
                      className={styles.roleHead}
                      title={role.name}
                    >
                      <span className={styles.roleHeadInner}>
                        <span
                          className={styles.roleDot}
                          style={{ background: roleColor(role.rank) }}
                        />
                        <span className={styles.roleName}>{role.name}</span>
                        {!role.manageable && (
                          <Icon
                            icon="lucide:lock"
                            width={11}
                            className={styles.lock}
                            aria-label={
                              role.system
                                ? t("roles.sharedLocked")
                                : t("roles.locked")
                            }
                          />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.id}>
                    <tr>
                      <th
                        scope="colgroup"
                        colSpan={columns.length + 1}
                        className={styles.groupHead}
                      >
                        <span className={styles.groupHeadText}>
                          {group.known
                            ? t(`roles.group.${group.known}`)
                            : group.fallback}
                        </span>
                      </th>
                    </tr>

                    {group.permissions.map((permission) => (
                      <tr key={permission.key} className={styles.row}>
                        <th scope="row" className={styles.permHead}>
                          <span className={styles.permDesc}>
                            {permission.desc}
                          </span>
                          <code className={styles.permKey}>
                            {permission.key}
                          </code>
                        </th>

                        {columns.map((role) => (
                          <Cell
                            key={role.id}
                            role={role}
                            permission={permission}
                            granted={role.grants.includes(permission.key)}
                            allowLocked={!canGrant.has(permission.key)}
                            changed={changed.has(
                              cellId(role.id, permission.key),
                            )}
                            saving={saving}
                            onChange={onChange}
                          />
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Appears with the first change and stays fixed below the table — the
          table scrolls within itself, so the bar is always in view.
          `output` is inherently a status message (`aria-live="polite"`):
          its appearance and every new count get announced without pulling
          focus out of the matrix. */}
      {changed.size > 0 && (
        <output className={styles.pending}>
          <Icon
            icon="lucide:pencil-line"
            width={15}
            className={styles.pendingIcon}
          />
          <span className={styles.pendingText}>
            {t("roles.unsavedCount", { count: changed.size })}
          </span>

          <Button variant="text" onClick={onDiscard} disabled={saving}>
            {t("actions.discard")}
          </Button>
          <Button
            variant="primary"
            icon={<Icon icon="lucide:check" width={15} />}
            onClick={onSave}
            disabled={saving}
          >
            {saving ? t("actions.saving") : t("actions.save")}
          </Button>
        </output>
      )}
    </div>
  );
}

// ─── Cell ───────────────────────────────────────────────────────────────────

function Cell({
  role,
  permission,
  granted,
  allowLocked,
  changed,
  saving,
  onChange,
}: {
  role: RoleView;
  permission: { key: string; desc: string };
  granted: boolean;
  allowLocked: boolean;
  /** Differs from the server's state and would be included on save. */
  changed: boolean;
  saving: boolean;
  onChange: (change: GrantChange) => void;
}) {
  const t = useTranslations();

  const state = granted ? t("roles.allowed") : t("roles.notAllowed");

  // Row and column are named in the table headers; both get read out
  // regardless. The name here still includes them because the switch can
  // also be navigated to individually.
  const name = `${permission.desc} — ${role.name}: ${state}`;

  if (!role.manageable) {
    return (
      <td
        className={styles.cell}
        data-granted={granted || undefined}
        data-locked
      >
        <span
          className={styles.mark}
          title={role.system ? t("roles.sharedLocked") : t("roles.locked")}
        >
          {granted && <Icon icon="lucide:check" width={13} />}
          <span className={styles.srOnly}>{name}</span>
        </span>
      </td>
    );
  }

  // Whoever doesn't hold a permission themselves can't pass it on. They can
  // still take it away — that never expands anyone's rights.
  const locked = allowLocked && !granted;

  return (
    <td
      className={styles.cell}
      data-granted={granted || undefined}
      data-changed={changed || undefined}
    >
      <button
        type="button"
        className={styles.mark}
        role="switch"
        aria-checked={granted}
        aria-label={changed ? `${name} — ${t("roles.unsaved")}` : name}
        title={locked ? t("roles.allowLocked") : state}
        disabled={saving || locked}
        onClick={() =>
          onChange({
            roleId: role.id,
            permission: permission.key,
            granted: !granted,
          })
        }
      >
        {granted && <Icon icon="lucide:check" width={13} />}
      </button>
    </td>
  );
}

// ─── Grouping ───────────────────────────────────────────────────────────────

/**
 * The first part of a key's name names the object it's about. A few of
 * these carry only a single permission (`user.manage`, `audit.view`) and
 * therefore don't get their own heading, but belong to the next-larger topic.
 */
const GROUP_OF: Record<string, string> = {
  issue: "issue",
  comment: "comment",
  label: "label",
  project: "project",
  member: "member",
  team: "team",
  role: "role",
  workspace: "workspace",
  config: "workspace",
  audit: "workspace",
  platform: "platform",
  user: "platform",
  tenant: "platform",
};

/** Order of the sections: the everyday ones first, administration last. */
const GROUP_ORDER = {
  issue: 0,
  comment: 1,
  label: 2,
  project: 3,
  member: 4,
  team: 5,
  role: 6,
  workspace: 7,
  platform: 8,
} as const;

type GroupId = keyof typeof GROUP_ORDER;

const isGroupId = (value: string): value is GroupId => value in GROUP_ORDER;

interface Group {
  id: string;
  /** Set when there's a translation for the section. */
  known: GroupId | null;
  /** Fallback name for a future object not yet known here. */
  fallback: string;
  permissions: { key: string; desc: string }[];
}

function groupPermissions(permissions: { key: string; desc: string }[]) {
  const byGroup = new Map<string, Group>();

  for (const permission of permissions) {
    const object = permission.key.split(".")[0];
    const id = GROUP_OF[object] ?? object;

    if (!byGroup.has(id)) {
      byGroup.set(id, {
        id,
        known: isGroupId(id) ? id : null,
        fallback: object.charAt(0).toUpperCase() + object.slice(1),
        permissions: [],
      });
    }
    byGroup.get(id)?.permissions.push(permission);
  }

  const rank = (group: Group) =>
    group.known === null ? 99 : GROUP_ORDER[group.known];

  return [...byGroup.values()].sort((a, b) => rank(a) - rank(b));
}
