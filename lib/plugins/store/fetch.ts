import "server-only";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { isPublicAddress } from "./address";

// Downloads a file another person named: a store's archive, a plugin's release. The
// address is theirs, so nothing about it is trusted: only https, no credentials in it, the
// standard port, a name and not a number, every address the name resolves to on the public
// internet (so a link cannot reach the instance's own network), every redirect checked the
// same way, a limit on the size and a limit on the time. Whatever comes back is only bytes:
// what they mean is checked by the one who asked (a hash, a schema), never here.
//
// One thing this cannot do: ask DNS once and connect to what was asked. `fetch` asks again,
// so a name that answers differently the second time (DNS rebinding) is not caught. The
// egress rules (BARY-97) are the place for a fence around the process; this is the first
// line, not the last.

export type DownloadCode =
  | "invalid-url"
  | "blocked-address"
  | "http"
  | "too-large"
  | "timeout"
  | "network"
  | "redirects";

export type Download =
  | { ok: true; data: Buffer; url: string }
  | { ok: false; error: string; code: DownloadCode };

export interface DownloadDeps {
  fetch?: (url: string, init: RequestInit) => Promise<Response>;
  /** The addresses a name resolves to. */
  lookup?: (host: string) => Promise<string[]>;
}

export interface DownloadOptions {
  /** The most bytes that are accepted. More is refused, not cut. */
  maxBytes: number;
  /** For everything, the redirects and the reading of the body included. Default 60 s. */
  timeoutMs?: number;
  /** How many redirects are followed. Default 5. */
  maxRedirects?: number;
  /** Sent to every host. */
  headers?: Record<string, string>;
  /** Sent only to the host that was asked first, never to where a redirect leads. */
  credentialHeaders?: Record<string, string>;
}

const defaultLookup = async (host: string): Promise<string[]> =>
  (await lookup(host, { all: true, verbatim: true })).map((a) => a.address);

class Refused extends Error {
  constructor(
    message: string,
    readonly code: DownloadCode,
  ) {
    super(message);
  }
}

/** The URL if it is one that may be fetched, otherwise why not. */
function checked(text: string): URL {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw new Refused("The address is not a URL.", "invalid-url");
  }
  if (url.protocol !== "https:") {
    throw new Refused("Only https:// addresses are downloaded.", "invalid-url");
  }
  if (url.username || url.password) {
    throw new Refused(
      "An address with a user name or password is not downloaded.",
      "invalid-url",
    );
  }
  // The standard port is not written out by `URL`, so any port that is left is another one.
  if (url.port) {
    throw new Refused("Only the standard https port is used.", "invalid-url");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) !== 0) {
    throw new Refused(
      "An address must name a host, not a number.",
      "invalid-url",
    );
  }
  return url;
}

async function assertPublic(
  host: string,
  resolve: (host: string) => Promise<string[]>,
): Promise<void> {
  let addresses: string[];
  try {
    addresses = await resolve(host);
  } catch {
    throw new Refused(`${host} could not be resolved.`, "network");
  }
  if (addresses.length === 0 || !addresses.every(isPublicAddress)) {
    throw new Refused(
      `${host} does not lead to the public internet, so it is not downloaded from.`,
      "blocked-address",
    );
  }
}

/** The body of `response` as bytes, refusing more than `max` and stopping on `signal`. */
async function readLimited(
  response: Response,
  max: number,
  signal: AbortSignal,
): Promise<Buffer> {
  const length = Number(response.headers.get("content-length"));
  if (length > max) {
    await response.body?.cancel().catch(() => {});
    throw new Refused(`The file is larger than ${max} bytes.`, "too-large");
  }
  const reader = response.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks: Uint8Array[] = [];
  let total = 0;
  signal.addEventListener("abort", () => void reader.cancel().catch(() => {}), {
    once: true,
  });
  for (;;) {
    const { done, value } = await reader.read();
    if (signal.aborted)
      throw new Refused("The download took too long.", "timeout");
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel().catch(() => {});
      throw new Refused(`The file is larger than ${max} bytes.`, "too-large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Downloads `address`. Never throws: every failure is a result with a reason. The reason
 * never carries a header, so a token cannot end up in a log or a page through it.
 */
export async function safeDownload(
  address: string,
  options: DownloadOptions,
  deps: DownloadDeps = {},
): Promise<Download> {
  const doFetch = deps.fetch ?? ((url, init) => fetch(url, init));
  const resolve = deps.lookup ?? defaultLookup;
  const maxRedirects = options.maxRedirects ?? 5;
  const signal = AbortSignal.timeout(options.timeoutMs ?? 60_000);
  try {
    let url = checked(address);
    const origin = url.hostname;
    for (let hop = 0; ; hop++) {
      await assertPublic(url.hostname, resolve);
      const headers = {
        ...options.headers,
        // Only to the host that was asked, and never on to another.
        ...(url.hostname === origin ? options.credentialHeaders : {}),
      };
      let response: Response;
      try {
        response = await doFetch(url.toString(), {
          method: "GET",
          redirect: "manual",
          headers,
          signal,
        });
      } catch (error) {
        if (signal.aborted)
          throw new Refused("The download took too long.", "timeout");
        throw new Refused(
          `${url.hostname} could not be reached (${error instanceof Error ? error.name : "error"}).`,
          "network",
        );
      }
      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => {});
        const location = response.headers.get("location");
        if (!location) {
          throw new Refused(
            "The server redirected without saying where.",
            "http",
          );
        }
        if (hop >= maxRedirects) {
          throw new Refused("The address redirects too often.", "redirects");
        }
        url = checked(new URL(location, url).toString());
        continue;
      }
      if (response.status !== 200) {
        await response.body?.cancel().catch(() => {});
        throw new Refused(`The server answered ${response.status}.`, "http");
      }
      const data = await readLimited(response, options.maxBytes, signal);
      return { ok: true, data, url: url.toString() };
    }
  } catch (error) {
    if (error instanceof Refused) {
      return { ok: false, error: error.message, code: error.code };
    }
    if (signal.aborted) {
      return {
        ok: false,
        error: "The download took too long.",
        code: "timeout",
      };
    }
    return { ok: false, error: "The download failed.", code: "network" };
  }
}
