"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { CopyButton } from "@/components/ui/layout/CopyButton/CopyButton";
import styles from "./mcpDocs.module.scss";
import {
  MCP_CLIENT_GUIDES,
  MCP_TOOL_GROUPS,
  type McpClientId,
  type McpToolGroupId,
} from "./mcpDocsData";

function CodeBlock({ code }: { code: string }) {
  const t = useTranslations();
  return (
    <div className={styles.codeBlock}>
      <pre>
        <code>{code}</code>
      </pre>
      <CopyButton
        value={code}
        label={t("apiKeys.copyLabel")}
        copiedLabel={t("apiKeys.copiedLabel")}
        className={styles.codeCopy}
      />
    </div>
  );
}

/**
 * The two reference panels below the connection details (`AccountMcp.tsx`):
 * copy-paste client setup snippets, and the tool list every client sees via
 * `tools/list`. Split into its own component the same way `ApiDocs` is
 * split from `AccountApiKeys` — pure rendering over static data
 * (`mcpDocsData.ts`), no data fetching of its own.
 */
export function McpDocs({ mcpUrl }: { mcpUrl: string }) {
  const t = useTranslations();
  const [client, setClient] = useState<McpClientId>("claude-code");
  const [group, setGroup] = useState<McpToolGroupId>("workspaces");

  const guide = MCP_CLIENT_GUIDES.find((g) => g.id === client);
  const activeGroup = MCP_TOOL_GROUPS.find((g) => g.id === group);

  const introKey: Record<McpClientId, string> = {
    "claude-code": t("mcp.setupClaudeCodeIntro"),
    direct: t("mcp.setupDirectIntro"),
    desktop: t("mcp.setupDesktopIntro"),
  };

  return (
    <div className={styles.root}>
      <div className={styles.section}>
        <div className={styles.head}>
          <h2 className={styles.title}>{t("mcp.setupTitle")}</h2>
          <p className={styles.desc}>{t("mcp.setupDesc")}</p>
        </div>

        <SegmentedControl
          items={[
            { value: "claude-code", label: t("mcp.setupTabClaudeCode") },
            { value: "direct", label: t("mcp.setupTabDirect") },
            { value: "desktop", label: t("mcp.setupTabDesktop") },
          ]}
          value={client}
          onChange={(value) => setClient(value as McpClientId)}
        />

        {guide && (
          <>
            <p className={styles.guideIntro}>{introKey[client]}</p>
            <CodeBlock code={guide.snippet(mcpUrl)} />
          </>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.head}>
          <h2 className={styles.title}>{t("mcp.toolsTitle")}</h2>
          <p className={styles.desc}>{t("mcp.toolsDesc")}</p>
        </div>

        <SegmentedControl
          items={[
            { value: "workspaces", label: t("apiKeys.docsTabWorkspaces") },
            { value: "projects", label: t("apiKeys.docsTabProjects") },
            { value: "issues", label: t("apiKeys.docsTabIssues") },
            { value: "comments", label: t("apiKeys.docsTabComments") },
            { value: "labels", label: t("apiKeys.docsTabLabels") },
          ]}
          value={group}
          onChange={(value) => setGroup(value as McpToolGroupId)}
        />

        {activeGroup && (
          <div className={styles.toolGroups}>
            {activeGroup.tools.map((tool) => (
              <div key={tool.name} className={styles.toolRow}>
                <span className={styles.toolName}>{tool.name}</span>
                <span className={styles.toolScope}>
                  {t("apiKeys.docsScopeLabel")}{" "}
                  <Badge className={styles.chipRoomy}>{tool.scope}</Badge>
                </span>
                <span className={styles.toolDesc}>{tool.desc}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
