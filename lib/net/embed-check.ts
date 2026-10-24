import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import https from "node:https";
import { BlockList, isIP } from "node:net";

/**
 * Whether a page lets itself be shown in an iframe on this app (BARY-183).
 *
 * A browser that's refused framing (`X-Frame-Options`, CSP `frame-ancestors`)
 * just leaves the frame empty — no error a page could catch. The only way to
 * know is to read the page's headers, so the server fetches it once.
 *
 * That fetch takes an address someone typed into a dashboard, so it must
 * never reach anything but the public internet (SSRF): every address a host
 * resolves to is checked at the moment of connecting (the `lookup` hook —
 * no window for a DNS answer to change between check and connect), and the
 * same holds for every redirect. Nothing private, loopback, link-local or
 * reserved; only `https:`.
 */

export type FramePolicy = "allowed" | "blocked" | "unknown";

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const)
  blocked.addSubnet(net, prefix, "ipv6");

/** Whether `ip` is an address on the public internet. */
export function isPublicAddress(ip: string): boolean {
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return isPublicAddress(mapped[1]);
  const family = isIP(ip);
  if (family === 0) return false;
  return !blocked.check(ip, family === 4 ? "ipv4" : "ipv6");
}

type LookupCallback = (
  err: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** `dns.lookup` that refuses to hand over anything but public addresses. */
function publicLookup(
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: LookupCallback,
) {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, []);
    const list = addresses as LookupAddress[];
    if (list.length === 0 || !list.every((a) => isPublicAddress(a.address))) {
      const denied: NodeJS.ErrnoException = new Error(
        `Refusing non-public address for ${hostname}`,
      );
      denied.code = "EADDRNOTPUBLIC";
      return callback(denied, []);
    }
    if (options.all) return callback(null, list);
    callback(null, list[0].address, list[0].family);
  });
}

/** One request, headers only — the body is never read. */
function headOf(url: URL): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
}> {
  // An address written as an IP never goes through `lookup` — Node
  // connects to it directly — so it's checked here instead.
  const literal = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(literal) && !isPublicAddress(literal))
    return Promise.reject(new Error(`Refusing non-public address ${literal}`));
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        lookup: publicLookup as never,
        timeout: 4000,
        headers: {
          "user-agent": "Barynt embed check",
          accept: "text/html,*/*;q=0.8",
        },
      },
      (res) => {
        resolve({ status: res.statusCode ?? 0, headers: res.headers });
        res.destroy();
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

const one = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value.join(",") : (value ?? "");

/**
 * Whether headers allow framing on `origin`. `frame-ancestors` wins over
 * `X-Frame-Options` where both are present — as in every current browser.
 */
export function allowsFraming(
  headers: { xFrameOptions?: string; csp?: string },
  origin: string,
): boolean {
  const ancestors = (headers.csp ?? "")
    .split(/[,;]/)
    .map((d) => d.trim())
    .filter((d) => /^frame-ancestors(\s|$)/i.test(d))
    .map((d) => d.split(/\s+/).slice(1));
  if (ancestors.length > 0)
    // Several policies: each one must let it through.
    return ancestors.every((sources) =>
      sources.some((source) => sourceMatches(source, origin)),
    );
  const xfo = (headers.xFrameOptions ?? "").trim().toLowerCase();
  return xfo === "";
}

function sourceMatches(source: string, origin: string): boolean {
  const s = source.toLowerCase();
  if (s === "'none'" || s === "'self'") return false;
  if (s === "*") return true;
  const own = new URL(origin);
  if (s === "https:" || s === "http:") return own.protocol === s;
  const m = /^(?:([a-z][a-z0-9+.-]*):\/\/)?(\*\.)?([^/:]+)(?::(\d+|\*))?/.exec(
    s,
  );
  if (!m) return false;
  const [, scheme, wildcard, host, port] = m;
  if (scheme && `${scheme}:` !== own.protocol) return false;
  if (port && port !== "*" && port !== (own.port || defaultPort(own))) {
    return false;
  }
  return wildcard ? own.hostname.endsWith(`.${host}`) : own.hostname === host;
}

const defaultPort = (url: URL) => (url.protocol === "https:" ? "443" : "80");

const cache = new Map<string, { at: number; policy: FramePolicy }>();
const TTL = 30 * 60 * 1000;

/**
 * Fetches `url` (following up to three redirects, each checked the same
 * way) and reads whether it may be framed on `origin`. `unknown` when it
 * can't be reached from here — an intranet page, say, that the viewer's
 * browser may well reach; the widget then tries anyway.
 */
export async function framePolicy(
  url: string,
  origin: string,
): Promise<FramePolicy> {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL) return hit.policy;

  let policy: FramePolicy = "unknown";
  try {
    let current = new URL(url);
    for (let hop = 0; hop < 4; hop++) {
      if (current.protocol !== "https:") break;
      const { status, headers } = await headOf(current);
      const location = one(headers.location);
      if (status >= 300 && status < 400 && location) {
        current = new URL(location, current);
        continue;
      }
      const framing = {
        xFrameOptions: one(headers["x-frame-options"]),
        csp: one(headers["content-security-policy"]),
      };
      // A refusal counts whatever the status (a 403 to an unknown client
      // still says it); no refusal only counts from a page that answered.
      if (framing.xFrameOptions || /frame-ancestors/i.test(framing.csp))
        policy = allowsFraming(framing, origin) ? "allowed" : "blocked";
      else if (status < 400) policy = "allowed";
      break;
    }
  } catch {
    policy = "unknown";
  }

  if (cache.size > 500) cache.clear();
  cache.set(url, { at: Date.now(), policy });
  return policy;
}
