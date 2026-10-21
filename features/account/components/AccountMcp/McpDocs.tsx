"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { CopyButton } from "@/components/ui/layout/CopyButton/CopyButton";
import { DocGuides } from "../AccountApiKeys/DocGuides";
import { useDocText } from "../AccountApiKeys/docText";
import styles from "./mcpDocs.module.scss";
import {
  MCP_CLIENT_GUIDES,
  MCP_OAUTH_STEPS,
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
 * The reference below the connection details (`AccountMcp.tsx`): how to
 * connect each common AI app (OAuth first, a key as the fallback), what
 * happens when one signs in, and the tool list every client sees via
 * `tools/list`. Split into its own component the same way `ApiDocs` is
 * split from `AccountApiKeys` — pure rendering over static data
 * (`mcpDocsData.ts`), no data fetching of its own.
 */
export function McpDocs({ mcpUrl }: { mcpUrl: string }) {
  const t = useTranslations();
  const doc = useDocText();
  const [client, setClient] = useState<McpClientId>("claude");
  const [group, setGroup] = useState<McpToolGroupId>("workspaces");

  const guide = MCP_CLIENT_GUIDES.find((g) => g.id === client);
  const activeGroup = MCP_TOOL_GROUPS.find((g) => g.id === group);

  return (
    <div className={styles.root}>
      {/* Connecting an AI app: OAuth first (only the URL), a key as the
          fallback — one tab per common app (BARY-172). */}
      <div className={styles.section}>
        <div className={styles.head}>
          <h2 className={styles.title}>{t("mcp.setupTitle")}</h2>
          <p className={styles.desc}>{t("mcp.setupDesc")}</p>
        </div>

        <SegmentedControl
          items={MCP_CLIENT_GUIDES.map((g) => ({
            value: g.id,
            label: doc(g.label),
          }))}
          value={client}
          onChange={(value) => setClient(value as McpClientId)}
        />

        {guide && (
          <>
            <ol className={styles.steps}>
              {guide.steps.map((step) => (
                <li key={doc(step.text)}>
                  <span>{doc(step.text)}</span>
                  {step.code && <CodeBlock code={step.code(mcpUrl)} />}
                </li>
              ))}
            </ol>
            {guide.note && <p className={styles.note}>{doc(guide.note)}</p>}
          </>
        )}
      </div>

      <div className={styles.section}>
        <div className={styles.head}>
          <h2 className={styles.title}>{t("mcp.oauthTitle")}</h2>
          <p className={styles.desc}>{t("mcp.oauthDesc")}</p>
        </div>
        <ol className={styles.steps}>
          {MCP_OAUTH_STEPS.map((step) => (
            <li key={doc(step)}>
              <span>{doc(step)}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className={styles.section}>
        <div className={styles.head}>
          <h2 className={styles.title}>{t("mcp.toolsTitle")}</h2>
          <p className={styles.desc}>{t("mcp.toolsDesc")}</p>
        </div>

        {/* What applies across tools — the tabs below group the tools. */}
        <DocGuides guides={["filter"]} />

        <SegmentedControl
          items={[
            { value: "workspaces", label: t("apiKeys.docsTabWorkspaces") },
            { value: "projects", label: t("apiKeys.docsTabProjects") },
            { value: "issues", label: t("apiKeys.docsTabIssues") },
            { value: "comments", label: t("apiKeys.docsTabComments") },
            { value: "labels", label: t("apiKeys.docsTabLabels") },
            { value: "members", label: t("apiKeys.docsTabMembers") },
            { value: "views", label: t("apiKeys.docsTabViews") },
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
                <span className={styles.toolDesc}>{doc(tool.desc)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
