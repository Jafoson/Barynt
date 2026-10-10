import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// Fetching a site's icon for a person. The browser never talks to the site
// (nor to a third-party icon service): this server does, so the site learns
// neither the person's address nor that they looked at the link. That makes
// this server an HTTP client for addresses people typed in, hence the
// guards: https only, no private or local addresses (also not after a
// redirect), a short time and a small size.

const MAX_BYTES = 64 * 1024;
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

export interface FetchedIcon {
  body: Uint8Array;
  contentType: string;
}

/** Whether a host is a public name: plain, and every address is public. */
async function isPublicHost(host: string): Promise<boolean> {
  if (!isPlainHost(host)) return false;
  const addresses = await lookup(host, { all: true });
  return (
    addresses.length > 0 && !addresses.some((a) => isPrivateAddress(a.address))
  );
}

/**
 * The icon at `https://<host>/favicon.ico`, or `null` if there is none.
 * Redirects are followed by hand (up to 3, https only), so every hop is
 * checked like the first request.
 */
export async function fetchFavicon(host: string): Promise<FetchedIcon | null> {
  try {
    let url = new URL(`https://${host}/favicon.ico`);
    for (let hop = 0; hop <= 3; hop++) {
      if (url.protocol !== "https:" || url.port !== "") return null;
      if (!(await isPublicHost(url.hostname))) return null;
      const res = await fetch(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: { accept: "image/*", "user-agent": "Barynt-favicon" },
      });
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) return null;
        url = new URL(location, url);
        continue;
      }
      if (!res.ok) return null;
      const type = (res.headers.get("content-type") ?? "").split(";")[0].trim();
      if (
        !/^image\/(x-icon|vnd\.microsoft\.icon|png|gif|jpeg|webp)$/.test(type)
      ) {
        return null;
      }
      const buffer = new Uint8Array(await res.arrayBuffer());
      if (buffer.byteLength === 0 || buffer.byteLength > MAX_BYTES) return null;
      return { body: buffer, contentType: type };
    }
    return null;
  } catch {
    return null;
  }
}
