"use client";

import { useTranslations } from "next-intl";
import { CopyButton } from "@/components/ui/layout/CopyButton/CopyButton";
import styles from "./docGuides.module.scss";
import { type DocText, useDocText } from "./docText";

// The pieces every guide in the docs' "Basics" is made of (BARY-172): a
// card per step, code with a copy button, rows of name · meaning · type.

export function GuideCode({ code }: { code: string }) {
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

export function GuideCard({
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

export interface GuideRow {
  name: string;
  type?: string;
  desc: DocText;
}

export function GuideRows({ rows }: { rows: GuideRow[] }) {
  const doc = useDocText();
  return (
    <div className={styles.rows}>
      {rows.map((row) => (
        <div key={row.name} className={styles.row}>
          <code className={styles.name}>{row.name}</code>
          <span className={styles.desc}>{doc(row.desc)}</span>
          {row.type && <code className={styles.type}>{row.type}</code>}
        </div>
      ))}
    </div>
  );
}

/** Text beside its example; stacked on narrow screens. */
export function GuideSplit({
  lines,
  code,
}: {
  lines: DocText[];
  code: string;
}) {
  const doc = useDocText();
  return (
    <div className={styles.split}>
      <div className={styles.prose}>
        {lines.map((line) => (
          <p key={doc(line)}>{doc(line)}</p>
        ))}
      </div>
      <GuideCode code={code} />
    </div>
  );
}
