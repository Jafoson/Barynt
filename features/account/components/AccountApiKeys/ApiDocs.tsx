"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/atoms/Badge/Badge";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import { CopyButton } from "@/components/ui/layout/CopyButton/CopyButton";
import styles from "./apiDocs.module.scss";
import {
  API_DOC_ERRORS,
  API_DOC_GROUPS,
  API_DOC_WEBHOOK_EVENTS,
  API_DOC_WEBHOOK_SIGNATURE,
  type ApiDocEndpoint,
  type ApiDocGroupId,
  type ApiDocParam,
  type HttpMethod,
} from "./apiDocsData";

type DocTab = ApiDocGroupId | "webhooks";

const METHOD_CLASS: Record<HttpMethod, string> = {
  GET: styles.methodGet,
  POST: styles.methodPost,
  PATCH: styles.methodPatch,
  DELETE: styles.methodDelete,
};

function ParamList({
  title,
  params,
}: {
  title: string;
  params: ApiDocParam[];
}) {
  const t = useTranslations();
  return (
    <div className={styles.section}>
      <span className={styles.sectionTitle}>{title}</span>
      <div className={styles.paramList}>
        {params.map((param) => (
          <div key={param.name} className={styles.paramRow}>
            <code className={styles.paramName}>{param.name}</code>
            <span className={styles.paramType}>{param.type}</span>
            {param.required && (
              <Badge mono={false} className={styles.chipRoomy}>
                {t("apiKeys.docsRequired")}
              </Badge>
            )}
            {param.desc && (
              <span className={styles.paramDesc}>{param.desc}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

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

function Endpoint({ endpoint }: { endpoint: ApiDocEndpoint }) {
  const t = useTranslations();
  return (
    <article className={styles.endpoint}>
      <header className={styles.endpointHead}>
        <span
          className={[styles.method, METHOD_CLASS[endpoint.method]].join(" ")}
        >
          {endpoint.method}
        </span>
        <code className={styles.path}>{endpoint.path}</code>
        <CopyButton
          value={endpoint.path}
          label={t("apiKeys.copyLabel")}
          copiedLabel={t("apiKeys.copiedLabel")}
          className={styles.pathCopy}
        />
        <span className={styles.scope}>
          {t("apiKeys.docsScopeLabel")}
          <Badge className={styles.chipRoomy}>{endpoint.scope}</Badge>
        </span>
      </header>

      <p className={styles.endpointDesc}>{endpoint.desc}</p>

      {endpoint.pathParams && (
        <ParamList
          title={t("apiKeys.docsPathParams")}
          params={endpoint.pathParams}
        />
      )}
      {endpoint.queryParams && (
        <ParamList
          title={t("apiKeys.docsQueryParams")}
          params={endpoint.queryParams}
        />
      )}
      {endpoint.bodyParams && (
        <ParamList
          title={t("apiKeys.docsBodyParams")}
          params={endpoint.bodyParams}
        />
      )}

      {endpoint.requestExample && (
        <div className={styles.section}>
          <span className={styles.sectionTitle}>
            {t("apiKeys.docsRequestExample")}
          </span>
          <CodeBlock code={endpoint.requestExample} />
        </div>
      )}

      <div className={styles.section}>
        <span className={styles.sectionTitle}>{t("apiKeys.docsResponse")}</span>
        <CodeBlock code={endpoint.response} />
      </div>
    </article>
  );
}

/**
 * Not a request/response endpoint — an outbound push. Documents the
 * signature instead of a path, and one example payload per event type
 * (`API_DOC_WEBHOOK_EVENTS`, `lib/webhooks/deliver.ts`).
 */
function WebhookDocs() {
  const t = useTranslations();
  return (
    <div className={styles.endpoints}>
      <article className={styles.endpoint}>
        <p className={styles.endpointDesc}>{t("apiKeys.docsWebhookDesc")}</p>

        <div className={styles.section}>
          <span className={styles.sectionTitle}>
            {t("apiKeys.docsSignature")}
          </span>
          <div className={styles.paramList}>
            {API_DOC_WEBHOOK_SIGNATURE.headers.map((header) => (
              <div key={header.name} className={styles.paramRow}>
                <code className={styles.paramName}>{header.name}</code>
                <span className={styles.paramDesc}>{header.desc}</span>
              </div>
            ))}
          </div>
          <CodeBlock code={API_DOC_WEBHOOK_SIGNATURE.formula} />
          <CodeBlock code={API_DOC_WEBHOOK_SIGNATURE.verify} />
        </div>
      </article>

      {API_DOC_WEBHOOK_EVENTS.map((event) => (
        <article key={event.event} className={styles.endpoint}>
          <header className={styles.endpointHead}>
            <code className={styles.path}>{event.event}</code>
          </header>
          <p className={styles.endpointDesc}>{event.desc}</p>
          <div className={styles.section}>
            <span className={styles.sectionTitle}>
              {t("apiKeys.docsPayloadExample")}
            </span>
            <CodeBlock code={event.payload} />
          </div>
        </article>
      ))}
    </div>
  );
}

/**
 * Reference for the public REST API (`app/api/v1`), grouped the same way
 * the routes themselves are — workspaces, projects, issues, comments,
 * labels.
 *
 * Endpoint text stays in English regardless of the UI locale, same
 * convention as GitHub/Stripe/Jira: the wire format is the actual
 * contract, only the surrounding chrome is translated. Content lives in
 * `apiDocsData.ts`, kept in sync by hand with the real route handlers.
 */
export function ApiDocs() {
  const t = useTranslations();
  const [tab, setTab] = useState<DocTab>("workspaces");

  const active = API_DOC_GROUPS.find((g) => g.id === tab);

  const errorMeaning: Record<number, string> = {
    401: t("apiKeys.docsErr401"),
    403: t("apiKeys.docsErr403"),
    404: t("apiKeys.docsErr404"),
    422: t("apiKeys.docsErr422"),
    429: t("apiKeys.docsErr429"),
  };

  return (
    <section className={styles.root}>
      <div className={styles.head}>
        <h2 className={styles.title}>{t("apiKeys.docsTitle")}</h2>
        <p className={styles.desc}>{t("apiKeys.docsDesc")}</p>
      </div>

      <SegmentedControl
        items={[
          { value: "workspaces", label: t("apiKeys.docsTabWorkspaces") },
          { value: "projects", label: t("apiKeys.docsTabProjects") },
          { value: "issues", label: t("apiKeys.docsTabIssues") },
          { value: "comments", label: t("apiKeys.docsTabComments") },
          { value: "labels", label: t("apiKeys.docsTabLabels") },
          { value: "members", label: t("apiKeys.docsTabMembers") },
          { value: "webhooks", label: t("apiKeys.docsTabWebhooks") },
        ]}
        value={tab}
        onChange={(value) => setTab(value as DocTab)}
      />

      {active ? (
        <div className={styles.endpoints}>
          {active.endpoints.map((endpoint) => (
            <Endpoint
              key={`${endpoint.method} ${endpoint.path}`}
              endpoint={endpoint}
            />
          ))}
        </div>
      ) : (
        <WebhookDocs />
      )}

      <div className={styles.errors}>
        <h3 className={styles.sectionTitle}>{t("apiKeys.docsErrorsTitle")}</h3>
        <p className={styles.desc}>{t("apiKeys.docsErrorsDesc")}</p>
        <div className={styles.errorTable}>
          <div className={styles.errorRow}>
            <span className={styles.errorHead}>
              {t("apiKeys.docsErrStatus")}
            </span>
            <span className={styles.errorHead}>{t("apiKeys.docsErrCode")}</span>
            <span className={styles.errorHead}>
              {t("apiKeys.docsErrMeaning")}
            </span>
          </div>
          {API_DOC_ERRORS.map((err) => (
            <div key={err.status} className={styles.errorRow}>
              <code>{err.status}</code>
              <code>{err.code ?? "—"}</code>
              <span>{errorMeaning[err.status]}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
