/**
 * Release notes, version bumps and the files under `releases/` — the pure
 * half of the release automation (`scripts/release/cli.ts` does the git and
 * file I/O, `.github/workflows/release-*.yml` call it).
 *
 * A release is one pair of files, `releases/<version>.md` (English) and
 * `releases/<version>.de.md` (German). The top is written by hand
 * (highlights, screenshots), the list of changes between the two
 * `CHANGES_*` markers is generated from the Conventional Commits since the
 * last tag and is the only part a re-run ever rewrites.
 */

export const CHANGES_START = "<!-- changes:start -->";
export const CHANGES_END = "<!-- changes:end -->";

export type Lang = "en" | "de";
export type Bump = "major" | "minor" | "patch";

// ─── Versions ────────────────────────────────────────────────────────────────

export function parseVersion(value: string): [number, number, number] | null {
  const match = value.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

export function nextVersion(current: string, bump: Bump): string {
  const v = parseVersion(current);
  if (!v) throw new Error(`Not a version: ${current}`);
  const [major, minor, patch] = v;
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

// ─── Commits ─────────────────────────────────────────────────────────────────

export interface Commit {
  sha: string;
  subject: string;
  body: string;
}

export interface ParsedCommit {
  sha: string;
  /** `feat`, `fix`, … — `other` for anything that isn't Conventional. */
  type: string;
  scope: string | null;
  breaking: boolean;
  summary: string;
}

const CONVENTIONAL = /^(\w+)(?:\(([^)]+)\))?(!)?:\s+(.+)$/;

export function parseCommit(commit: Commit): ParsedCommit {
  const match = commit.subject.match(CONVENTIONAL);
  const breaking =
    !!match?.[3] || /^BREAKING[ -]CHANGE:/m.test(commit.body ?? "");
  if (!match) {
    return {
      sha: commit.sha,
      type: "other",
      scope: null,
      breaking,
      summary: commit.subject,
    };
  }
  return {
    sha: commit.sha,
    type: match[1].toLowerCase(),
    scope: match[2] ?? null,
    breaking,
    summary: match[4],
  };
}

/**
 * Which part of the version these commits move — `null` when nothing in them
 * is user-visible (only `chore`/`docs`/`test`/…), which means no release.
 * Below 1.0.0 a breaking change or a feature bumps the minor, a fix the
 * patch: the usual 0.x reading, so `0.x` never jumps to `1.0.0` by accident.
 */
export function bumpFor(commits: ParsedCommit[], current: string): Bump | null {
  const preOne = (parseVersion(current)?.[0] ?? 0) === 0;
  let bump: Bump | null = null;
  for (const c of commits) {
    if (c.breaking) return preOne ? "minor" : "major";
    if (c.type === "feat") bump = "minor";
    else if ((c.type === "fix" || c.type === "perf") && bump === null)
      bump = "patch";
  }
  return bump;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

const TITLES: Record<Lang, Record<string, string>> = {
  en: {
    breaking: "Breaking changes",
    feat: "New features",
    fix: "Fixes",
    perf: "Performance",
    maintenance: "Maintenance",
    previous: "Previous version",
    changelog: "Full changelog",
    first: "First release.",
    all: "All changes",
  },
  de: {
    breaking: "Inkompatible Änderungen",
    feat: "Neue Funktionen",
    fix: "Fehlerbehebungen",
    perf: "Performance",
    maintenance: "Wartung",
    previous: "Vorherige Version",
    changelog: "Alle Änderungen",
    first: "Erstes Release.",
    all: "Alle Änderungen",
  },
};

/** More changes than this and the list is folded. */
const FOLD_AFTER = 12;

export interface RenderContext {
  lang: Lang;
  repo: string;
  version: string;
  /** `null` for the very first release. */
  previous: string | null;
  commits: ParsedCommit[];
}

function line(c: ParsedCommit, repo: string): string {
  const scope = c.scope ? `**${c.scope}:** ` : "";
  const short = c.sha.slice(0, 7);
  return `- ${scope}${c.summary} ([\`${short}\`](https://github.com/${repo}/commit/${c.sha}))`;
}

/** The generated part of a release file, without the markers around it. */
export function renderChanges(ctx: RenderContext): string {
  const t = TITLES[ctx.lang];
  const out: string[] = [];

  if (ctx.previous === null) {
    out.push(t.first);
  } else {
    const prev = `v${ctx.previous.replace(/^v/, "")}`;
    const sections: string[] = [];
    const section = (title: string, list: ParsedCommit[]) => {
      if (list.length) {
        sections.push(
          `### ${title}\n\n${list.map((c) => line(c, ctx.repo)).join("\n")}`,
        );
      }
    };
    section(
      t.breaking,
      ctx.commits.filter((c) => c.breaking),
    );
    for (const type of ["feat", "fix", "perf"]) {
      section(
        t[type],
        ctx.commits.filter((c) => c.type === type && !c.breaking),
      );
    }
    const rest = ctx.commits.filter(
      (c) => !c.breaking && !["feat", "fix", "perf"].includes(c.type),
    );
    if (rest.length) {
      sections.push(
        `<details>\n<summary>${t.maintenance} (${rest.length})</summary>\n\n${rest
          .map((c) => line(c, ctx.repo))
          .join("\n")}\n\n</details>`,
      );
    }
    // A long list is folded away — the release's highlights, written by hand
    // above it, are what people read.
    const shown = ctx.commits.length - rest.length;
    out.push(
      shown > FOLD_AFTER
        ? `<details>\n<summary>${t.all} (${ctx.commits.length})</summary>\n\n${sections.join("\n\n")}\n\n</details>`
        : sections.join("\n\n"),
    );
    out.push(
      `**${t.previous}:** [${prev}](https://github.com/${ctx.repo}/releases/tag/${prev}) · **${t.changelog}:** [${prev}…v${ctx.version}](https://github.com/${ctx.repo}/compare/${prev}...v${ctx.version})`,
    );
  }
  return out.join("\n\n");
}

const TEMPLATE_HINT: Record<Lang, string> = {
  en: "Write the highlights here: what is new and why it matters. Images go to releases/assets/<version>/ and are linked as ![alt](assets/<version>/name.png).",
  de: "Hier die Highlights: was ist neu und warum ist es wichtig. Bilder liegen in releases/assets/<version>/ und werden als ![Text](assets/<version>/name.png) eingebunden.",
};

/**
 * A release file with `changes` as its generated block. An existing file
 * keeps everything outside the markers (the hand-written part); a file
 * without markers is left alone except that the block is appended — it never
 * overwrites prose.
 */
export function mergeReleaseFile(
  existing: string | null,
  ctx: RenderContext,
  oldVersion: string | null = null,
): string {
  const block = `${CHANGES_START}\n${renderChanges(ctx)}\n${CHANGES_END}`;
  if (existing === null) {
    return `# Barynt ${ctx.version}\n\n<!-- ${TEMPLATE_HINT[ctx.lang]} -->\n\n${block}\n`;
  }

  let text = existing;
  if (oldVersion && oldVersion !== ctx.version) {
    text = text
      .replace(`# Barynt ${oldVersion}`, `# Barynt ${ctx.version}`)
      .replaceAll(`assets/${oldVersion}/`, `assets/${ctx.version}/`);
  }
  const start = text.indexOf(CHANGES_START);
  const end = text.indexOf(CHANGES_END);
  if (start !== -1 && end > start) {
    return `${text.slice(0, start)}${block}${text.slice(end + CHANGES_END.length)}`;
  }
  return `${text.trimEnd()}\n\n${block}\n`;
}

// ─── The GitHub release body ─────────────────────────────────────────────────

/** Relative `assets/…` image paths don't resolve in a GitHub release — point
 *  them at the raw file on the release's own tag. */
export function rewriteImagePaths(
  markdown: string,
  repo: string,
  tag: string,
): string {
  const base = `https://raw.githubusercontent.com/${repo}/${tag}/releases/`;
  const abs = (path: string) =>
    /^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith("#")
      ? path
      : base + path.replace(/^\.?\//, "");
  return markdown
    .replace(
      /(!\[[^\]]*\]\()([^)\s]+)/g,
      (_, open: string, path: string) => open + abs(path),
    )
    .replace(
      /(<img\b[^>]*\bsrc=")([^"]+)/gi,
      (_, open: string, path: string) => open + abs(path),
    );
}

function body(markdown: string, repo: string, tag: string): string {
  return rewriteImagePaths(
    markdown
      .replace(/<!--(?!\s*changes:)[\s\S]*?-->/g, "")
      .replace(CHANGES_START, "")
      .replace(CHANGES_END, "")
      .replace(/^# .*\n+/, "")
      .trim(),
    repo,
    tag,
  );
}

/** English first, the German version folded away underneath. */
export function renderReleaseBody(options: {
  en: string;
  de: string | null;
  repo: string;
  tag: string;
}): string {
  const en = body(options.en, options.repo, options.tag);
  if (!options.de) return `${en}\n`;
  const de = body(options.de, options.repo, options.tag);
  return `${en}\n\n<details>\n<summary>Deutsch</summary>\n\n${de}\n\n</details>\n`;
}
