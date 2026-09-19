"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/atoms/Button/Button";
import { Tooltip } from "@/components/ui/atoms/Tooltip/Tooltip";
import type { IssueComposerData } from "@/features/issues/types";
import { useHasOpenModal } from "@/lib/context";
import { useShortcut } from "@/lib/shortcuts/useShortcut";
import styles from "./newIssueButton.module.scss";
import { useNewIssueOpener } from "./useNewIssueOpener";

interface NewIssueButtonProps {
  data: IssueComposerData;
}

/**
 * Opens the `CreateIssueModal`. The data comes as props from the server
 * component above — only the route-dependent project choice stays in
 * `useNewIssueOpener`, because it needs `usePathname()`.
 *
 * Without `issue.create` in any project, the button doesn't exist. It
 * would otherwise be an invitation into a dialog that ends up rejected —
 * the action re-checks this itself anyway. The same gate applies to the
 * "c" shortcut: `useShortcut` is still called unconditionally (Rules of
 * Hooks), just disabled via `enabled` instead of skipped.
 *
 * "c" (no modifier) is the convention Linear and GitHub both use for "new
 * issue" — safe precisely because it's a bare letter: it only fires outside
 * text inputs (`useShortcut`'s default) and while no modal already has
 * focus, so it can never collide with typing or steal a dialog's own keys.
 */
export function NewIssueButton({ data }: NewIssueButtonProps) {
  const t = useTranslations();
  const hasOpenModal = useHasOpenModal();
  const open = useNewIssueOpener(data);

  useShortcut("c", () => open?.(), { enabled: !!open && !hasOpenModal });

  if (!open) return null;

  return (
    <Tooltip
      label={t("actions.newIssue")}
      shortcut="c"
      className={styles.tooltipWrap}
    >
      <Button
        variant="primary"
        className={styles.button}
        full
        icon={<Icon icon="lucide:plus" width={16} />}
        onClick={open}
      >
        <span className={styles.label}>{t("actions.newIssue")}</span>
      </Button>
    </Tooltip>
  );
}
