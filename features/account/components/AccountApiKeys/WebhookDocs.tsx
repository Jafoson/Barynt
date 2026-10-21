"use client";

import { useTranslations } from "next-intl";
import {
  API_DOC_WEBHOOK_EVENTS,
  API_DOC_WEBHOOK_SIGNATURE,
} from "./apiDocsData";
import styles from "./docGuides.module.scss";
import { useDocText } from "./docText";
import { GuideCard, GuideCode, GuideRows } from "./GuideParts";

/**
 * Webhooks, one of the docs' "Basics" (BARY-172) — not an endpoint you
 * call but an outbound push, so it sits with the guides rather than among
 * the endpoint tabs. What they are, how to check the signature, and one
 * example payload per event (`API_DOC_WEBHOOK_EVENTS`,
 * `lib/webhooks/deliver.ts`).
 */
export function WebhookDocs() {
  const t = useTranslations();
  const doc = useDocText();
  return (
    <div className={styles.root}>
      <p className={styles.footnote}>{t("apiKeys.docsWebhookDesc")}</p>

      <GuideCard title={t("apiKeys.docsSignature")}>
        <GuideRows
          rows={API_DOC_WEBHOOK_SIGNATURE.headers.map((header) => ({
            name: header.name,
            desc: header.desc,
          }))}
        />
        <GuideCode code={API_DOC_WEBHOOK_SIGNATURE.formula} />
        <GuideCode code={API_DOC_WEBHOOK_SIGNATURE.verify} />
      </GuideCard>

      <GuideCard title={t("apiKeys.guideWebhooksEvents")}>
        <div className={styles.events}>
          {API_DOC_WEBHOOK_EVENTS.map((event) => (
            <div key={event.event} className={styles.event}>
              <code className={styles.name}>{event.event}</code>
              <span className={styles.desc}>{doc(event.desc)}</span>
              <GuideCode code={event.payload} />
            </div>
          ))}
        </div>
      </GuideCard>
    </div>
  );
}
