import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Fetching a page on behalf of a person (a site's icon, a link's title). The
// browser never talks to the site: this server does, so the site learns
// neither the person's address nor that they looked at the link. That makes
// this server an HTTP client for addresses people typed in, hence the
// guards: no private or local addresses (also not after a redirect), the
// default ports only, a short time and a small size.

const TIMEOUT_MS = 3000;

/** Whether an address is one of this machine or its network, not the internet. */
export function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    const a = address.toLowerCase();
    if (a === "::1" || a === "::") return true;
    if (a.startsWith("fc") || a.startsWith("fd")) return true; // unique local
    if (/^fe[89ab]/.test(a)) return true; // link local
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    return mapped ? isPrivateAddress(mapped[1]) : false;
  }
  const p = address.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return true;
  const [a, b] = p;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    a >= 224
  );
}

/** A host name that may be looked up: letters, digits, dots, hyphens. */
export function isPlainHost(host: string): boolean {
  return (
    host.length <= 253 &&
    isIP(host) === 0 &&
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(
      host,
    )
  );
}

/** Whether a host is a public name: plain, and every address is public. */
async function isPublicHost(host: string): Promise<boolean> {
  if (!isPlainHost(host)) return false;
  const addresses = await lookup(host, { all: true });
  return (
    addresses.length > 0 && !addresses.some((a) => isPrivateAddress(a.address))
  );
}

export interface PublicResponse {
  body: Uint8Array;
  contentType: string;
}

/**
 * GET `start` and return the body, or `null` for anything that is not an
 * acceptable answer. Redirects are followed by hand (up to 3), so every hop
 * is checked like the first request. At most `maxBytes` are read; a longer
 * body is cut when `truncate` is set and refused otherwise.
 */
export async function fetchPublic(
  start: URL,
  options: {
    accept: string;
    maxBytes: number;
    /** Allowed `content-type`s (the part before `;`). */
    types: RegExp;
    protocols: ("https:" | "http:")[];
    truncate?: boolean;
  },
): Promise<PublicResponse | null> {
  try {
    let url = start;
    for (let hop = 0; hop <= 3; hop++) {
      if (!(options.protocols as string[]).includes(url.protocol)) return null;
      if (url.port !== "" || url.username !== "" || url.password !== "") {
        return null;
      }
      if (!(await isPublicHost(url.hostname))) return null;
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          accept: options.accept,
          "user-agent": "Barynt-link-preview",
        },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        url = new URL(location, url);
        continue;
      }
      if (!res.ok || !res.body) return null;
      const type = (res.headers.get("content-type") ?? "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      if (!options.types.test(type)) return null;

      const chunks: Uint8Array[] = [];
      let size = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > options.maxBytes) {
          if (!options.truncate) {
            await reader.cancel();
            return null;
          }
          chunks.push(
            value.subarray(0, value.byteLength - (size - options.maxBytes)),
          );
          await reader.cancel();
          break;
        }
        chunks.push(value);
      }
      const body = new Uint8Array(Math.min(size, options.maxBytes));
      let offset = 0;
      for (const chunk of chunks) {
        body.set(chunk, offset);
        offset += chunk.byteLength;
      }
      return body.byteLength === 0 ? null : { body, contentType: type };
    }
    return null;
  } catch {
    return null;
  }
}
