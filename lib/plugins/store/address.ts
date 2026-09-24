import { isIP } from "node:net";

// Whether an address is one on the public internet. A store's address and a plugin's
// download link are written by other people, so the instance does not connect to whatever
// they name: not to itself, not to the network behind it (a database, a cloud metadata
// service, an admin panel). Pure: it looks at the address only; asking DNS is `fetch.ts`.

// The parsers below are only given text that `isIP` accepted (see `isPublicAddress`, the one
// way in), so they do not check the shape again: what they get is a well-formed address.

/** `a.b.c.d` as a number. */
function v4(address: string): number {
  return address
    .split(".")
    .reduce((value, part) => value * 256 + Number(part), 0);
}

/** [address, prefix length] of every IPv4 range that is not the public internet. */
const V4_BLOCKED: readonly (readonly [string, number])[] = [
  ["0.0.0.0", 8], // this network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // carrier-grade NAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // protocol assignments
  ["192.0.2.0", 24], // documentation
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // documentation
  ["203.0.113.0", 24], // documentation
  ["224.0.0.0", 3], // multicast, reserved and the broadcast address
];

function inV4(value: number, [base, bits]: readonly [string, number]): boolean {
  const start = v4(base);
  return value >= start && value < start + 2 ** (32 - bits);
}

/** Whether the IPv4 address `value` (as a number) is not in any of the ranges above. */
function isPublicV4(value: number): boolean {
  return !V4_BLOCKED.some((range) => inV4(value, range));
}

/** The eight 16-bit groups of an IPv6 address. */
function v6(address: string): number[] {
  let text = address;
  // A zone (`fe80::1%eth0`) does not change what the address is.
  const zone = text.indexOf("%");
  if (zone >= 0) text = text.slice(0, zone);
  // The last 32 bits may be written as an IPv4 address.
  const dotted = text.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const embedded = v4(dotted[2] as string);
    text = `${dotted[1]}${(embedded >>> 16).toString(16)}:${(embedded & 0xffff).toString(16)}`;
  }
  // `::` stands for as many groups of zeros as are missing.
  const halves = text.split("::");
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves[1] ? halves[1].split(":") : [];
  const zeros = 8 - head.length - tail.length;
  return [...head, ...Array(zeros).fill("0"), ...tail].map((group) =>
    Number.parseInt(group, 16),
  );
}

/**
 * IPv6 is handed out from 2000::/3 and from nowhere else; loopback, unique local, link-local,
 * multicast and everything not yet assigned are outside it, so they are refused without being
 * listed one by one. These are the parts of it that are not the internet either.
 */
const V6_BLOCKED: readonly (readonly [string, number])[] = [
  ["2001::", 23], // protocol assignments: Teredo, benchmarking, ORCHID
  ["2001:db8::", 32], // documentation
  ["3fff::", 20], // documentation
];

/** Whether the first `bits` bits of `a` and `b` are the same. */
function samePrefix(a: number[], b: number[], bits: number): boolean {
  let left = bits;
  for (let i = 0; left > 0; i++) {
    const take = Math.min(16, left);
    const shift = 16 - take;
    if ((a[i] as number) >> shift !== (b[i] as number) >> shift) return false;
    left -= take;
  }
  return true;
}

function isPublicV6(address: string): boolean {
  const groups = v6(address);
  const startsWith = (...prefix: number[]) =>
    prefix.every((group, i) => groups[i] === group);
  // The IPv4 address that the two groups from `from` on make up.
  const embedded = (from: number) =>
    (groups[from] as number) * 65536 + (groups[from + 1] as number);
  // IPv4 written inside an IPv6 address is judged as the IPv4 address it carries:
  // `::ffff:10.0.0.1` is 10.0.0.1, `64:ff9b::/96` (NAT64) and `2002::/16` (6to4) likewise.
  if (
    startsWith(0, 0, 0, 0, 0, 0xffff) ||
    startsWith(0x64, 0xff9b, 0, 0, 0, 0)
  ) {
    return isPublicV4(embedded(6));
  }
  if (startsWith(0x2002)) return isPublicV4(embedded(1));
  if (!samePrefix(groups, v6("2000::"), 3)) return false;
  return !V6_BLOCKED.some(([base, bits]) => samePrefix(groups, v6(base), bits));
}

/**
 * Whether `address` (as text, IPv4 or IPv6) is a public internet address. Anything that is
 * not an address at all is not; that is `isIP`'s call, so a name, a number a resolver might
 * read as an address (`2130706433`, `0x7f.1`) and anything with more in it is refused.
 */
export function isPublicAddress(address: string): boolean {
  const text = address.trim().replace(/^\[|\]$/g, "");
  switch (isIP(text)) {
    case 4:
      return isPublicV4(v4(text));
    case 6:
      return isPublicV6(text);
    default:
      return false;
  }
}
