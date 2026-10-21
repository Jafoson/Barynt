"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { pickShortcuts, type ShortcutKey } from "@/features/dashboard/widgets";
import styles from "../WidgetSettings/widgetSettings.module.scss";

/**
 * Which tiles the shortcuts widget shows, and in which order: the chosen
 * ones on top (movable), the rest below to switch on.
 */
export function ShortcutPicker({
  offered,
  chosen: stored,
  onChange,
}: {
  offered: { key: ShortcutKey; icon: string; default: boolean }[];
  chosen: ShortcutKey[] | undefined;
  onChange: (next: ShortcutKey[]) => void;
}) {
  const t = useTranslations("widgets");
  const chosen = pickShortcuts(offered, stored).map((item) => item.key);
  const rest = offered.filter((item) => !chosen.includes(item.key));
  const iconOf = (key: ShortcutKey) =>
    offered.find((item) => item.key === key)?.icon ?? "lucide:square";

  const move = (index: number, by: -1 | 1) => {
    const next = [...chosen];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    onChange(next);
  };

  return (
    <div className={styles.field}>
      <span className={styles.label}>{t("shortcutsPick")}</span>
      <ul className={styles.picker}>
        {chosen.map((key, index) => (
          <li key={key} className={styles.pick}>
            <Icon icon={iconOf(key)} width={16} className={styles.pickIcon} />
            <span className={styles.pickName}>{t(`shortcut_${key}`)}</span>
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:chevron-up" width={14} />}
              aria-label={t("moveEarlier")}
              disabled={index === 0}
              onClick={() => move(index, -1)}
            />
            <Button
              variant="ghost"
              size="sm"
              icon={<Icon icon="lucide:chevron-down" width={14} />}
              aria-label={t("moveLater")}
              disabled={index === chosen.length - 1}
              onClick={() => move(index, 1)}
            />
            <Switch
              checked
              onChange={() => onChange(chosen.filter((k) => k !== key))}
              label={t(`shortcut_${key}`)}
              labelHidden
            />
          </li>
        ))}
        {rest.length > 0 && (
          <li className={styles.pickHead}>{t("shortcutsHidden")}</li>
        )}
        {rest.map((item) => (
          <li key={item.key} className={styles.pick} data-off>
            <Icon icon={item.icon} width={16} className={styles.pickIcon} />
            <span className={styles.pickName}>{t(`shortcut_${item.key}`)}</span>
            <Switch
              checked={false}
              onChange={() => onChange([...chosen, item.key])}
              label={t(`shortcut_${item.key}`)}
              labelHidden
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
