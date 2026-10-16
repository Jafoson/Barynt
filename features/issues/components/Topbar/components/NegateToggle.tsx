"use client";

import { useTranslations } from "next-intl";
import { SegmentedControl } from "@/components/ui/atoms/SegmentedControl/SegmentedControl";
import styles from "../topbar.module.scss";

/** "is / is not" at the top of a filter chip's dropdown (BARY-166). */
export function NegateToggle({
  negated,
  onChange,
}: {
  negated: boolean;
  onChange: (negated: boolean) => void;
}) {
  const t = useTranslations();
  return (
    <div className={styles.negate}>
      <SegmentedControl
        variant="surface"
        value={negated ? "not" : "is"}
        onChange={(v) => onChange(v === "not")}
        items={[
          { value: "is", label: t("filters.is") },
          { value: "not", label: t("filters.isNot") },
        ]}
      />
    </div>
  );
}
