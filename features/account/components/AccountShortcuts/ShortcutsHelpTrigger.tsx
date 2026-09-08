"use client";

import { useTranslations } from "next-intl";
import { useModal } from "@/lib/context";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import { ShortcutsHelpModal } from "./ShortcutsHelpModal";

/**
 * Mounted once in `AppShell`: "?" opens the shortcuts reference from
 * anywhere in the app — the same convention Linear and Jira both use.
 * Renders nothing itself; the modal it opens is the only visible effect.
 *
 * Spec is `"shift+?"`, not `"?"`: producing "?" on most layouts already
 * holds Shift, so `useShortcut`'s exact-modifier match requires it in the
 * spec too. The badge shown for it (`shortcutGroups`) stays plain `"?"` —
 * that's the character people actually look for, not the chord that types it.
 */
export function ShortcutsHelpTrigger() {
  const t = useTranslations();
  const { openModal } = useModal();

  useShortcut("shift+?", () => {
    openModal(({ close }) => <ShortcutsHelpModal close={close} />, {
      label: t("nav.shortcuts"),
    });
  });

  return null;
}
