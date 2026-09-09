"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/ui/layout/CopyButton/CopyButton";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import {
  SettingsBody,
  SettingsList,
  type SettingsRow,
} from "@/components/ui/layout/SettingsList/SettingsList";
import { Link } from "@/i18n/navigation";
import { appUrl } from "@/lib/app-url";
import styles from "./accountMcp.module.scss";
import { McpDocs } from "./McpDocs";

interface Props {
  /** Path to the API keys page — the route knows the workspace, this
   *  component doesn't. Same convention as `AccountSecurity`'s
   *  `connectionsHref`. */
  apiKeysHref: string;
}

/**
 * How to connect an AI assistant to this workspace over MCP
 * (`app/api/mcp`) — the remote-tools counterpart to `AccountApiKeys`.
 *
 * Pure documentation, no data of its own to manage: unlike API keys there's
 * nothing here to create or revoke — a key made on the API keys page is
 * reused as-is (`lib/mcp/auth.ts` authenticates MCP requests exactly like
 * REST ones), so this page only explains the endpoint and links there for
 * the actual key.
 */
export function AccountMcp({ apiKeysHref }: Props) {
  const t = useTranslations();
  const mcpUrl = appUrl("/api/mcp");

  const connectionRows: SettingsRow[] = [
    {
      id: "server-url",
      label: t("mcp.serverUrlLabel"),
      desc: t("mcp.serverUrlDesc"),
      control: (
        <span className={styles.accessValue}>
          <code>{mcpUrl}</code>
          <CopyButton
            value={mcpUrl}
            label={t("apiKeys.copyLabel")}
            copiedLabel={t("apiKeys.copiedLabel")}
          />
        </span>
      ),
    },
    {
      id: "auth",
      label: t("mcp.authLabel"),
      desc: t("mcp.authDesc"),
      control: (
        <Link href={apiKeysHref} className={styles.link}>
          {t("mcp.manageKeys")}
          <Icon icon="lucide:arrow-right" width={14} />
        </Link>
      ),
    },
    {
      id: "transport",
      label: t("mcp.transportLabel"),
      control: (
        <span className={styles.accessValue}>
          <code>{t("mcp.transportValue")}</code>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        divider={false}
        title={t("mcp.title")}
        description={t("mcp.headerSummary")}
      />

      <SettingsBody>
        <SettingsList title={t("mcp.connectionTitle")} rows={connectionRows} />
        <McpDocs mcpUrl={mcpUrl} />
      </SettingsBody>
    </>
  );
}
