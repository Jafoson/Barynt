"use client";

import { Icon } from "@iconify/react";
import { useRouter } from "@/i18n/navigation";
import styles from "./notFoundPage.module.scss";

interface BackButtonProps {
  label: string;
}

/** Browser-history back — the only reason this one piece needs the client. */
export function BackButton({ label }: BackButtonProps) {
  const router = useRouter();

  return (
    <button
      type="button"
      className={styles.secondary}
      onClick={() => router.back()}
    >
      <Icon icon="lucide:arrow-left" width={16} />
      {label}
    </button>
  );
}
