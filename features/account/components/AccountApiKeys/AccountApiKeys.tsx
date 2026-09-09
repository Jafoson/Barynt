"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { CopyField } from "@/components/ui/atoms/CopyField/CopyField";
import { InlinePicker } from "@/components/ui/atoms/InlinePicker/InlinePicker";
import { Input } from "@/components/ui/atoms/Input/Input";
import { SelectMenu } from "@/components/ui/atoms/SelectMenu/SelectMenu";
import { useConfirm } from "@/components/ui/layout/ConfirmDialog/ConfirmDialog";
import { CopyButton } from "@/components/ui/layout/CopyButton/CopyButton";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import {
  SettingsBody,
  type SettingsColumn,
  SettingsList,
  type SettingsRow,
} from "@/components/ui/layout/SettingsList/SettingsList";
import { createApiKey, revokeApiKey } from "@/features/account/actions";
import type { ApiKeysView } from "@/features/account/types";
import { API_SCOPES, type ApiScope } from "@/lib/api/scopes";
import { appUrl } from "@/lib/app-url";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import { ApiDocs } from "./ApiDocs";
import styles from "./accountApiKeys.module.scss";

type ExpiryChoice = "never" | "30" | "60" | "90";

/**
 * Personal access tokens for the public REST API (`app/api/v1`).
 *
 * Jira-style granular scopes, not a blanket read/write toggle: a key picks
 * exactly the "resource:action" pairs it needs (`API_SCOPES`,
 * `lib/api/scopes.ts`). Either way it stays a *user access token* — the
 * picker only narrows what the owning user can already do, it grants
 * nothing beyond that (RBAC still decides per request, `lib/api-auth.ts`).
 *
 * The raw token only ever exists client-side for the moment right after
 * creation (`createdToken`) — everything else, including the list itself,
 * comes fresh from the server via `router.refresh()` after every change,
 * same as `WorkspaceMembers`. There's nothing to mirror locally. Revoked
 * keys stay in the list (shown as such) rather than disappearing — a
 * record of what used to have access, not just what still does.
 */
export function AccountApiKeys({ keys }: ApiKeysView) {
  const t = useTranslations();
  const format = useFormatter();
  const timeAgo = useTimeAgo();
  const router = useRouter();
  const confirm = useConfirm();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<Set<ApiScope>>(new Set());
  const [expiry, setExpiry] = useState<ExpiryChoice>("90");
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  // next-intl's `t()` needs a literal key — it can't resolve one built from
  // a variable — so every scope description is looked up here once,
  // through literal calls, instead of dynamically per scope.
  const scopeDesc: Record<ApiScope, string> = {
    "issues:read": t("apiKeys.descIssuesRead"),
    "issues:write": t("apiKeys.descIssuesWrite"),
    "comments:read": t("apiKeys.descCommentsRead"),
    "comments:write": t("apiKeys.descCommentsWrite"),
    "labels:read": t("apiKeys.descLabelsRead"),
    "labels:write": t("apiKeys.descLabelsWrite"),
    "projects:read": t("apiKeys.descProjectsRead"),
    "projects:write": t("apiKeys.descProjectsWrite"),
    "workspaces:read": t("apiKeys.descWorkspacesRead"),
    "workspaces:write": t("apiKeys.descWorkspacesWrite"),
  };

  const activeCount = keys.filter((key) => !key.revokedAt).length;
  const revokedCount = keys.length - activeCount;

  const toggleScope = (scope: ApiScope, checked: boolean) => {
    setScopes((prev) => {
      const next = new Set(prev);
      if (checked) next.add(scope);
      else next.delete(scope);
      return next;
    });
  };

  const resetForm = () => {
    setName("");
    setScopes(new Set());
    setExpiry("90");
  };

  const create = () => {
    const trimmed = name.trim();
    if (!trimmed || scopes.size === 0 || isPending) return;
    startTransition(async () => {
      const expiresAt =
        expiry === "never"
          ? undefined
          : new Date(Date.now() + Number(expiry) * 24 * 60 * 60 * 1000);

      const result = await createApiKey({
        name: trimmed,
        scopes: [...scopes],
        expiresAt,
      });
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError("");
      setCreatedToken(result.token);
      setFormOpen(false);
      resetForm();
      router.refresh();
    });
  };

  const revoke = async (id: string, keyName: string) => {
    const ok = await confirm({
      title: t("apiKeys.revokeTitle", { name: keyName }),
      description: t("apiKeys.revokeDesc"),
      confirmLabel: t("apiKeys.revoke"),
      cancelLabel: t("actions.cancel"),
      danger: true,
    });
    if (!ok) return;

    startTransition(async () => {
      const result = await revokeApiKey(id);
      if ("error" in result) {
        setError(result.error);
        return;
      }
      setError("");
      router.refresh();
    });
  };

  const columns: SettingsColumn[] = [
    { id: "prefix", header: t("apiKeys.colPrefix"), width: "170px" },
    { id: "lastUsed", header: t("apiKeys.colLastUsed"), width: "130px" },
    { id: "status", header: t("apiKeys.colStatus"), width: "100px" },
    { id: "actions", header: "", width: "40px" },
  ];

  const rows: SettingsRow[] = keys.map((key) => ({
    id: key.id,
    label: key.name,
    desc: (
      <span className={styles.keyMeta}>
        <span>
          {t("apiKeys.createdOn", {
            date: format.dateTime(key.createdAt, { dateStyle: "medium" }),
          })}
        </span>
        <span className={styles.keyScopes}>
          {key.scopes.map((scope) => (
            <Badge key={scope} className={styles.scopeChip}>
              {scope}
            </Badge>
          ))}
        </span>
      </span>
    ),
    cells: {
      prefix: (
        <span className={styles.prefixCell}>
          <code>{key.prefix}…</code>
          <CopyButton
            value={key.prefix}
            label={t("apiKeys.copyLabel")}
            copiedLabel={t("apiKeys.copiedLabel")}
          />
        </span>
      ),
      lastUsed: key.lastUsedAt
        ? timeAgo(key.lastUsedAt.getTime())
        : t("apiKeys.neverUsed"),
      status: (
        <Badge
          mono={false}
          className={key.revokedAt ? styles.scopeChip : styles.statusActiveChip}
        >
          {key.revokedAt
            ? t("apiKeys.statusRevoked")
            : t("apiKeys.statusActive")}
        </Badge>
      ),
      actions: (
        <Button
          variant="text"
          size="sm"
          icon={<Icon icon="lucide:trash-2" width={14} />}
          aria-label={t("apiKeys.revoke")}
          disabled={isPending || !!key.revokedAt}
          onClick={() => revoke(key.id, key.name)}
        />
      ),
    },
  }));

  const baseUrl = appUrl("/api/v1");

  const accessRows: SettingsRow[] = [
    {
      id: "base-url",
      label: t("apiKeys.baseUrlLabel"),
      desc: t("apiKeys.baseUrlDesc"),
      control: (
        <span className={styles.accessValue}>
          <code>{baseUrl}</code>
          <CopyButton
            value={baseUrl}
            label={t("apiKeys.copyLabel")}
            copiedLabel={t("apiKeys.copiedLabel")}
          />
        </span>
      ),
    },
    {
      id: "auth-header",
      label: t("apiKeys.authHeaderLabel"),
      desc: t("apiKeys.authHeaderDesc"),
      control: (
        <code className={styles.accessValue}>
          Authorization: Bearer &lt;key&gt;
        </code>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        divider={false}
        title={t("apiKeys.title")}
        description={t("apiKeys.headerSummary", {
          active: activeCount,
          revoked: revokedCount,
        })}
        actions={
          !formOpen &&
          !createdToken && (
            <Button
              variant="primary"
              icon={<Icon icon="lucide:plus" width={15} />}
              onClick={() => setFormOpen(true)}
            >
              {t("apiKeys.newKey")}
            </Button>
          )
        }
      />

      <SettingsBody>
        {error && (
          <p className={styles.error} role="alert">
            <Icon icon="lucide:circle-alert" width={14} />
            {error}
          </p>
        )}

        {createdToken && (
          <div className={styles.reveal}>
            <p className={styles.revealTitle}>{t("apiKeys.createdTitle")}</p>
            <p className={styles.revealDesc}>{t("apiKeys.createdDesc")}</p>
            <CopyField
              value={createdToken}
              copyLabel={t("apiKeys.copyLabel")}
              copiedLabel={t("apiKeys.copiedLabel")}
            />
            <div className={styles.actions}>
              <Button variant="text" onClick={() => setCreatedToken(null)}>
                {t("actions.close")}
              </Button>
            </div>
          </div>
        )}

        {!createdToken && formOpen && (
          <div className={styles.form}>
            <div className={styles.formTop}>
              <Input
                label={t("fields.name")}
                placeholder={t("apiKeys.namePlaceholder")}
                value={name}
                disabled={isPending}
                onChange={(e) => setName(e.target.value)}
              />
              <div className={styles.field}>
                <span className={styles.fieldLabel}>
                  {t("apiKeys.expiryFieldLabel")}
                </span>
                <InlinePicker
                  trigger={
                    <button type="button" className={styles.expiryTrigger}>
                      {expiry === "never"
                        ? t("apiKeys.expiryNever")
                        : t("apiKeys.expiresInDays", { count: Number(expiry) })}
                      <Icon icon="lucide:chevron-down" width={14} />
                    </button>
                  }
                  width={200}
                  stop
                >
                  {(close) => (
                    <SelectMenu
                      items={[
                        { value: "never", label: t("apiKeys.expiryNever") },
                        {
                          value: "30",
                          label: t("apiKeys.expiresInDays", { count: 30 }),
                        },
                        {
                          value: "60",
                          label: t("apiKeys.expiresInDays", { count: 60 }),
                        },
                        {
                          value: "90",
                          label: t("apiKeys.expiresInDays", { count: 90 }),
                        },
                      ]}
                      value={expiry}
                      onPick={(value) => {
                        setExpiry(value as ExpiryChoice);
                        close();
                      }}
                      onClose={close}
                    />
                  )}
                </InlinePicker>
              </div>
            </div>

            <div className={styles.scopeSection}>
              <span className={styles.fieldLabel}>
                {t("apiKeys.scopesLabel")}
              </span>
              <div className={styles.scopeCards}>
                {API_SCOPES.map((scope) => (
                  <label
                    key={scope}
                    className={styles.scopeCard}
                    data-checked={scopes.has(scope) || undefined}
                  >
                    <input
                      type="checkbox"
                      checked={scopes.has(scope)}
                      disabled={isPending}
                      onChange={(e) => toggleScope(scope, e.target.checked)}
                    />
                    <span className={styles.scopeCardText}>
                      <code>{scope}</code>
                      <span>{scopeDesc[scope]}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div className={styles.actions}>
              <Button
                variant="text"
                disabled={isPending}
                onClick={() => {
                  setFormOpen(false);
                  resetForm();
                }}
              >
                {t("actions.cancel")}
              </Button>
              <Button
                variant="primary"
                disabled={!name.trim() || scopes.size === 0 || isPending}
                onClick={create}
              >
                {t("apiKeys.create")}
              </Button>
            </div>
          </div>
        )}

        {rows.length > 0 ? (
          <SettingsList
            rows={rows}
            columns={columns}
            label={t("apiKeys.title")}
          />
        ) : (
          !formOpen && <p className={styles.empty}>{t("apiKeys.empty")}</p>
        )}

        <SettingsList title={t("apiKeys.accessTitle")} rows={accessRows} />

        <ApiDocs />
      </SettingsBody>
    </>
  );
}
