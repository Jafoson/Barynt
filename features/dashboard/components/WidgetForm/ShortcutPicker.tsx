"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Input } from "@/components/ui/atoms/Input/Input";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { ModalFooter } from "@/components/ui/layout/Modal/components/ModalFooter";
import { ModalHeader } from "@/components/ui/layout/Modal/components/ModalHeader";
import { Modal, ModalBody } from "@/components/ui/layout/Modal/Modal";
import {
  LINK_ICON_DEFAULT,
  LINK_ICONS,
  type LinkIcon,
  linkKey,
  normalizeLinkUrl,
  pickShortcuts,
  type ShortcutChoice,
  type ShortcutKey,
  type ShortcutLink,
} from "@/features/dashboard/widgets";
import { useModal } from "@/lib/context";
import { randomId } from "@/lib/utils/id";
import styles from "../WidgetSettings/widgetSettings.module.scss";

interface Tile {
  key: ShortcutChoice;
  icon: string;
  default: boolean;
  label: string;
  link?: ShortcutLink;
}

/**
 * Which tiles the shortcuts widget shows, and in which order: the chosen
 * ones on top (movable), the rest below to switch on. External links
 * (BARY-182) sit among them; they're added, edited and removed here rather
 * than switched off.
 */
export function ShortcutPicker({
  offered,
  chosen: stored,
  links = [],
  sheet,
  onChange,
}: {
  offered: { key: ShortcutKey; icon: string; default: boolean }[];
  chosen: ShortcutChoice[] | undefined;
  links: ShortcutLink[] | undefined;
  sheet: boolean;
  onChange: (next: {
    shortcuts: ShortcutChoice[];
    links: ShortcutLink[] | undefined;
  }) => void;
}) {
  const t = useTranslations("widgets");
  const { openModal } = useModal();
  const tiles: Tile[] = [
    ...offered.map((item) => ({
      ...item,
      label: t(`shortcut_${item.key}`),
    })),
    ...links.map((link) => ({
      key: linkKey(link.id),
      icon: link.icon ?? LINK_ICON_DEFAULT,
      default: true,
      label: link.label,
      link,
    })),
  ];
  const shown = pickShortcuts(tiles, stored);
  const chosen = shown.map((tile) => tile.key);
  const rest = tiles.filter((tile) => !tile.link && !chosen.includes(tile.key));

  const setChosen = (next: ShortcutChoice[]) =>
    onChange({ shortcuts: next, links: links.length ? links : undefined });

  const move = (index: number, by: -1 | 1) => {
    const next = [...chosen];
    const to = index + by;
    if (to < 0 || to >= next.length) return;
    [next[index], next[to]] = [next[to], next[index]];
    setChosen(next);
  };

  const saveLink = (link: ShortcutLink) => {
    const exists = links.some((l) => l.id === link.id);
    onChange({
      shortcuts: exists ? chosen : [...chosen, linkKey(link.id)],
      links: exists
        ? links.map((l) => (l.id === link.id ? link : l))
        : [...links, link],
    });
  };

  const removeLink = (id: string) => {
    const left = links.filter((l) => l.id !== id);
    onChange({
      shortcuts: chosen.filter((key) => key !== linkKey(id)),
      links: left.length ? left : undefined,
    });
  };

  const editLink = (link?: ShortcutLink) =>
    openModal(
      ({ close }) => (
        <LinkDialog
          link={link}
          sheet={sheet}
          onSave={(next) => {
            saveLink(next);
            close();
          }}
          onClose={close}
        />
      ),
      sheet ? { placement: "bottom" } : undefined,
    );

  return (
    <div className={styles.field}>
      <span className={styles.label}>{t("shortcutsPick")}</span>
      <ul className={styles.picker}>
        {shown.map((tile, index) => (
          <li key={tile.key} className={styles.pick}>
            <Icon icon={tile.icon} width={16} className={styles.pickIcon} />
            <span className={styles.pickName}>
              {tile.label}
              {tile.link && <span className={styles.pickExternal}>↗</span>}
            </span>
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
              disabled={index === shown.length - 1}
              onClick={() => move(index, 1)}
            />
            {tile.link ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Icon icon="lucide:pencil" width={14} />}
                  aria-label={t("linkEdit", { name: tile.label })}
                  onClick={() => editLink(tile.link)}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  icon={<Icon icon="lucide:trash-2" width={14} />}
                  aria-label={t("linkRemove", { name: tile.label })}
                  onClick={() => tile.link && removeLink(tile.link.id)}
                />
              </>
            ) : (
              <Switch
                checked
                onChange={() => setChosen(chosen.filter((k) => k !== tile.key))}
                label={tile.label}
                labelHidden
              />
            )}
          </li>
        ))}
        {rest.length > 0 && (
          <li className={styles.pickHead}>{t("shortcutsHidden")}</li>
        )}
        {rest.map((tile) => (
          <li key={tile.key} className={styles.pick} data-off>
            <Icon icon={tile.icon} width={16} className={styles.pickIcon} />
            <span className={styles.pickName}>{tile.label}</span>
            <Switch
              checked={false}
              onChange={() => setChosen([...chosen, tile.key])}
              label={tile.label}
              labelHidden
            />
          </li>
        ))}
      </ul>
      <Button
        variant="elevated"
        size="sm"
        icon={<Icon icon="lucide:plus" width={14} />}
        onClick={() => editLink()}
      >
        {t("linkAdd")}
      </Button>
    </div>
  );
}

/** Name, address and icon of one external link. */
function LinkDialog({
  link,
  sheet,
  onSave,
  onClose,
}: {
  link?: ShortcutLink;
  sheet: boolean;
  onSave: (link: ShortcutLink) => void;
  onClose: () => void;
}) {
  const t = useTranslations("widgets");
  const tc = useTranslations("actions");
  const [label, setLabel] = useState(link?.label ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [icon, setIcon] = useState<LinkIcon | undefined>(link?.icon);
  const [touched, setTouched] = useState(false);
  const normalized = normalizeLinkUrl(url);
  const valid = label.trim() !== "" && normalized !== null;

  const save = () => {
    setTouched(true);
    if (!valid || !normalized) return;
    onSave({
      id: link?.id ?? randomId(),
      label: label.trim().slice(0, 60),
      url: normalized,
      ...(icon && { icon }),
    });
  };

  return (
    <Modal width={480} variant={sheet ? "sheet" : "dialog"}>
      <ModalHeader
        title={link ? t("linkEditTitle") : t("linkAddTitle")}
        leading={<Icon icon="lucide:link" width={16} />}
        onClose={onClose}
      />
      <ModalBody>
        <form
          className={styles.linkForm}
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <Input
            label={t("linkName")}
            value={label}
            maxLength={60}
            placeholder={t("linkNamePlaceholder")}
            error={touched && !label.trim() ? t("linkNameMissing") : undefined}
            onChange={(e) => setLabel(e.target.value)}
          />
          <Input
            label={t("linkUrl")}
            value={url}
            inputMode="url"
            placeholder="https://"
            error={touched && !normalized ? t("linkUrlInvalid") : undefined}
            onChange={(e) => setUrl(e.target.value)}
          />
          <div className={styles.field}>
            <span className={styles.label}>{t("linkIcon")}</span>
            <div className={styles.linkIcons}>
              {LINK_ICONS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={styles.linkIcon}
                  data-active={icon === value || undefined}
                  aria-pressed={icon === value}
                  aria-label={value.split(":")[1]}
                  // A second click takes it off again: the plain link icon.
                  onClick={() => setIcon(icon === value ? undefined : value)}
                >
                  <Icon icon={value} width={18} />
                </button>
              ))}
            </div>
          </div>
          <button type="submit" hidden />
        </form>
      </ModalBody>
      <ModalFooter>
        <Button variant="elevated" onClick={onClose}>
          {tc("cancel")}
        </Button>
        <Button variant="primary" onClick={save}>
          {t("done")}
        </Button>
      </ModalFooter>
    </Modal>
  );
}
