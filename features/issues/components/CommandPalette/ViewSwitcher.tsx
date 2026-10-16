"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { listSwitchableViews } from "@/features/views/actions";
import { viewIconOf } from "@/features/views/icons";
import type { ProjectViewEntry } from "@/features/views/queries";
import { viewPath } from "@/features/views/url";
import { useRouter } from "@/i18n/navigation";
import { useHasKeyboard } from "@/lib/shortcuts/useHasKeyboard";
import styles from "./commandPalette.module.scss";

interface ViewSwitcherProps {
  workspaceId: string;
  /** The project the page is in — its views come first. */
  currentProjectSlug: string | null;
  onClose: () => void;
  /** Back to the full palette (Backspace in an empty field). */
  onBack?: () => void;
}

/**
 * "Go to view" (V7, key V): every project view the person sees, the current
 * project's first, then the rest by project; the search matches the view's
 * and the project's name. Lives inside the command palette's frame.
 */
export function ViewSwitcher({
  workspaceId,
  currentProjectSlug,
  onClose,
  onBack,
}: ViewSwitcherProps) {
  const t = useTranslations();
  const router = useRouter();
  const hasKeyboard = useHasKeyboard();
  const [views, setViews] = useState<ProjectViewEntry[] | null>(null);
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    listSwitchableViews(workspaceId).then((list) => {
      if (live) setViews(list);
    });
    setTimeout(() => inputRef.current?.focus(), 30);
    return () => {
      live = false;
    };
  }, [workspaceId]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: cursor drives which row carries styles.active
  useEffect(() => {
    resultsRef.current
      ?.querySelector(`.${styles.active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const lq = q.trim().toLowerCase();
  const hits = (views ?? []).filter(
    (v) =>
      !lq ||
      v.name.toLowerCase().includes(lq) ||
      v.projectName.toLowerCase().includes(lq),
  );
  const here = hits.filter((v) => v.projectSlug === currentProjectSlug);
  const elsewhere = hits.filter((v) => v.projectSlug !== currentProjectSlug);
  const ordered = [...here, ...elsewhere];

  const go = (v: ProjectViewEntry) => {
    router.push(viewPath(workspaceId, v.projectSlug, v.slug));
    onClose();
  };

  const row = (v: ProjectViewEntry, idx: number) => (
    <button
      type="button"
      key={v.id}
      className={`${styles.row}${idx === cursor ? ` ${styles.active}` : ""}`}
      onMouseEnter={() => setCursor(idx)}
      onClick={() => go(v)}
    >
      <Icon icon={viewIconOf(v)} width={15} color={v.color ?? undefined} />
      <span>{v.name}</span>
      <span className="faint" style={{ marginLeft: "auto", fontSize: 12 }}>
        {v.favorite && <Icon icon="lucide:star" width={11} />}{" "}
        {v.projectSlug === currentProjectSlug ? "" : v.projectName}
      </span>
    </button>
  );

  return (
    <>
      <div className={styles.inputWrap}>
        <span className={styles.modeChip}>{t("palette.switchView")}</span>
        <input
          ref={inputRef}
          className={styles.input}
          placeholder={t("palette.searchViews")}
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setCursor((c) => Math.min(c + 1, ordered.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(c - 1, 0));
            }
            if (e.key === "Enter" && ordered[cursor]) go(ordered[cursor]);
            if (e.key === "Escape") onClose();
            if (e.key === "Backspace" && !q && onBack) onBack();
          }}
        />
        {hasKeyboard && <span className={`kbd ${styles.escHint}`}>ESC</span>}
        <button
          type="button"
          className={[styles.closeBtn, !hasKeyboard && styles.closeAlways]
            .filter(Boolean)
            .join(" ")}
          aria-label={t("actions.close")}
          onClick={onClose}
        >
          <Icon icon="lucide:x" width={20} />
        </button>
      </div>

      <div className={styles.results} ref={resultsRef}>
        {views !== null && ordered.length === 0 && (
          <div className={styles.empty}>
            {views.length === 0
              ? t("palette.noViews")
              : t("empty.noResults", { q })}
          </div>
        )}
        {here.length > 0 && (
          <>
            <div className={styles.groupLabel}>{t("palette.viewsHere")}</div>
            {here.map((v, i) => row(v, i))}
          </>
        )}
        {elsewhere.length > 0 && (
          <>
            <div className={styles.groupLabel}>
              {here.length > 0
                ? t("palette.viewsElsewhere")
                : t("palette.views")}
            </div>
            {elsewhere.map((v, i) => row(v, here.length + i))}
          </>
        )}
      </div>
    </>
  );
}
