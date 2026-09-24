import "server-only";
import { BARYNT_VERSION } from "@/lib/version";
import { type Download, type DownloadDeps, safeDownload } from "./fetch";

// How a store's repository gets onto the instance: **the archive of its default branch, over
// https** (docs/plugins/adr-0003-store-transport.md). No git binary, no git protocol, so no
// hooks, no submodules, no LFS and nothing from the repository is ever run; what arrives is
// bytes that are unpacked with an allowlist (`archive.ts`) and read as data (`reader.ts`).
// The one thing it needs from a host is a URL for "the default branch as a tarball", which
// GitHub, GitLab, Gitea and Forgejo (also Codeberg) and Bitbucket all have, each in its own
// shape.

/** The most a store's archive may be: a store is a few hundred small files. */
export const MAX_STORE_ARCHIVE_BYTES = 64 * 1024 * 1024;

export interface StoreSource {
  /** The store's address as entered: `https://host/owner/repo`. */
  url: string;
  /** The access token for a private repository, opened, or `null`. */
  token: string | null;
  /** The user name that goes with it, where the host wants one, or `null`. */
  user: string | null;
}

export type HostStyle = "github" | "gitlab" | "bitbucket" | "gitea";

export interface ArchiveRequest {
  style: HostStyle;
  url: string;
  headers: Record<string, string>;
  /** Sent only to the host asked, never on to where a redirect leads. */
  credentialHeaders: Record<string, string>;
}

/** Owner and repository names: what every host allows, and nothing that is a path. */
const SEGMENT = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,99}$/;

/** Which kind of host this is, by its name. Anything unknown is treated as Gitea/Forgejo. */
export function styleOf(host: string): HostStyle {
  const name = host.toLowerCase();
  if (name === "github.com") return "github";
  if (name.startsWith("gitlab.")) return "gitlab";
  if (name === "bitbucket.org") return "bitbucket";
  return "gitea";
}

/**
 * The request that fetches the default branch of the repository at `source.url`, or why it
 * cannot be made. Pure: it only builds addresses and headers.
 */
export function archiveRequestFor(
  source: StoreSource,
): { ok: true; request: ArchiveRequest } | { ok: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(source.url);
  } catch {
    return { ok: false, error: "The store's address is not a URL." };
  }
  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.search ||
    parsed.hash
  ) {
    return {
      ok: false,
      error: "The store's address has to be a plain https:// address.",
    };
  }
  const segments = parsed.pathname
    .split("/")
    .filter(Boolean)
    .map((part, index, all) =>
      index === all.length - 1 ? part.replace(/\.git$/i, "") : part,
    );
  if (segments.length < 2 || !segments.every((part) => SEGMENT.test(part))) {
    return {
      ok: false,
      error:
        "The store's address has to look like https://host/owner/repository.",
    };
  }
  const host = parsed.hostname;
  const style = styleOf(host);
  const path = segments.join("/");
  const name = segments.at(-1) as string;
  const headers: Record<string, string> = {
    "user-agent": `Barynt/${BARYNT_VERSION} plugin store`,
    accept: "application/gzip, application/x-gzip, application/octet-stream",
  };
  const credentialHeaders: Record<string, string> = {};

  switch (style) {
    case "github": {
      const [owner, repo] = segments as [string, string];
      if (segments.length !== 2) {
        return {
          ok: false,
          error:
            "A GitHub store's address is https://github.com/owner/repository.",
        };
      }
      if (source.token) {
        // A private repository is fetched through the API, which takes the token, and
        // which answers with a redirect to the archive.
        credentialHeaders.authorization = `Bearer ${source.token}`;
        headers["x-github-api-version"] = "2022-11-28";
        return {
          ok: true,
          request: {
            style,
            url: `https://api.github.com/repos/${owner}/${repo}/tarball`,
            headers,
            credentialHeaders,
          },
        };
      }
      return {
        ok: true,
        request: {
          style,
          url: `https://codeload.github.com/${owner}/${repo}/tar.gz/HEAD`,
          headers,
          credentialHeaders,
        },
      };
    }
    case "gitlab":
      if (source.token) credentialHeaders["private-token"] = source.token;
      return {
        ok: true,
        request: {
          style,
          url: `https://${host}/${path}/-/archive/HEAD/${name}-HEAD.tar.gz`,
          headers,
          credentialHeaders,
        },
      };
    case "bitbucket": {
      if (segments.length !== 2) {
        return {
          ok: false,
          error:
            "A Bitbucket store's address is https://bitbucket.org/workspace/repository.",
        };
      }
      if (source.token) {
        if (!source.user) {
          return {
            ok: false,
            error: "Bitbucket needs a user name with the access token.",
          };
        }
        credentialHeaders.authorization = `Basic ${Buffer.from(`${source.user}:${source.token}`).toString("base64")}`;
      }
      return {
        ok: true,
        request: {
          style,
          url: `https://bitbucket.org/${path}/get/HEAD.tar.gz`,
          headers,
          credentialHeaders,
        },
      };
    }
    default:
      if (source.token)
        credentialHeaders.authorization = `token ${source.token}`;
      return {
        ok: true,
        request: {
          style,
          url: `https://${host}/${path}/archive/HEAD.tar.gz`,
          headers,
          credentialHeaders,
        },
      };
  }
}

/**
 * Downloads the archive of a store's default branch. Never throws; the reason of a failure
 * never carries the token.
 */
export async function fetchStoreArchive(
  source: StoreSource,
  deps?: DownloadDeps,
  options: { timeoutMs?: number } = {},
): Promise<Download> {
  const made = archiveRequestFor(source);
  if (!made.ok) return { ok: false, error: made.error, code: "invalid-url" };
  return safeDownload(
    made.request.url,
    {
      maxBytes: MAX_STORE_ARCHIVE_BYTES,
      headers: made.request.headers,
      credentialHeaders: made.request.credentialHeaders,
      ...(options.timeoutMs !== undefined
        ? { timeoutMs: options.timeoutMs }
        : {}),
    },
    deps,
  );
}
