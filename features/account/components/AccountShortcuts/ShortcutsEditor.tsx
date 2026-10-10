"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Shortcut } from "@/components/ui/atoms/Shortcut/Shortcut";
import { Switch } from "@/components/ui/atoms/Switch/Switch";
import { PageHeader } from "@/components/ui/layout/PageHeader/PageHeader";
import {
  SettingsBody,
  SettingsList,
  type SettingsRow,
} from "@/components/ui/layout/SettingsList/SettingsList";
import { useBehavior } from "../useBehavior";
import type { ShortcutGroup } from "./shortcutGroups";
import styles from "./shortcutsEditor.module.scss";

/** Rows whose keys are fixed: dialogs' Esc, the 1–9 jump, the editor's own keymap. */
const FIXED_IDS = new Set(["close-dialog", "goto-project-number", "link"]);

/** The editor binds its keys itself; the person can't have changed them. */
const NOT_BOUND_VIA_HOOK = new Set(["link"]);

const NAMED_KEYS: Record<string, string> = {
  Enter: "enter",
  Escape: "esc",
  Backspace: "backspace",
  Tab: "tab",
  ArrowUp: "up",
  ArrowDown: "down",
  ArrowLeft: "left",
  ArrowRight: "right",
};

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph"]);

/** `g+d` → prefix `g`; a plain `c` or `mod+k` has none. */
const sequencePrefix = (spec: string): string | null => {
  const match = /^([^+]+)\+([^+])$/.exec(spec);
  if (!match) return null;
  return ["mod", "shift", "alt"].includes(match[1].toLowerCase())
    ? null
    : match[1];
};

/** A key press, as the spec `useShortcut` reads. `null` for a bare modifier. */
function specFromEvent(event: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(event.key)) return null;
  const key =
    NAMED_KEYS[event.key] ??
    (event.key.length === 1 ? event.key.toLowerCase() : null);
  if (!key) return null;
  const parts: string[] = [];
  if (event.metaKey || event.ctrlKey) parts.push("mod");
  if (event.shiftKey) parts.push("shift");
  if (event.altKey) parts.push("alt");
  parts.push(key);
  return parts.join("+");
}

interface Props {
  groups: ShortcutGroup[];
  overrides: Record<string, string>;
  confirmDestructive: boolean;
}

/**
 * The shortcut reference, with the keys changeable in place.
 *
 * Overrides are stored by the shortcut's *default* keys (`useShortcut`
 * looks them up the same way), so no binding site needs to know about
 * them. A key that another shortcut already uses is refused here — the
 * second would simply never fire.
 */
export function ShortcutsEditor({
  groups,
  overrides,
  confirmDestructive,
}: Props) {
  const t = useTranslations();
  const [state, set] = useBehavior<"shortcutOverrides" | "confirmDestructive">({
    shortcutOverrides: overrides,
    confirmDestructive,
  });
  const [recording, setRecording] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const effective = (defaultSpec: string) =>
    state.shortcutOverrides[defaultSpec] ?? defaultSpec;

  // Every key already taken: each editable or fixed row's current keys.
  const takenBy = (spec: string, exceptDefault: string) => {
    for (const group of groups) {
      for (const row of group.rows) {
        for (const key of Array.isArray(row.keys) ? row.keys : [row.keys]) {
          if (key === exceptDefault) continue;
          if (effective(key).toLowerCase() === spec.toLowerCase()) return true;
        }
      }
    }
    return false;
  };

  // Listens only while a key is being picked. The handler reads the current
  // state through a ref, so the listener itself attaches once per recording.
  const onKeyRef = useRef<(event: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    onKeyRef.current = (event) => {
      if (!recording) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(null);
        setMessage(null);
        return;
      }
      const spec = specFromEvent(event);
      if (!spec) return;

      // A sequence keeps its prefix; only the second key is chosen.
      const prefix = sequencePrefix(recording);
      const next = prefix
        ? spec.length === 1
          ? `${prefix}+${spec}`
          : null
        : spec;
      if (!next) return;

      if (takenBy(next, recording)) {
        setMessage(t("behavior.shortcutTaken"));
        return;
      }

      const map = { ...state.shortcutOverrides };
      if (next.toLowerCase() === recording.toLowerCase()) delete map[recording];
      else map[recording] = next;
      set({ shortcutOverrides: map });
      setRecording(null);
      setMessage(null);
    };
  });

  const isRecording = recording !== null;
  useEffect(() => {
    if (!isRecording) return;
    const onKey = (event: KeyboardEvent) => onKeyRef.current(event);
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [isRecording]);

  const rowControl = (id: string, keys: string | string[]) => {
    const editable = typeof keys === "string" && !FIXED_IDS.has(id);
    if (!editable) {
      return (
        <Shortcut
          keys={keys}
          raw={NOT_BOUND_VIA_HOOK.has(id) ? true : undefined}
        />
      );
    }
    const defaultSpec = keys as string;
    const changed = defaultSpec in state.shortcutOverrides;
    const isThisRecording = recording === defaultSpec;
    return (
      <span className={styles.control}>
        <button
          type="button"
          className={styles.key}
          data-recording={isThisRecording || undefined}
          aria-label={t("behavior.shortcutsCustomizeTitle")}
          onClick={() => {
            setMessage(null);
            setRecording(isThisRecording ? null : defaultSpec);
          }}
          onBlur={() => {
            if (isThisRecording) setRecording(null);
          }}
        >
          {isThisRecording ? (
            <span className={styles.press}>{t("behavior.shortcutPress")}</span>
          ) : (
            <Shortcut keys={effective(defaultSpec)} raw />
          )}
        </button>
        {changed && !isThisRecording && (
          <Button
            variant="ghost"
            size="sm"
            icon={<Icon icon="lucide:rotate-ccw" width={14} />}
            title={t("behavior.shortcutReset")}
            aria-label={t("behavior.shortcutReset")}
            onClick={() => {
              const map = { ...state.shortcutOverrides };
              delete map[defaultSpec];
              set({ shortcutOverrides: map });
            }}
          />
        )}
      </span>
    );
  };

  const input: SettingsRow[] = [
    {
      id: "confirmDestructive",
      label: t("behavior.confirmDestructive"),
      desc: t("behavior.confirmDestructiveDesc"),
      control: (
        <Switch
          checked={state.confirmDestructive}
          onChange={(checked) => set({ confirmDestructive: checked })}
          label={t("behavior.confirmDestructive")}
          labelHidden
        />
      ),
    },
  ];

  const hasOverrides = Object.keys(state.shortcutOverrides).length > 0;

  return (
    <>
      <PageHeader
        divider={false}
        title={t("nav.shortcuts")}
        description={t("account.shortcutsDesc")}
        actions={
          hasOverrides ? (
            <Button
              variant="text"
              onClick={() => set({ shortcutOverrides: {} })}
            >
              {t("behavior.shortcutResetAll")}
            </Button>
          ) : undefined
        }
      />

      <SettingsBody>
        <SettingsList title={t("behavior.inputTitle")} rows={input} />

        <p className={styles.hint} aria-live="polite">
          <Icon icon="lucide:keyboard" width={14} />
          {message ?? t("behavior.shortcutsCustomizeDesc")}
        </p>

        {groups.map((group) => (
          <SettingsList
            key={group.title}
            title={group.title}
            rows={group.rows.map((row) => ({
              id: row.id,
              label: row.label,
              desc: row.desc,
              control: rowControl(row.id, row.keys),
            }))}
          />
        ))}
      </SettingsBody>
    </>
  );
}
