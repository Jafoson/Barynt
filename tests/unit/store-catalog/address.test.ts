import { describe, expect, it } from "bun:test";
import { isPublicAddress } from "@/lib/plugins/store/address";

// The instance connects only to the public internet: not to itself, not to the network behind
// it. What matters is that every kind of address that reaches inside is refused, however it
// is written, and that what is on the internet is not.

describe("addresses on the public internet", () => {
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "140.82.112.3", // github.com
    "185.199.108.153",
    "172.15.255.255", // just below 172.16/12
    "172.32.0.0", // just above it
    "100.63.255.255", // just below 100.64/10
    "100.128.0.0", // just above it
    "223.255.255.254",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
    "2a00:1450:4001:81b::200e",
  ])("accepts %s", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });
});

// Each range that reaches inside, by its first and last address, and what lies right next to
// it. A range that is one bit too wide or too narrow shows here, not in the middle.
const V4_EDGES: [
  range: string,
  first: string,
  last: string,
  below: string,
  above: string,
][] = [
  ["0/8", "0.0.0.0", "0.255.255.255", "", "1.0.0.0"],
  ["10/8", "10.0.0.0", "10.255.255.255", "9.255.255.255", "11.0.0.0"],
  [
    "100.64/10",
    "100.64.0.0",
    "100.127.255.255",
    "100.63.255.255",
    "100.128.0.0",
  ],
  ["127/8", "127.0.0.0", "127.255.255.255", "126.255.255.255", "128.0.0.0"],
  [
    "169.254/16",
    "169.254.0.0",
    "169.254.255.255",
    "169.253.255.255",
    "169.255.0.0",
  ],
  ["172.16/12", "172.16.0.0", "172.31.255.255", "172.15.255.255", "172.32.0.0"],
  ["192.0.0/24", "192.0.0.0", "192.0.0.255", "191.255.255.255", "192.0.1.0"],
  ["192.0.2/24", "192.0.2.0", "192.0.2.255", "192.0.1.255", "192.0.3.0"],
  [
    "192.88.99/24",
    "192.88.99.0",
    "192.88.99.255",
    "192.88.98.255",
    "192.88.100.0",
  ],
  [
    "192.168/16",
    "192.168.0.0",
    "192.168.255.255",
    "192.167.255.255",
    "192.169.0.0",
  ],
  ["198.18/15", "198.18.0.0", "198.19.255.255", "198.17.255.255", "198.20.0.0"],
  [
    "198.51.100/24",
    "198.51.100.0",
    "198.51.100.255",
    "198.51.99.255",
    "198.51.101.0",
  ],
  [
    "203.0.113/24",
    "203.0.113.0",
    "203.0.113.255",
    "203.0.112.255",
    "203.0.114.0",
  ],
  ["224/3", "224.0.0.0", "255.255.255.255", "223.255.255.255", ""],
];

describe("the edges of each range", () => {
  it.each(V4_EDGES)(
    "%s: first and last are refused, both sides of it are not",
    (_range, first, last, below, above) => {
      expect(isPublicAddress(first)).toBe(false);
      expect(isPublicAddress(last)).toBe(false);
      if (below) expect(isPublicAddress(below)).toBe(true);
      if (above) expect(isPublicAddress(above)).toBe(true);
    },
  );

  it("refuses the rest of multicast and the reserved range between the two", () => {
    for (const address of [
      "230.1.2.3",
      "239.255.255.255",
      "240.0.0.0",
      "247.1.1.1",
      "250.9.9.9",
    ]) {
      expect(isPublicAddress(address)).toBe(false);
    }
  });

  // IPv6 is only handed out from 2000::/3; what is beside it is refused whole.
  it.each([
    ["2000::", true],
    ["2001:4860::1", true],
    ["2001:200::1", true], // just above 2001::/23
    ["2001:1ff:ffff:ffff:ffff:ffff:ffff:ffff", false], // the last of it
    ["2001:0:0:0:0:0:0:0", false], // the first of it
    ["2001:db7:ffff:ffff:ffff:ffff:ffff:ffff", true],
    ["2001:db8::", false],
    ["2001:db8:ffff:ffff:ffff:ffff:ffff:ffff", false],
    ["2001:db9::", true],
    ["3ffe:ffff::1", true],
    ["3fff::", false], // documentation, 3fff::/20
    ["3fff:fff:ffff::1", false],
    ["3fff:1000::", true],
    ["3fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", true],
    ["1fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", false], // just below 2000::/3
    ["4000::", false], // just above it
    ["8000::1", false],
    ["e000::1", false],
    ["::2", false],
    ["::a00:1", false], // IPv4-compatible, 10.0.0.1
    ["ff:ffff::", false],
    ["64:ff9b:1::1", false], // NAT64 for local use
    ["fe80::", false],
    ["febf:ffff::", false],
    ["fec0::1", false],
    ["fdff:ffff::1", false],
    ["fc00::", false],
  ])("the IPv6 address %s is public: %s", (address, expected) => {
    expect(isPublicAddress(address)).toBe(expected);
  });
});

describe("the same address, written in every way", () => {
  it.each([
    "::ffff:127.0.0.1",
    "::FFFF:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:7f00:0001",
    "0:0:0:0:0:ffff:7f00:1",
    "0000:0000:0000:0000:0000:ffff:127.0.0.1",
    "0::ffff:127.0.0.1",
    "0:0::ffff:7f00:1",
    "[::ffff:127.0.0.1]",
    "::ffff:127.0.0.1%eth0",
    "::ffff:198.51.100.7", // the third and fourth number count, too
    "::ffff:203.0.113.255",
    "::ffff:192.0.2.128",
    "::ffff:192.88.99.1",
    "::ffff:172.16.255.255",
    "64:ff9b::198.51.100.7",
    "2002:c633:6407::1",
  ])("%s is not public", (address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it.each([
    "::ffff:8.8.8.8",
    "::FFFF:808:808",
    "0:0:0:0:0:ffff:808:808",
    "64:ff9b::8.8.8.8",
    "64:ff9b:0:0:0:0:808:808",
    "0064:ff9b::808:808",
    "2002:808:808::",
    "2002:0808:0808:0:0:0:0:1",
    "2001:4860:4860::8888",
    "2001:4860:4860:0:0:0:0:8888",
    "2001:4860:4860:0000:0000:0000:0000:8888",
    "2A00:1450:4001:81B::200E",
    "::ffff:8.8.8.8%eth0",
    "::ffff:198.51.101.255",
    "::ffff:198.51.99.255",
    "::ffff:203.0.114.0",
    "::ffff:9.255.255.255",
    "::ffff:223.255.255.255%1",
  ])("%s is public", (address) => {
    expect(isPublicAddress(address)).toBe(true);
  });

  it("does not let something that is not mapped, NAT64 or 6to4 pass for it", () => {
    // Same groups but for one: none of them carries an IPv4 address.
    expect(isPublicAddress("0:0:0:0:1:ffff:808:808")).toBe(false);
    expect(isPublicAddress("0:0:0:1:0:ffff:808:808")).toBe(false);
    expect(isPublicAddress("0:0:1:0:0:ffff:808:808")).toBe(false);
    expect(isPublicAddress("0:1:0:0:0:ffff:808:808")).toBe(false);
    expect(isPublicAddress("1:0:0:0:0:ffff:808:808")).toBe(false);
    expect(isPublicAddress("0:0:0:0:0:fffe:808:808")).toBe(false);
    expect(isPublicAddress("0:0:0:0:0:0:808:808")).toBe(false);
    expect(isPublicAddress("64:ff9a::808:808")).toBe(false);
    expect(isPublicAddress("65:ff9b::808:808")).toBe(false);
    expect(isPublicAddress("64:ff9b:0:0:0:1:808:808")).toBe(false);
    expect(isPublicAddress("64:ff9b:0:0:1:0:808:808")).toBe(false);
    expect(isPublicAddress("64:ff9b:0:1:0:0:808:808")).toBe(false);
    expect(isPublicAddress("64:ff9b:1:0:0:0:808:808")).toBe(false);
    expect(isPublicAddress("2003:808:808::")).toBe(true); // an ordinary address, no 6to4
  });
});

describe("addresses that reach inside", () => {
  it.each([
    ["this network", "0.0.0.0"],
    ["this network, elsewhere in it", "0.1.2.3"],
    ["loopback", "127.0.0.1"],
    ["loopback, elsewhere in it", "127.255.255.254"],
    ["private 10/8", "10.0.0.1"],
    ["private 10/8, the end", "10.255.255.255"],
    ["private 172.16/12", "172.16.0.1"],
    ["private 172.16/12, the end", "172.31.255.255"],
    ["private 192.168/16", "192.168.1.1"],
    ["link-local, and where cloud metadata is", "169.254.169.254"],
    ["carrier-grade NAT", "100.64.0.1"],
    ["carrier-grade NAT, the end", "100.127.255.255"],
    ["documentation", "192.0.2.10"],
    ["documentation", "198.51.100.7"],
    ["documentation", "203.0.113.9"],
    ["benchmarking", "198.19.255.255"],
    ["multicast", "224.0.0.1"],
    ["reserved", "240.0.0.1"],
    ["broadcast", "255.255.255.255"],
    ["IPv6 unspecified", "::"],
    ["IPv6 loopback", "::1"],
    ["IPv6 loopback, long", "0:0:0:0:0:0:0:1"],
    ["IPv6 unique local", "fd00::1"],
    ["IPv6 unique local", "fc00::1"],
    ["IPv6 link-local", "fe80::1"],
    ["IPv6 link-local with a zone", "fe80::1%eth0"],
    ["IPv6 multicast", "ff02::1"],
    ["IPv6 documentation", "2001:db8::1"],
    ["Teredo", "2001:0:4136:e378:8000:63bf:3fff:fdd2"],
    ["IPv6 discard", "100::1"],
    ["IPv4 in IPv6, loopback", "::ffff:127.0.0.1"],
    ["IPv4 in IPv6, private", "::ffff:10.0.0.1"],
    ["IPv4 in IPv6, metadata, in hex", "::ffff:a9fe:a9fe"],
    ["NAT64 of a private address", "64:ff9b::a00:1"],
    ["6to4 of a private address", "2002:c0a8:101::1"],
    ["6to4 of loopback", "2002:7f00:1::"],
  ])("refuses %s: %s", (_name, address) => {
    expect(isPublicAddress(address)).toBe(false);
  });

  it("accepts an IPv4 address written in an IPv6 address when it is public", () => {
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true);
    expect(isPublicAddress("64:ff9b::808:808")).toBe(true);
    expect(isPublicAddress("2002:808:808::1")).toBe(true);
  });

  it("takes an IPv6 address in brackets, as it stands in a URL", () => {
    expect(isPublicAddress("[::1]")).toBe(false);
    expect(isPublicAddress("[2606:4700:4700::1111]")).toBe(true);
  });
});

describe("what is not an address", () => {
  it.each([
    "",
    "localhost",
    "example.com",
    "999.1.1.1",
    "1.2.3",
    "1.2.3.4.5",
    "08.8.8.8x",
    "0x7f.0.0.1",
    "2130706433", // 127.0.0.1 as one number
    "017700000001",
    "::gggg",
    "1:2:3:4:5:6:7:8:9",
    ":::",
    "8.8.8.8/8",
    "8.8.8.8 ",
    "http://8.8.8.8",
  ])("is refused: %j", (address) => {
    // A name is not an address, and a number that a resolver might read as one is not either.
    expect(
      isPublicAddress(
        address.trim() === address ? address : address.replace(/\s+$/, "x"),
      ),
    ).toBe(false);
  });

  it("ignores space around a real address", () => {
    expect(isPublicAddress(" 8.8.8.8 ")).toBe(true);
    expect(isPublicAddress(" 127.0.0.1 ")).toBe(false);
  });
});
