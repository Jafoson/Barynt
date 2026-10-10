"use client";

import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Input } from "@/components/ui/atoms/Input/Input";
import { FIELD_LIMITS } from "@/lib/custom-fields";
import styles from "./addValue.module.scss";

interface Props {
  onAdd: (label: string) => void;
}

/**
 * The line at the bottom of a choice list of a field that allows its own
 * values: type a value, press Enter. Whether it already exists is the
 * server's call — it reuses a choice with the same name.
 */
export function AddValue({ onAdd }: Props) {
  const t = useTranslations();
  const [text, setText] = useState("");
  const label = text.trim();

  const submit = () => {
    if (!label) return;
    onAdd(label);
    setText("");
  };

  return (
    <div className={styles.row}>
      <Input
        size="sm"
        value={text}
        maxLength={FIELD_LIMITS.optionLabel}
        placeholder={t("customFields.addValue")}
        aria-label={t("customFields.addValue")}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
      />
      <Button
        variant="ghost"
        size="sm"
        type="button"
        disabled={!label}
        onClick={submit}
      >
        {t("customFields.addValueAction")}
      </Button>
    </div>
  );
}
