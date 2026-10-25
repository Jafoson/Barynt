"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef } from "react";
import { useModal } from "@/lib/context";
import { markReleaseSeen } from "../actions";
import { ReleaseNotesModal } from "./ReleaseNotesModal";

interface ReleaseNotesLineProps {
  version: string;
  /** Versions with release notes, newest first. */
  versions: string[];
  githubUrl: string;
  /** The running version is new to this browser — open on its own, once. */
  autoOpen: boolean;
  className?: string;
}

/**
 * The "Release Notes" link in the footer under the user card: a click opens
 * the release notes. After an update the window opens by itself the first time the app is
 * loaded, and not again — opening it, either way, marks the running version as
 * seen (`markReleaseSeen`, a cookie).
 */
export function ReleaseNotesLine({
  version,
  versions,
  githubUrl,
  autoOpen,
  className,
}: ReleaseNotesLineProps) {
  const t = useTranslations("releases");
  const { openModal } = useModal();
  const opened = useRef(false);

  const open = () => {
    openModal(
      ({ close }) => (
        <ReleaseNotesModal
          versions={versions}
          current={version}
          githubUrl={githubUrl}
          close={close}
        />
      ),
      { label: t("title"), width: 760 },
    );
    void markReleaseSeen();
  };

  // Once per page load, and only for a version this browser hasn't seen — the
  // cookie set by `open()` keeps it from coming back on the next load.
  // biome-ignore lint/correctness/useExhaustiveDependencies: opens once on mount
  useEffect(() => {
    if (autoOpen && !opened.current) {
      opened.current = true;
      open();
    }
  }, []);

  return (
    <button
      type="button"
      className={className}
      onClick={open}
      title={t("open")}
    >
      {t("title")}
    </button>
  );
}
