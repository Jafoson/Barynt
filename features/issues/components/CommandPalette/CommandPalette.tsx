"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Avatar } from "@/components/ui/atoms/Avatar/Avatar";
import { searchIssuesForPalette } from "@/features/issues/actions";
import { StatusIcon } from "@/features/issues/components/IssueIcons/IssueIcons";
import { issuePath } from "@/features/issues/issue-links";
import { getRecentIssueIdentifiers } from "@/features/issues/recent-issues";
import { useRouter } from "@/i18n/navigation";
import type { Translator } from "@/i18n/types";
import { modKey } from "@/lib/a11y";
import { type NavLabelKey, WORKSPACE_SECTIONS, workspacePath } from "@/lib/nav";
import { useHasKeyboard } from "@/lib/shortcuts/useHasKeyboard";
import type { Project, SearchableIssue, Status } from "@/types";
import styles from "./commandPalette.module.scss";

/** How many leading results get a `mod+N` quick-select badge — one digit
 *  row, same as Raycast's own numbered favorites. */
const QUICK_SELECT_COUNT = 9;

interface NavEntry {
  href: string;
  label: (t: Translator) => string;
  icon: string;
}

// Which WORKSPACE_SECTIONS entries show up as "go to" results, and the
// (differently-phrased) palette label for each — icon/href still come from
// lib/nav.ts so they can't drift from the Sidebar.
const PALETTE_GOTO: [NavLabelKey, (t: Translator) => string][] = [
  ["myIssues", (t) => t("palette.goto.my")],
  ["inbox", (t) => t("palette.goto.inbox")],
  ["members", (t) => t("palette.goto.members")],
  ["teams", (t) => t("palette.goto.teams")],
  ["settings", (t) => t("palette.goto.settings")],
];

interface CommandEntry {
  id: string;
  label: (t: Translator) => string;
  icon: string;
  run: () => void;
}

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  workspaceId: string;
  projects: Project[];
  statuses: Status[];
  searchIssues: SearchableIssue[];
  /** Absent wherever the action itself isn't available (e.g. nowhere left
   *  to create an issue) — the row simply doesn't exist then, rather than
   *  existing and doing nothing. */
  onNewIssue?: () => void;
  onShowShortcuts?: () => void;
}

export function CommandPalette({
  open,
  onClose,
  workspaceId,
  projects,
  statuses,
  searchIssues,
  onNewIssue,
  onShowShortcuts,
}: CommandPaletteProps) {
  const t = useTranslations();
  // Without a keyboard the palette shows no shortcuts, and no command that
  // only lists them.
  const hasKeyboard = useHasKeyboard();
  const router = useRouter();
  const base = `/${workspaceId}`;
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const [recentIdentifiers, setRecentIdentifiers] = useState<string[]>([]);
  // Ranked, server-side full-text results (title, description, and
  // comments — see `searchIssuesForPalette`) for the current query. Not
  // derived from `searchIssues`: that's an unranked, title-only snapshot
  // meant for the `#` mention trigger and the no-query "recent" list below,
  // not for real search.
  const [liveIssueHits, setLiveIssueHits] = useState<SearchableIssue[]>([]);
  const searchSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  const NAV_ENTRIES: NavEntry[] = PALETTE_GOTO.map(([labelKey, label]) => {
    const entry = WORKSPACE_SECTIONS.find((e) => e.labelKey === labelKey);
    if (!entry) throw new Error(`No WORKSPACE_SECTIONS entry for ${labelKey}`);
    return {
      href: workspacePath(workspaceId, entry.section),
      icon: entry.icon,
      label,
    };
  });

  // Actual actions, not places to go — a real command palette's whole
  // point, not just a jump list. Each only exists as an entry once its
  // handler does (see `CommandPaletteProps`).
  const COMMAND_ENTRIES: CommandEntry[] = [
    ...(onNewIssue
      ? [
          {
            id: "new-issue",
            label: (t: Translator) => t("palette.newIssue"),
            icon: "lucide:plus",
            run: onNewIssue,
          },
        ]
      : []),
    ...(onShowShortcuts && hasKeyboard
      ? [
          {
            id: "show-shortcuts",
            label: (t: Translator) => t("palette.showShortcuts"),
            icon: "lucide:keyboard",
            run: onShowShortcuts,
          },
        ]
      : []),
  ];

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      setRecentIdentifiers(getRecentIssueIdentifiers());
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  // Arrow-key navigation moves `cursor` without touching scroll position,
  // so once the list is taller than the viewport the active row can end up
  // below the fold with no visual feedback that anything moved.
  // biome-ignore lint/correctness/useExhaustiveDependencies: cursor drives which row carries styles.active, just not by name in the body
  useEffect(() => {
    resultsRef.current
      ?.querySelector(`.${styles.active}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  // Debounced, ranked full-text search (title, description, comments) —
  // `searchSeq` guards against an in-flight request from an earlier
  // keystroke overwriting a later one that resolved first.
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setLiveIssueHits([]);
      return;
    }
    const seq = ++searchSeq.current;
    const timer = setTimeout(() => {
      searchIssuesForPalette(workspaceId, query).then((results) => {
        if (seq === searchSeq.current) setLiveIssueHits(results);
      });
    }, 150);
    return () => clearTimeout(timer);
  }, [q, workspaceId]);

  const lq = q.toLowerCase();

  const commandHits = COMMAND_ENTRIES.filter((c) =>
    c.label(t).toLowerCase().includes(lq),
  );
  const navHits = NAV_ENTRIES.filter((e) =>
    e.label(t).toLowerCase().includes(lq),
  );
  // Own group, own row shape: a project is an entity with its own color/
  // image (the same `Avatar` the Sidebar's own project rows use, `shape=
  // "square"`), not a generic destination — mixing it into `navHits` under
  // one hardcoded icon was both visually flat and, once there were more
  // than a couple of projects, harder to scan than the fixed five-item nav
  // list it was buried in.
  const boardHits = projects.filter(
    (p) => p.name.toLowerCase().includes(lq) || "board".includes(lq),
  );

  const identifierOf = (i: SearchableIssue) =>
    `${projects.find((p) => p.id === i.project)?.prefix ?? "?"}-${i.key}`;

  // No query yet: lead with what was actually opened before, not just
  // whatever this workspace's most-recently-*edited* issues happen to be
  // (searchIssues' own order) — those two aren't the same list. With a
  // query, `liveIssueHits` is the debounced, ranked full-text result for it
  // (see the effect above) rather than a local filter over `searchIssues`.
  const issueHits = lq
    ? liveIssueHits.slice(0, 6)
    : recentIdentifiers
        .map((id) => searchIssues.find((i) => identifierOf(i) === id))
        .filter((i): i is SearchableIssue => i !== undefined)
        .slice(0, 6);

  type ResultItem =
    | {
        kind: "command";
        id: string;
        label: string;
        icon: string;
        run: () => void;
      }
    | { kind: "nav"; href: string; label: string; icon: string }
    | { kind: "board"; href: string; project: Project }
    | {
        kind: "issue";
        id: string;
        title: string;
        status: string;
        identifier: string;
      };

  const results: ResultItem[] = [
    ...commandHits.map((c) => ({
      kind: "command" as const,
      id: c.id,
      label: c.label(t),
      icon: c.icon,
      run: c.run,
    })),
    ...boardHits.map((p) => ({
      kind: "board" as const,
      href: `${base}/project/${p.slug}`,
      project: p,
    })),
    ...navHits.map((e) => ({
      kind: "nav" as const,
      href: e.href,
      label: e.label(t),
      icon: e.icon,
    })),
    ...issueHits.map((i) => ({
      kind: "issue" as const,
      id: i.id,
      title: i.title,
      status: i.status,
      identifier: identifierOf(i),
    })),
  ];

  // `modKey()` reads `navigator`, so it's client-only — safe to call
  // directly at render time here (unlike `Shortcut.tsx`'s own two-pass
  // correction): this whole component returns `null` while `open` is
  // false, so it never actually paints during SSR/hydration, only after a
  // client-side interaction opens it.
  const mod = modKey();
  // Projects only, not every result: the whole point is jumping straight
  // to a board by its position — a command or an issue doesn't have a
  // stable "position" the same way (a shortcut key drifting to a
  // different action every time the query changes would be worse than not
  // having one).
  const quickSelectBadge = (idx: number) =>
    hasKeyboard && idx < QUICK_SELECT_COUNT ? (
      <span className="kbd" style={{ marginLeft: "auto" }}>
        {mod}
        {idx + 1}
      </span>
    ) : null;

  const select = (item: ResultItem) => {
    if (item.kind === "command") {
      item.run();
    } else if (item.kind === "nav" || item.kind === "board") {
      router.push(item.href);
    } else {
      router.push(issuePath(workspaceId, item.identifier));
    }
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div className={styles.overlay}>
      <button
        type="button"
        className={styles.backdrop}
        aria-label="Close"
        onClick={onClose}
      />
      <div className={styles.panel}>
        <div className={styles.inputWrap}>
          <Icon icon="lucide:search" width={16} className="faint" />
          <input
            ref={inputRef}
            className={styles.input}
            placeholder={t("placeholders.searchIssues")}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setCursor(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((c) => Math.min(c + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((c) => Math.max(c - 1, 0));
              }
              if (e.key === "Enter" && results[cursor]) select(results[cursor]);
              if (e.key === "Escape") onClose();
              // "mod+1".."mod+9" jump straight to that project's board —
              // Raycast's own pattern for its numbered favorites, scoped to
              // the Projects group specifically (see `quickSelectBadge`).
              // Never a bare digit: this is a search box, so "1" alone has
              // to keep typing "1".
              if ((e.metaKey || e.ctrlKey) && /^[1-9]$/.test(e.key)) {
                const p = boardHits[Number(e.key) - 1];
                if (p) {
                  e.preventDefault();
                  select({
                    kind: "board",
                    href: `${base}/project/${p.slug}`,
                    project: p,
                  });
                }
              }
            }}
          />
          {/* A keyboard hint where there's a keyboard, a close button on a
              phone (CSS) and wherever there's no keyboard to press Escape on. */}
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
          {results.length === 0 && (
            <div className={styles.empty}>{t("empty.noResults", { q })}</div>
          )}
          {commandHits.length > 0 && (
            <>
              <div className={styles.groupLabel}>{t("palette.commands")}</div>
              {commandHits.map((c, idx) => (
                <button
                  type="button"
                  key={c.id}
                  className={`${styles.row}${idx === cursor ? ` ${styles.active}` : ""}`}
                  onMouseEnter={() => setCursor(idx)}
                  onClick={() =>
                    select({
                      kind: "command",
                      id: c.id,
                      label: c.label(t),
                      icon: c.icon,
                      run: c.run,
                    })
                  }
                >
                  <Icon icon={c.icon} width={15} />
                  <span>{c.label(t)}</span>
                </button>
              ))}
            </>
          )}
          {boardHits.length > 0 && (
            <>
              <div className={styles.groupLabel}>{t("palette.projects")}</div>
              {boardHits.map((p, idx) => {
                const absIdx = commandHits.length + idx;
                const href = `${base}/project/${p.slug}`;
                return (
                  <button
                    type="button"
                    key={p.id}
                    className={`${styles.row}${absIdx === cursor ? ` ${styles.active}` : ""}`}
                    onMouseEnter={() => setCursor(absIdx)}
                    onClick={() => select({ kind: "board", href, project: p })}
                  >
                    <Avatar
                      avatar={{
                        name: p.name,
                        color: p.color,
                        image: p.avatarUrl ?? undefined,
                      }}
                      shape="square"
                      size={17}
                    />
                    <span>{p.name}</span>
                    {quickSelectBadge(idx)}
                  </button>
                );
              })}
            </>
          )}
          {navHits.length > 0 && (
            <>
              <div className={styles.groupLabel}>{t("palette.navigation")}</div>
              {navHits.map((e, idx) => {
                const absIdx = commandHits.length + boardHits.length + idx;
                return (
                  <button
                    type="button"
                    key={e.href}
                    className={`${styles.row}${absIdx === cursor ? ` ${styles.active}` : ""}`}
                    onMouseEnter={() => setCursor(absIdx)}
                    onClick={() =>
                      select({
                        kind: "nav",
                        href: e.href,
                        label: e.label(t),
                        icon: e.icon,
                      })
                    }
                  >
                    <Icon icon={e.icon} width={15} />
                    <span>{e.label(t)}</span>
                  </button>
                );
              })}
            </>
          )}
          {issueHits.length > 0 && (
            <>
              <div className={styles.groupLabel}>
                {t(lq ? "palette.issues" : "palette.recentIssues")}
              </div>
              {issueHits.map((i, idx) => {
                const absIdx =
                  commandHits.length + navHits.length + boardHits.length + idx;
                const identifier = identifierOf(i);
                return (
                  <button
                    type="button"
                    key={i.id}
                    className={`${styles.row}${absIdx === cursor ? ` ${styles.active}` : ""}`}
                    onMouseEnter={() => setCursor(absIdx)}
                    onClick={() =>
                      select({
                        kind: "issue",
                        id: i.id,
                        title: i.title,
                        status: i.status,
                        identifier,
                      })
                    }
                  >
                    <StatusIcon
                      status={i.status}
                      size={15}
                      color={statuses.find((s) => s.id === i.status)?.color}
                    />
                    <span className={styles.issueTitle}>{i.title}</span>
                    <span
                      className="faint mono"
                      style={{ fontSize: 11, marginLeft: "auto" }}
                    >
                      {identifier}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        {hasKeyboard && (
          <div className={`${styles.footer} ${styles.keyHints}`}>
            <span className="kbd">↑↓</span> {t("palette.navigate")}
            <span className="kbd" style={{ marginLeft: 8 }}>
              ↵
            </span>{" "}
            {t("palette.select")}
            {boardHits.length > 0 && (
              <>
                <span className="kbd" style={{ marginLeft: 8 }}>
                  {mod}1-9
                </span>{" "}
                {t("palette.jump")}
              </>
            )}
            <span className="kbd" style={{ marginLeft: 8 }}>
              ESC
            </span>{" "}
            {t("palette.close")}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
