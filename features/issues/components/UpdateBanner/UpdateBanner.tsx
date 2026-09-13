"use client";

import styles from "./updateBanner.module.scss";

interface UpdateBannerProps {
  visible: boolean;
  label: string;
  refreshLabel: string;
  onRefresh: () => void;
}

/** Pure rendering — `useProjectUpdates` decides *when* this shows. */
export function UpdateBanner({
  visible,
  label,
  refreshLabel,
  onRefresh,
}: UpdateBannerProps) {
  if (!visible) return null;

  return (
    <output className={styles.banner}>
      <span>{label}</span>
      <button type="button" className={styles.refresh} onClick={onRefresh}>
        {refreshLabel}
      </button>
    </output>
  );
}
