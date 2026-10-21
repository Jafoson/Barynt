"use client";

import { useTranslations } from "next-intl";
import styles from "./docGuides.module.scss";
import { useDocText } from "./docText";
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
import { GuideCard, GuideCode, GuideRows, GuideSplit } from "./GuideParts";

/**
 * How a filter tree works (BARY-172) — one of the docs' "Basics", since
 * `?filter=`, view bodies and the MCP tools all take the same tree. Simple
 * first (the idea, one example), the full reference after (fields,
 * operators, special values), then recipes. Texts in both languages
 * (`filterDocsData.ts`); the JSON stays as it's sent.
 */
export function FilterDocs() {
  const t = useTranslations();
  const doc = useDocText();
  return (
    <div className={styles.root}>
      <GuideCard title={t("apiKeys.filterDocIdea")}>
        <GuideSplit lines={FILTER_DOC_INTRO} code={FILTER_DOC_FIRST_EXAMPLE} />
        <GuideSplit
          lines={[FILTER_DOC_GROUP_TEXT]}
          code={FILTER_DOC_GROUP_EXAMPLE}
        />
      </GuideCard>

      <GuideCard title={t("apiKeys.filterDocRule")}>
        <GuideRows rows={FILTER_DOC_RULE_KEYS} />
      </GuideCard>

      <GuideCard
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
                {doc(field.what)}
                <small>{doc(field.values)}</small>
              </span>
            </div>
          ))}
        </div>
      </GuideCard>

      <GuideCard title={t("apiKeys.filterDocOps")}>
        <GuideRows
          rows={Object.entries(FILTER_DOC_OPS).map(([op, info]) => ({
            name: op,
            desc: info.means,
            type: info.value,
          }))}
        />
      </GuideCard>

      <GuideCard title={t("apiKeys.filterDocSpecial")}>
        <GuideRows rows={FILTER_DOC_SPECIAL} />
      </GuideCard>

      <GuideCard title={t("apiKeys.filterDocRecipes")}>
        <div className={styles.recipes}>
          {FILTER_DOC_RECIPES.map((recipe) => (
            <div key={recipe.code} className={styles.recipe}>
              <span className={styles.recipeTitle}>{doc(recipe.title)}</span>
              <GuideCode code={recipe.code} />
            </div>
          ))}
        </div>
      </GuideCard>

      <GuideCard title={t("apiKeys.filterDocUsage")}>
        <GuideRows rows={FILTER_DOC_USAGE} />
      </GuideCard>

      <GuideCard title={t("apiKeys.filterDocPitfalls")}>
        <ul className={styles.pitfalls}>
          {FILTER_DOC_PITFALLS.map((line) => (
            <li key={doc(line)}>{doc(line)}</li>
          ))}
        </ul>
      </GuideCard>
    </div>
  );
}
