"use client";

/**
 * Locally remembered issue identifiers ("PREFIX-123"), most recent first —
 * what the command palette shows under "Issues" before anyone types a
 * query. Recorded from `IssuePeek` so every way of opening an issue (list,
 * board, inbox, a mention link, the palette itself) counts, not just one
 * entry point.
 */
const RECENT_ISSUES_KEY = "orbit-recent-issues";
const MAX_RECENT = 20;

function load(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_ISSUES_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((v) => typeof v === "string")
      : [];
  } catch {
    return [];
  }
}

export function getRecentIssueIdentifiers(): string[] {
  return load();
}

export function recordIssueOpened(identifier: string) {
  try {
    const next = [
      identifier,
      ...load().filter((id) => id !== identifier),
    ].slice(0, MAX_RECENT);
    localStorage.setItem(RECENT_ISSUES_KEY, JSON.stringify(next));
  } catch {}
}
