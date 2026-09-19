"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "next/navigation";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { Button } from "@/components/ui/atoms/Button/Button";
import { CopyField } from "@/components/ui/atoms/CopyField/CopyField";
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
import type { ApiScope } from "@/lib/api/scopes";
import { appUrl } from "@/lib/app-url";
import { useModal } from "@/lib/context";
import { PHONE_QUERY, useMediaQuery } from "@/lib/utils/useMediaQuery";
import { useTimeAgo } from "@/lib/utils/useTimeAgo";
import { ApiDocs } from "./ApiDocs";
import styles from "./accountApiKeys.module.scss";
import { type NewApiKeyInput, NewApiKeyModal } from "./NewApiKeyModal";

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

  const { openModal } = useModal();
  const isPhone = useMediaQuery(PHONE_QUERY);
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
    "members:read": t("apiKeys.descMembersRead"),
  };

  const activeCount = keys.filter((key) => !key.revokedAt).length;
  const revokedCount = keys.length - activeCount;

  const createKey = async ({ name, scopes, expiresAt }: NewApiKeyInput) => {
    const result = await createApiKey({ name, scopes, expiresAt });
    if ("error" in result) return result.error;
    setError("");
    setCreatedToken(result.token);
    router.refresh();
    return null;
  };

  // A dialog from a tablet up, a bottom sheet on a phone.
  const openNewKey = () =>
    openModal(
      ({ close }) => (
        <NewApiKeyModal
          close={close}
          sheet={isPhone}
          scopeDesc={scopeDesc}
          onCreate={createKey}
        />
      ),
      {
        ...(isPhone ? { placement: "bottom" as const } : {}),
        label: t("apiKeys.newKey"),
      },
    );

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
          !createdToken && (
            <Button
              variant="primary"
              icon={<Icon icon="lucide:plus" width={15} />}
              onClick={openNewKey}
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

        {rows.length > 0 ? (
          <SettingsList
            rows={rows}
            columns={columns}
            label={t("apiKeys.title")}
          />
        ) : (
          <p className={styles.empty}>{t("apiKeys.empty")}</p>
        )}

        <SettingsList title={t("apiKeys.accessTitle")} rows={accessRows} />

        <ApiDocs />
      </SettingsBody>
    </>
  );
}
