import "server-only";
import { APP_VERSION, GITHUB_URL } from "@/lib/app-info";

/**
 * Is a newer release of the app out? Asks GitHub for the repository's latest
 * release (drafts and pre-releases are never "latest") and compares it with
 * the running `APP_VERSION`. Shown to platform admins only (`UserMenu`) —
 * they're the ones who can actually update.
 *
 * The only outgoing call this app makes on its own, so it can be switched
 * off: `UPDATE_CHECK=false`. Every failure — offline, rate limit, no release
 * yet — means "nothing to show", never an error.
 */

const LATEST_RELEASE_API = `https://api.github.com/repos/${new URL(GITHUB_URL).pathname.slice(1)}/releases/latest`;

/** The answer is the same for everyone and changes rarely. */
const REVALIDATE_SECONDS = 6 * 60 * 60;
const TIMEOUT_MS = 3000;

export interface AvailableUpdate {
  version: string;
  /** The release page. */
  url: string;
}

function parse(version: string): number[] | null {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)$/);
  return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : null;
}

/** `true` when `latest` is a higher `x.y.z` than `current`. Anything that
 *  isn't a plain version (a pre-release tag, garbage) is never "newer". */
export function isNewerVersion(latest: string, current: string): boolean {
  const a = parse(latest);
  const b = parse(current);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return a[i] > b[i];
  }
  return false;
}

export async function getAvailableUpdate(): Promise<AvailableUpdate | null> {
  if (process.env.UPDATE_CHECK === "false") return null;

  try {
    const res = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
      next: { revalidate: REVALIDATE_SECONDS },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const { tag_name: tag } = (await res.json()) as { tag_name?: unknown };
    if (typeof tag !== "string" || !isNewerVersion(tag, APP_VERSION))
      return null;
    return {
      version: tag.replace(/^v/, ""),
      url: `${GITHUB_URL}/releases/tag/${encodeURIComponent(tag)}`,
    };
  } catch {
    return null;
  }
}
