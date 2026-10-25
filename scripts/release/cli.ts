/**
 * Release automation, the I/O half (`scripts/release/notes.ts` is the pure
 * one). Run by `.github/workflows/release-pr.yml` and `release.yml`:
 *
 *   bun scripts/release/cli.ts prepare          propose the next version, write
 *                                               releases/<v>.md + .de.md, bump
 *                                               package.json
 *   bun scripts/release/cli.ts body <version>   print the GitHub release body
 *
 * `prepare` is idempotent: it works from the working tree, so hand edits in
 * `releases/` (the workflow restores them from the open release branch
 * before calling it) survive a re-run — only the generated block moves.
 */
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import {
  bumpFor,
  type Commit,
  compareVersions,
  type Lang,
  mergeReleaseFile,
  nextVersion,
  parseCommit,
  parseVersion,
  renderReleaseBody,
} from "./notes";

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();

function repoSlug(): string {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = git("remote", "get-url", "origin");
  return url.replace(/^.*github\.com[:/]/, "").replace(/\.git$/, "");
}

function lastTag(): string | null {
  try {
    return git("describe", "--tags", "--abbrev=0", "--match", "v[0-9]*");
  } catch {
    return null;
  }
}

function commitsSince(tag: string): Commit[] {
  const raw = git(
    "log",
    `${tag}..HEAD`,
    "--no-merges",
    "--format=%H%x1f%s%x1f%b%x1e",
  );
  return raw
    .split("\x1e")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [sha, subject, body = ""] = entry.split("\x1f");
      return { sha, subject, body };
    });
}

const fileFor = (version: string, lang: Lang) =>
  `releases/${version}${lang === "de" ? ".de" : ""}.md`;

function output(name: string, value: string) {
  console.log(`${name}=${value}`);
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

/** Release files that aren't out yet — their version is above the last tag. */
function pendingVersions(base: string | null): string[] {
  if (!existsSync("releases")) return [];
  return readdirSync("releases")
    .map((name) => name.match(/^(\d+\.\d+\.\d+)\.md$/)?.[1])
    .filter((v): v is string => !!v)
    .filter((v) => base === null || compareVersions(v, base) > 0);
}

function prepare() {
  const repo = repoSlug();
  const pkg = readFileSync("package.json", "utf8");
  const current = JSON.parse(pkg).version as string;
  const tag = lastTag();
  const base = tag?.replace(/^v/, "") ?? null;

  let version: string;
  const commits = tag ? commitsSince(tag).map(parseCommit) : [];
  if (base === null) {
    // Nothing has been released yet: the first release is whatever
    // package.json says, with no list of changes to speak of.
    version = current;
  } else {
    const bump = bumpFor(commits, base);
    if (!bump) {
      output("changed", "false");
      console.log("Nothing user-visible since", tag);
      return;
    }
    version = nextVersion(base, bump);
  }

  // A feature landing after a fix moves the proposed version — the pending
  // files follow it, along with their images.
  const [pending] = pendingVersions(base).filter((v) => v !== version);
  if (pending) {
    for (const lang of ["en", "de"] as const) {
      if (existsSync(fileFor(pending, lang)))
        renameSync(fileFor(pending, lang), fileFor(version, lang));
    }
    if (existsSync(`releases/assets/${pending}`)) {
      renameSync(`releases/assets/${pending}`, `releases/assets/${version}`);
    }
  }

  mkdirSync("releases", { recursive: true });
  for (const lang of ["en", "de"] as const) {
    const path = fileFor(version, lang);
    const existing = existsSync(path) ? readFileSync(path, "utf8") : null;
    writeFileSync(
      path,
      mergeReleaseFile(
        existing,
        { lang, repo, version, previous: base, commits },
        pending ?? null,
      ),
    );
  }

  if (version !== current) {
    writeFileSync(
      "package.json",
      pkg.replace(/("version":\s*")[^"]+(")/, `$1${version}$2`),
    );
  }

  output("changed", "true");
  output("version", version);
  output("previous", base ?? "");
}

function body(version: string, out: string | undefined) {
  if (!parseVersion(version)) throw new Error(`Not a version: ${version}`);
  const en = fileFor(version, "en");
  if (!existsSync(en)) throw new Error(`${en} is missing`);
  const de = fileFor(version, "de");
  const text = renderReleaseBody({
    en: readFileSync(en, "utf8"),
    de: existsSync(de) ? readFileSync(de, "utf8") : null,
    repo: repoSlug(),
    tag: `v${version}`,
  });
  if (out) writeFileSync(out, text);
  else process.stdout.write(text);
}

const [command, ...args] = process.argv.slice(2);
if (command === "prepare") prepare();
else if (command === "body") {
  const outIndex = args.indexOf("--out");
  body(args[0], outIndex === -1 ? undefined : args[outIndex + 1]);
} else {
  console.error("Usage: cli.ts prepare | body <version> [--out file]");
  process.exit(1);
}
