import { describe, expect, it, mock, spyOn } from "bun:test";
import { safeDownload } from "@/lib/plugins/store/fetch";

// Downloading what another person named. What matters: nothing that reaches the instance's
// own network is fetched, whatever the name, the redirects or the port say; a token goes to
// the host it was given for and no further; size and time are limited; and nothing throws.
// No network is used: `fetch` and DNS are replaced.

const PUBLIC = ["93.184.216.34"];

type Handler = (url: string, init: RequestInit) => Response | Promise<Response>;
const bytes = (text: string) => new TextEncoder().encode(text);

function stream(
  chunks: Uint8Array[],
  opts: { hang?: boolean; onCancel?: () => void } = {},
) {
  let i = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      if (i < chunks.length) controller.enqueue(chunks[i++] as Uint8Array);
      else if (opts.hang) return new Promise(() => {});
      else controller.close();
    },
    cancel() {
      opts.onCancel?.();
    },
  });
}

function setup(handler: Handler, lookups: Record<string, string[]> = {}) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchMock = mock(async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    return handler(url, init);
  });
  const lookupMock = mock(async (host: string) => {
    const found = lookups[host] ?? PUBLIC;
    return found;
  });
  return {
    deps: { fetch: fetchMock, lookup: lookupMock },
    calls,
    fetchMock,
    lookupMock,
  };
}

const ok = (text = "hello") => new Response(bytes(text), { status: 200 });
const redirect = (to: string, status = 302) =>
  new Response(null, { status, headers: { location: to } });
const LIMITS = { maxBytes: 1000 };

describe("a download that is fine", () => {
  it("gives the bytes and where they came from", async () => {
    const { deps } = setup(() => ok("archive"));
    const result = await safeDownload(
      "https://example.com/a.tgz",
      LIMITS,
      deps,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.toString()).toBe("archive");
    expect(result.url).toBe("https://example.com/a.tgz");
  });

  it("asks with GET, does not follow redirects by itself, and can be stopped", async () => {
    const { deps, calls } = setup(() => ok());
    await safeDownload("https://example.com/a.tgz", LIMITS, deps);
    expect(calls[0]?.init.method).toBe("GET");
    expect(calls[0]?.init.redirect).toBe("manual");
    expect(calls[0]?.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("sends the headers it was given", async () => {
    const { deps, calls } = setup(() => ok());
    await safeDownload(
      "https://example.com/a.tgz",
      {
        ...LIMITS,
        headers: { "user-agent": "Barynt" },
        credentialHeaders: { authorization: "Bearer T" },
      },
      deps,
    );
    expect(calls[0]?.init.headers).toEqual({
      "user-agent": "Barynt",
      authorization: "Bearer T",
    });
  });

  it("accepts exactly the most it allows", async () => {
    const { deps } = setup(
      () => new Response(stream([new Uint8Array(1000)]), { status: 200 }),
    );
    const result = await safeDownload(
      "https://example.com/a.tgz",
      LIMITS,
      deps,
    );
    expect(result.ok).toBe(true);
  });

  it("gives an empty file as an empty file", async () => {
    const { deps } = setup(() => new Response(null, { status: 200 }));
    const result = await safeDownload(
      "https://example.com/a.tgz",
      LIMITS,
      deps,
    );
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.data.length).toBe(0);
  });
});

describe("an address that is refused before anything is asked", () => {
  it.each([
    ["not a URL", "not a url", "invalid-url"],
    ["nothing", "", "invalid-url"],
    ["http", "http://example.com/a.tgz", "invalid-url"],
    ["ftp", "ftp://example.com/a.tgz", "invalid-url"],
    ["a file", "file:///etc/passwd", "invalid-url"],
    ["a data URL", "data:text/plain;base64,aGk=", "invalid-url"],
    ["credentials", "https://user:pass@example.com/a.tgz", "invalid-url"],
    ["a user name only", "https://user@example.com/a.tgz", "invalid-url"],
    ["a password only", "https://:secret@example.com/a.tgz", "invalid-url"],
    ["another port", "https://example.com:8443/a.tgz", "invalid-url"],
    ["the standard port, written out", "https://example.com:443/a.tgz", null],
    ["an IPv4 number", "https://93.184.216.34/a.tgz", "invalid-url"],
    ["loopback as a number", "https://127.0.0.1/a.tgz", "invalid-url"],
    ["an IPv6 number", "https://[2606:4700::1111]/a.tgz", "invalid-url"],
    [
      "a number written as one integer",
      "https://2130706433/a.tgz",
      "invalid-url",
    ],
    ["a number written in hex", "https://0x7f000001/a.tgz", "invalid-url"],
  ])("refuses %s", async (_n, address, code) => {
    const { deps, fetchMock } = setup(() => ok());
    const result = await safeDownload(address, LIMITS, deps);
    if (code === null) {
      expect(result.ok).toBe(true);
      return;
    }
    expect(result).toMatchObject({ ok: false, code });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not throw for what is not text", async () => {
    const { deps } = setup(() => ok());
    for (const value of [undefined, null, 42, {}, []]) {
      const result = await safeDownload(value as never, LIMITS, deps);
      expect(result.ok).toBe(false);
    }
  });
});

describe("a name that leads inside", () => {
  it.each([
    ["loopback", ["127.0.0.1"]],
    ["a private network", ["10.0.0.5"]],
    ["the cloud metadata address", ["169.254.169.254"]],
    ["IPv6 loopback", ["::1"]],
    ["a private IPv4 in an IPv6 address", ["::ffff:192.168.0.1"]],
    ["one good and one private address", ["93.184.216.34", "10.0.0.5"]],
    ["no address at all", []],
  ])(
    "is refused when it resolves to %s, and nothing is asked",
    async (_n, addresses) => {
      const { deps, fetchMock } = setup(() => ok(), {
        "evil.example.com": addresses,
      });
      const result = await safeDownload(
        "https://evil.example.com/a.tgz",
        LIMITS,
        deps,
      );
      expect(result).toMatchObject({ ok: false, code: "blocked-address" });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("is refused, as a network problem, when the name cannot be resolved", async () => {
    const fetchMock = mock(async () => ok());
    const result = await safeDownload(
      "https://nope.example.com/a.tgz",
      LIMITS,
      {
        fetch: fetchMock,
        lookup: async () => {
          throw new Error("ENOTFOUND");
        },
      },
    );
    expect(result).toMatchObject({ ok: false, code: "network" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not say the address it found, only the name", async () => {
    const { deps } = setup(() => ok(), { "evil.example.com": ["10.1.2.3"] });
    const result = await safeDownload(
      "https://evil.example.com/a.tgz",
      LIMITS,
      deps,
    );
    expect(result.ok === false && result.error).not.toContain("10.1.2.3");
  });
});

describe("redirects", () => {
  it("follows them, one after the other, and gives the address it ended at", async () => {
    const { deps, calls } = setup((url) =>
      url.endsWith("/a.tgz")
        ? redirect("https://cdn.example.com/b.tgz")
        : url.endsWith("/b.tgz")
          ? redirect("/c.tgz")
          : ok("done"),
    );
    const result = await safeDownload(
      "https://example.com/a.tgz",
      LIMITS,
      deps,
    );
    expect(result).toMatchObject({
      ok: true,
      url: "https://cdn.example.com/c.tgz",
    });
    expect(calls.map((c) => c.url)).toEqual([
      "https://example.com/a.tgz",
      "https://cdn.example.com/b.tgz",
      "https://cdn.example.com/c.tgz",
    ]);
  });

  it("checks every hop: a redirect to http, to another port, to a number or to a name that leads inside is refused", async () => {
    for (const target of [
      "http://example.com/x.tgz",
      "https://example.com:8080/x.tgz",
      "https://127.0.0.1/x.tgz",
      "https://user:pw@example.com/x.tgz",
      "https://inside.example.com/x.tgz",
    ]) {
      const { deps, calls } = setup(
        (url) => (url.includes("/a.tgz") ? redirect(target) : ok()),
        { "inside.example.com": ["10.0.0.9"] },
      );
      const result = await safeDownload(
        "https://example.com/a.tgz",
        LIMITS,
        deps,
      );
      expect(result.ok).toBe(false);
      expect(calls).toHaveLength(1);
    }
  });

  it("sends the credentials to the host that was asked, also after a redirect on that host, and to no other", async () => {
    const { deps, calls } = setup((url) =>
      url === "https://api.example.com/tarball"
        ? redirect("https://api.example.com/again")
        : url === "https://api.example.com/again"
          ? redirect("https://codeload.example.com/x.tgz")
          : ok(),
    );
    await safeDownload(
      "https://api.example.com/tarball",
      {
        ...LIMITS,
        headers: { "user-agent": "B" },
        credentialHeaders: { authorization: "Bearer T" },
      },
      deps,
    );
    expect(calls.map((c) => c.init.headers)).toEqual([
      { "user-agent": "B", authorization: "Bearer T" },
      { "user-agent": "B", authorization: "Bearer T" },
      { "user-agent": "B" },
    ]);
  });

  it("does not send the credentials back to the first host once it left, either", async () => {
    const { deps, calls } = setup((url) =>
      url === "https://a.example.com/x"
        ? redirect("https://b.example.com/x")
        : url === "https://b.example.com/x"
          ? redirect("https://a.example.com/y")
          : ok(),
    );
    await safeDownload(
      "https://a.example.com/x",
      { ...LIMITS, credentialHeaders: { authorization: "Bearer T" } },
      deps,
    );
    expect(
      calls.map((c) =>
        Boolean((c.init.headers as Record<string, string>).authorization),
      ),
    ).toEqual([true, false, true]);
  });

  // The server redirects for ever as far as the limit is concerned, but it does stop, so that
  // a download without a limit fails these tests instead of never finishing.
  const forAWhile = () => {
    let count = 0;
    return (url: string) => (++count > 50 ? ok() : redirect(`${url}x`));
  };

  it("stops after the redirects it allows", async () => {
    const { deps, calls } = setup(forAWhile());
    const result = await safeDownload(
      "https://example.com/a",
      { ...LIMITS, maxRedirects: 3 },
      deps,
    );
    expect(result).toMatchObject({ ok: false, code: "redirects" });
    expect(calls).toHaveLength(4);
  });

  it("stops after five by default", async () => {
    const { deps, calls } = setup(forAWhile());
    await safeDownload("https://example.com/a", LIMITS, deps);
    expect(calls).toHaveLength(6);
  });

  it("is refused when it redirects without saying where", async () => {
    const { deps } = setup(() => new Response(null, { status: 302 }));
    expect(
      await safeDownload("https://example.com/a", LIMITS, deps),
    ).toMatchObject({ ok: false, code: "http" });
  });

  it.each([300, 301, 302, 303, 307, 308, 399])(
    "follows a %i",
    async (status) => {
      const { deps } = setup((url) =>
        url.endsWith("/a") ? redirect("/b", status) : ok("x"),
      );
      expect(
        await safeDownload("https://example.com/a", LIMITS, deps),
      ).toMatchObject({ ok: true });
    },
  );
});

describe("what the server answers", () => {
  it.each([201, 202, 204, 206, 299, 400, 401, 403, 404, 429, 500, 503])(
    "is refused for %i, with the status",
    async (status) => {
      const { deps } = setup(() => new Response(null, { status }));
      const result = await safeDownload("https://example.com/a", LIMITS, deps);
      expect(result).toMatchObject({ ok: false, code: "http" });
      expect(result.ok === false && result.error).toContain(String(status));
    },
  );

  it("does not follow a 400 that has a location, which is not a redirect", async () => {
    const { deps, fetchMock } = setup(
      () => new Response(null, { status: 400, headers: { location: "/b" } }),
    );
    expect(
      await safeDownload("https://example.com/a", LIMITS, deps),
    ).toMatchObject({ ok: false, code: "http" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("lets go of the body of an answer it does not use, a redirect and an error alike", async () => {
    for (const [status, headers] of [
      [302, { location: "/b" }],
      [404, {}],
    ] as const) {
      let cancelled = false;
      const { deps } = setup((url) =>
        url.endsWith("/b")
          ? ok()
          : new Response(
              new ReadableStream({
                pull() {},
                cancel() {
                  cancelled = true;
                },
              }),
              { status, headers },
            ),
      );
      await safeDownload("https://example.com/a", LIMITS, deps);
      expect(cancelled).toBe(true);
    }
  });
});

describe("size, at the limit", () => {
  it("takes a file of exactly the limit, whether or not it says how long it is", async () => {
    const body = "x".repeat(1000);
    const { deps } = setup(
      () =>
        new Response(bytes(body), {
          status: 200,
          headers: { "content-length": "1000" },
        }),
    );
    const result = await safeDownload("https://example.com/a", LIMITS, deps);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.data.length).toBe(1000);
    const { deps: silent } = setup(() => new Response(stream([bytes(body)])));
    expect(
      await safeDownload("https://example.com/a", LIMITS, silent),
    ).toMatchObject({ ok: true });
  });

  it("takes a file that says nothing about its length, or something that is no number", async () => {
    const { deps } = setup(
      () =>
        new Response(bytes("hi"), {
          status: 200,
          headers: { "content-length": "many" },
        }),
    );
    expect(
      await safeDownload("https://example.com/a", LIMITS, deps),
    ).toMatchObject({ ok: true });
  });
});

describe("size", () => {
  it("refuses a file that says it is too large, and lets go of it without reading it", async () => {
    let cancelled = false;
    const { deps } = setup(
      () =>
        new Response(
          new ReadableStream({
            pull() {},
            cancel() {
              cancelled = true;
            },
          }),
          { status: 200, headers: { "content-length": "1001" } },
        ),
    );
    expect(
      await safeDownload("https://example.com/a", LIMITS, deps),
    ).toMatchObject({ ok: false, code: "too-large" });
    expect(cancelled).toBe(true);
  });

  it("stops reading a file that turns out too large, without a length, and lets go of it", async () => {
    let cancelled = false;
    let pulled = 0;
    const { deps } = setup(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pulled += 1;
              // Endless as far as the limit is concerned, but it does end, so that a
              // download without a limit fails this test instead of never finishing.
              if (pulled > 50) controller.close();
              else controller.enqueue(new Uint8Array(400));
            },
            cancel() {
              cancelled = true;
            },
          }),
          { status: 200 },
        ),
    );
    expect(
      await safeDownload("https://example.com/a", LIMITS, deps),
    ).toMatchObject({ ok: false, code: "too-large" });
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
  });

  it("does not trust a length that lies low", async () => {
    const { deps } = setup(
      () =>
        new Response(stream([new Uint8Array(600), new Uint8Array(600)]), {
          status: 200,
          headers: { "content-length": "10" },
        }),
    );
    expect(
      await safeDownload("https://example.com/a", LIMITS, deps),
    ).toMatchObject({ ok: false, code: "too-large" });
  });
});

describe("time", () => {
  it("allows a minute unless told otherwise, and what it is told otherwise", async () => {
    const timeout = spyOn(AbortSignal, "timeout");
    try {
      const { deps } = setup(() => ok());
      await safeDownload("https://example.com/a", LIMITS, deps);
      expect(timeout).toHaveBeenLastCalledWith(60_000);
      await safeDownload(
        "https://example.com/a",
        { ...LIMITS, timeoutMs: 1234 },
        deps,
      );
      expect(timeout).toHaveBeenLastCalledWith(1234);
    } finally {
      timeout.mockRestore();
    }
  });

  it("gives up on a server that never answers", async () => {
    const { deps } = setup(
      (_url, init) =>
        new Promise<Response>((_res, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );
    const started = Date.now();
    const result = await safeDownload(
      "https://example.com/a",
      { ...LIMITS, timeoutMs: 50 },
      deps,
    );
    expect(result).toMatchObject({ ok: false, code: "timeout" });
    expect(Date.now() - started).toBeLessThan(2000);
  });

  it("gives up on a body that stops coming", async () => {
    let cancelled = false;
    const { deps } = setup(
      () =>
        new Response(
          stream([bytes("start")], {
            hang: true,
            onCancel: () => {
              cancelled = true;
            },
          }),
          { status: 200 },
        ),
    );
    const result = await safeDownload(
      "https://example.com/a",
      { ...LIMITS, timeoutMs: 50 },
      deps,
    );
    expect(result).toMatchObject({ ok: false, code: "timeout" });
    expect(cancelled).toBe(true);
  });

  it("counts the redirects in the time it allows", async () => {
    const { deps } = setup(async (url) => {
      await new Promise((r) => setTimeout(r, 40));
      return url.endsWith("/a")
        ? redirect("/b")
        : url.endsWith("/b")
          ? redirect("/c")
          : ok();
    });
    const result = await safeDownload(
      "https://example.com/a",
      { ...LIMITS, timeoutMs: 70 },
      deps,
    );
    expect(result.ok).toBe(false);
  });
});

describe("failures", () => {
  it("says which host could not be reached, and never throws", async () => {
    const { deps } = setup(() => {
      throw new TypeError("fetch failed: secret-detail");
    });
    const result = await safeDownload(
      "https://example.com/a",
      { ...LIMITS, credentialHeaders: { authorization: "Bearer SECRET" } },
      deps,
    );
    expect(result).toMatchObject({ ok: false, code: "network" });
    const text = JSON.stringify(result);
    expect(text).toContain("example.com");
    expect(text).toContain("TypeError");
    expect(text).not.toContain("SECRET");
    expect(text).not.toContain("secret-detail");
  });

  it("is a timeout, not a failure, when the body breaks because time ran out", async () => {
    const { deps } = setup(
      (_url, init) =>
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(bytes("start"));
              init.signal?.addEventListener("abort", () =>
                controller.error(new Error("aborted")),
              );
            },
            pull: () => new Promise(() => {}),
          }),
          { status: 200 },
        ),
    );
    expect(
      await safeDownload(
        "https://example.com/a",
        { ...LIMITS, timeoutMs: 50 },
        deps,
      ),
    ).toEqual({
      ok: false,
      error: "The download took too long.",
      code: "timeout",
    });
  });

  it("is a failure, and says nothing more, when the body breaks for another reason", async () => {
    const { deps } = setup(
      () =>
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.error(new Error("secret-detail"));
            },
          }),
          { status: 200 },
        ),
    );
    expect(await safeDownload("https://example.com/a", LIMITS, deps)).toEqual({
      ok: false,
      error: "The download failed.",
      code: "network",
    });
  });

  it("is a failure when a redirect leads to an address that cannot be made", async () => {
    const { deps } = setup(() => redirect("http://["));
    expect(
      await safeDownload("https://example.com/a", LIMITS, deps),
    ).toMatchObject({
      ok: false,
    });
  });

  it("uses the global fetch when it is not given another", async () => {
    const global = spyOn(globalThis, "fetch").mockResolvedValue(
      ok("from global"),
    );
    try {
      const result = await safeDownload("https://example.com/a", LIMITS, {
        lookup: async () => PUBLIC,
      });
      expect(result.ok && result.data.toString()).toBe("from global");
      expect(global).toHaveBeenCalledTimes(1);
    } finally {
      global.mockRestore();
    }
  });

  it("asks the system's own DNS when it is not given another, and does not go to what that says is inside", async () => {
    const fetchMock = mock(async () => ok());
    const result = await safeDownload("https://localhost/a", LIMITS, {
      fetch: fetchMock,
    });
    expect(result).toMatchObject({ ok: false, code: "blocked-address" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never carries a header in what it says, whatever failed", async () => {
    for (const handler of [
      () => new Response(null, { status: 500 }),
      () => redirect("http://x.example.com/"),
      () => new Response(new Uint8Array(2000), { status: 200 }),
    ]) {
      const { deps } = setup(handler);
      const result = await safeDownload(
        "https://example.com/a",
        { ...LIMITS, credentialHeaders: { authorization: "Bearer SECRET" } },
        deps,
      );
      expect(JSON.stringify(result)).not.toContain("SECRET");
    }
  });
});
