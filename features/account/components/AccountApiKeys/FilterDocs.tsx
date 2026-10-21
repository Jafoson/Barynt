"use client";

import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/ui/layout/CopyButton/CopyButton";
import styles from "./filterDocs.module.scss";
import {
  FILTER_DOC_FIELDS,
  FILTER_DOC_FIRST_EXAMPLE,
  FILTER_DOC_GROUP_EXAMPLE,
  FILTER_DOC_GROUP_TEXT,
  FILTER_DOC_INTRO,
  FILTER_DOC_OPS,
  FILTER_DOC_PITFALLS,
  FILTER_DOC_RECIPES,
  FILTER_DOC_RULE_KEYS,
  FILTER_DOC_SPECIAL,
  FILTER_DOC_USAGE,
} from "./filterDocsData";

function Code({ code }: { code: string }) {
  const t = useTranslations();
  return (
    <div className={styles.code}>
      <pre>
        <code>{code}</code>
      </pre>
      <CopyButton
        value={code}
        label={t("apiKeys.copyLabel")}
        copiedLabel={t("apiKeys.copiedLabel")}
        className={styles.copy}
      />
    </div>
  );
}

function Card({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: string;
  children: React.ReactNode;
}) {
  return (
    <article className={styles.card}>
      <h3 className={styles.cardTitle}>{title}</h3>
      {lead && <p className={styles.lead}>{lead}</p>}
      {children}
    </article>
  );
}

/**
 * How a filter tree works (BARY-172) — for the REST docs' "Filter" tab and
 * the MCP docs alike, since `?filter=`, view bodies and the MCP tools all
 * take the same tree. Simple first (the idea, one example), the full
 * reference after (fields, operators, special values), then recipes.
 * Headings are translated; the content is English like the rest of the
 * docs (`filterDocsData.ts`).
 */
export function FilterDocs() {
  const t = useTranslations();
  return (
    <div className={styles.root}>
      <Card title={t("apiKeys.filterDocIdea")}>
        <div className={styles.split}>
          <div className={styles.prose}>
            {FILTER_DOC_INTRO.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
          <Code code={FILTER_DOC_FIRST_EXAMPLE} />
        </div>
        <div className={styles.split}>
          <p className={styles.prose}>{FILTER_DOC_GROUP_TEXT}</p>
          <Code code={FILTER_DOC_GROUP_EXAMPLE} />
        </div>
      </Card>

      <Card title={t("apiKeys.filterDocRule")}>
        <div className={styles.rows}>
          {FILTER_DOC_RULE_KEYS.map((key) => (
            <div key={key.name} className={styles.row}>
              <code className={styles.name}>{key.name}</code>
              <span className={styles.type}>{key.type}</span>
              <span className={styles.desc}>{key.desc}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title={t("apiKeys.filterDocFields")}
        lead={t("apiKeys.filterDocFieldsLead")}
      >
        <div className={styles.fields}>
          {FILTER_DOC_FIELDS.map((field) => (
            <div key={field.field} className={styles.field}>
              <code className={styles.name}>{field.field}</code>
              <span className={styles.ops}>
                {field.ops.map((op) => (
                  <code key={op} className={styles.op}>
                    {op}
                  </code>
                ))}
              </span>
              <span className={styles.desc}>
                {field.what}
                <small>{field.values}</small>
              </span>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t("apiKeys.filterDocOps")}>
        <div className={styles.rows}>
          {Object.entries(FILTER_DOC_OPS).map(([op, info]) => (
            <div key={op} className={styles.row}>
              <code className={styles.name}>{op}</code>
              <span className={styles.desc}>{info.means}</span>
              <code className={styles.type}>{info.value}</code>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t("apiKeys.filterDocSpecial")}>
        <div className={styles.rows}>
          {FILTER_DOC_SPECIAL.map((item) => (
            <div key={item.value} className={styles.row}>
              <code className={styles.name}>{item.value}</code>
              <span className={styles.desc}>{item.desc}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t("apiKeys.filterDocRecipes")}>
        <div className={styles.recipes}>
          {FILTER_DOC_RECIPES.map((recipe) => (
            <div key={recipe.title} className={styles.recipe}>
              <span className={styles.recipeTitle}>{recipe.title}</span>
              <Code code={recipe.code} />
            </div>
          ))}
        </div>
      </Card>

      <Card title={t("apiKeys.filterDocUsage")}>
        <div className={styles.rows}>
          {FILTER_DOC_USAGE.map((use) => (
            <div key={use.where} className={styles.usage}>
              <code className={styles.name}>{use.where}</code>
              <span className={styles.desc}>{use.how}</span>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t("apiKeys.filterDocPitfalls")}>
        <ul className={styles.pitfalls}>
          {FILTER_DOC_PITFALLS.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
