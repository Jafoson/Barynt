import { describe, expect, it, mock } from "bun:test";
import {
  archiveRequestFor,
  fetchStoreArchive,
  MAX_STORE_ARCHIVE_BYTES,
  styleOf,
} from "@/lib/plugins/store/transport";

// How a store's repository is fetched: the archive of its default branch over https, in the
// shape each kind of host has. What matters: the address that is built, the headers and where
// they go, that a token is never in the address, and that an address that is not a plain
// https repository address builds nothing.

const req = (
  url: string,
  token: string | null = null,
  user: string | null = null,
) => archiveRequestFor({ url, token, user });
const built = (
  url: string,
  token: string | null = null,
  user: string | null = null,
) => {
  const result = req(url, token, user);
  if (!result.ok) throw new Error(result.error);
  return result.request;
};

describe("the kind of host", () => {
  it.each([
    ["github.com", "github"],
    ["GitHub.com", "github"],
    ["gitlab.com", "gitlab"],
    ["gitlab.example.org", "gitlab"],
    ["bitbucket.org", "bitbucket"],
    ["codeberg.org", "gitea"],
    ["git.example.com", "gitea"],
    ["notgithub.com", "gitea"],
    ["github.com.evil.example", "gitea"],
    ["evilgitlab.com", "gitea"],
  ] as const)("is told from the name: %s is %s", (host, style) => {
    expect(styleOf(host)).toBe(style);
  });
});

describe("GitHub", () => {
  it("fetches a public repository from codeload, with no token and no credentials header", () => {
    const request = built("https://github.com/Jafoson/barynt-plugin-store");
    expect(request.url).toBe(
      "https://codeload.github.com/Jafoson/barynt-plugin-store/tar.gz/HEAD",
    );
    expect(request.credentialHeaders).toEqual({});
    expect(request.style).toBe("github");
  });

  it("takes `.git` and a trailing slash off the address", () => {
    expect(built("https://github.com/a-b/c-d.git/").url).toBe(
      "https://codeload.github.com/a-b/c-d/tar.gz/HEAD",
    );
  });

  it("fetches a private one through the API, with the token as a header for the API host only", () => {
    const request = built(
      "https://github.com/acme/private-plugins",
      "ghp_SECRET",
    );
    expect(request.url).toBe(
      "https://api.github.com/repos/acme/private-plugins/tarball",
    );
    expect(request.credentialHeaders).toEqual({
      authorization: "Bearer ghp_SECRET",
    });
    expect(request.headers["x-github-api-version"]).toBe("2022-11-28");
    expect(request.url).not.toContain("SECRET");
  });

  it("wants exactly an owner and a repository", () => {
    expect(req("https://github.com/acme").ok).toBe(false);
    expect(req("https://github.com/acme/repo/sub").ok).toBe(false);
  });
});

describe("GitLab", () => {
  it("fetches the archive of the default branch, and takes subgroups as they are", () => {
    expect(built("https://gitlab.com/group/sub/plugins").url).toBe(
      "https://gitlab.com/group/sub/plugins/-/archive/HEAD/plugins-HEAD.tar.gz",
    );
    expect(built("https://gitlab.example.org/a/b.git").url).toBe(
      "https://gitlab.example.org/a/b/-/archive/HEAD/b-HEAD.tar.gz",
    );
  });

  it("sends the token in the header GitLab knows for it, not in the address", () => {
    const request = built("https://gitlab.com/a/b", "glpat-SECRET");
    expect(request.credentialHeaders).toEqual({
      "private-token": "glpat-SECRET",
    });
    expect(request.url).not.toContain("SECRET");
  });
});

describe("Gitea, Forgejo and Codeberg", () => {
  it("is the default for a host that is none of the others", () => {
    expect(built("https://codeberg.org/acme/plugins").url).toBe(
      "https://codeberg.org/acme/plugins/archive/HEAD.tar.gz",
    );
    expect(built("https://git.example.com/acme/plugins").style).toBe("gitea");
  });

  it("sends the token as `token <token>`", () => {
    expect(built("https://codeberg.org/a/b", "T0K").credentialHeaders).toEqual({
      authorization: "token T0K",
    });
  });
});

describe("Bitbucket", () => {
  it("fetches the archive of the default branch", () => {
    expect(built("https://bitbucket.org/acme/plugins").url).toBe(
      "https://bitbucket.org/acme/plugins/get/HEAD.tar.gz",
    );
  });

  it("needs a user name with the token, and sends both as basic authentication", () => {
    const request = built(
      "https://bitbucket.org/acme/plugins",
      "app-pass",
      "mara",
    );
    expect(request.credentialHeaders).toEqual({
      authorization: `Basic ${Buffer.from("mara:app-pass").toString("base64")}`,
    });
    expect(req("https://bitbucket.org/acme/plugins", "app-pass").ok).toBe(
      false,
    );
  });

  it("needs no user name without a token", () => {
    expect(req("https://bitbucket.org/acme/plugins").ok).toBe(true);
  });
});

describe("every request", () => {
  it("says who is asking, and what it wants", () => {
    const request = built("https://github.com/a/b");
    expect(request.headers["user-agent"]).toMatch(/^Barynt\/\d+\.\d+\.\d+/);
    expect(request.headers.accept).toContain("gzip");
  });
});

describe("an address that builds nothing", () => {
  it.each([
    ["not a URL", "nope"],
    ["nothing", ""],
    ["http", "http://github.com/a/b"],
    ["ssh", "git@github.com:a/b.git"],
    ["a git address", "git://github.com/a/b"],
    ["credentials", "https://user:pw@github.com/a/b"],
    ["a port", "https://github.com:444/a/b"],
    ["a query", "https://github.com/a/b?x=1"],
    ["a fragment", "https://github.com/a/b#x"],
    ["one segment", "https://codeberg.org/a"],
    ["a dot segment", "https://codeberg.org/a/../b"],
    ["a segment with a space", "https://codeberg.org/a/b c"],
    ["a segment with a percent escape", "https://codeberg.org/a/%2e%2e"],
    ["a segment that starts with a dot", "https://codeberg.org/a/.hidden"],
    ["a segment that is too long", `https://codeberg.org/a/${"x".repeat(101)}`],
  ])("is refused: %s", (_n, url) => {
    expect(req(url).ok).toBe(false);
  });
});

describe("names of hosts and repositories, to the letter", () => {
  it("knows a host only by its whole name", () => {
    for (const host of [
      "notbitbucket.org",
      "bitbucket.org.evil.example",
      "bitbucket.org.",
      "github.com.evil.example",
      "notgithub.com",
      "mygitlab.example",
    ]) {
      expect(styleOf(host)).toBe("gitea");
    }
    expect(built("https://Bitbucket.ORG/a/b").style).toBe("bitbucket");
    expect(built("https://GitLab.com/a/b").style).toBe("gitlab");
  });

  it("takes an address entered with spaces around it, and with capitals in the host", () => {
    expect(built("  https://GITHUB.com/acme/plugins  ").url).toBe(
      "https://codeload.github.com/acme/plugins/tar.gz/HEAD",
    );
  });

  it("takes `.git` off the repository, in any case, and only off the repository, and only at its end", () => {
    expect(built("https://gitea.example/o/r.GIT").url).toContain(
      "/o/r/archive",
    );
    expect(built("https://gitea.example/o/r.Git/").url).toContain(
      "/o/r/archive",
    );
    expect(built("https://gitea.example/o.git/r").url).toContain(
      "/o.git/r/archive",
    );
    expect(built("https://gitea.example/o/my.gitrepo").url).toContain(
      "/o/my.gitrepo/archive",
    );
    expect(built("https://gitea.example/o/r.git.git").url).toContain(
      "/o/r.git/archive",
    );
  });

  it("takes names of 100 characters, with dots, dashes and underscores, and no more", () => {
    const long = "a".repeat(100);
    expect(req(`https://gitea.example/o/${long}`).ok).toBe(true);
    expect(req(`https://gitea.example/o/${long}x`).ok).toBe(false);
    expect(req("https://gitea.example/o/my_repo-1.x").ok).toBe(true);
    expect(req("https://gitea.example/o/_x").ok).toBe(true);
    expect(req("https://gitea.example/o/-x").ok).toBe(false);
    expect(req("https://gitea.example/o/.x").ok).toBe(false);
    expect(req("https://gitea.example/o/a%20b").ok).toBe(false);
  });

  it("refuses an address with credentials, one at a time", () => {
    expect(req("https://user@gitea.example/o/r").ok).toBe(false);
    expect(req("https://:secret@gitea.example/o/r").ok).toBe(false);
  });

  it("wants exactly a workspace and a repository at Bitbucket, with or without a token", () => {
    expect(req("https://bitbucket.org/a/b/c").ok).toBe(false);
    expect(req("https://bitbucket.org/a/b/c", "T", "u").ok).toBe(false);
    expect(req("https://bitbucket.org/a").ok).toBe(false);
  });
});

describe("fetching", () => {
  it("sends who is asking with the request, and the token to the host and to no other after a redirect", async () => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const result = await fetchStoreArchive(
      { url: "https://github.com/acme/plugins", token: "GH-TOKEN", user: null },
      {
        fetch: mock(async (url: string, init: RequestInit) => {
          calls.push({ url, headers: init.headers as Record<string, string> });
          return url.startsWith("https://api.github.com")
            ? new Response(null, {
                status: 302,
                headers: { location: "https://codeload.github.com/signed/abc" },
              })
            : new Response(new Uint8Array([1]), { status: 200 });
        }),
        lookup: async () => ["140.82.112.3"],
      },
    );
    expect(result).toMatchObject({ ok: true });
    expect(calls.map((c) => c.url)).toEqual([
      "https://api.github.com/repos/acme/plugins/tarball",
      "https://codeload.github.com/signed/abc",
    ]);
    expect(calls[0]?.headers.authorization).toBe("Bearer GH-TOKEN");
    expect(calls[0]?.headers["user-agent"]).toStartWith("Barynt/");
    expect(calls[1]?.headers.authorization).toBeUndefined();
    expect(calls[1]?.headers["user-agent"]).toStartWith("Barynt/");
    expect(JSON.stringify(calls[1])).not.toContain("GH-TOKEN");
  });

  it("takes an archive of exactly 64 MiB, and no more", async () => {
    const answer = (bytes: number) => ({
      fetch: async () =>
        new Response(null, {
          status: 200,
          headers: { "content-length": String(bytes) },
        }),
      lookup: async () => ["93.184.216.34"],
    });
    const source = {
      url: "https://codeberg.org/acme/plugins",
      token: null,
      user: null,
    };
    expect(
      await fetchStoreArchive(source, answer(64 * 1024 * 1024)),
    ).toMatchObject({ ok: true });
    expect(
      await fetchStoreArchive(source, answer(64 * 1024 * 1024 + 1)),
    ).toMatchObject({
      ok: false,
      code: "too-large",
    });
  });

  it("asks for the built address with its headers and the size limit, and gives the bytes", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const result = await fetchStoreArchive(
      { url: "https://codeberg.org/acme/plugins", token: "T0K", user: null },
      {
        fetch: mock(async (url: string, init: RequestInit) => {
          calls.push({ url, init });
          return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
        }),
        lookup: async () => ["93.184.216.34"],
      },
    );
    expect(result).toMatchObject({ ok: true });
    expect(calls[0]?.url).toBe(
      "https://codeberg.org/acme/plugins/archive/HEAD.tar.gz",
    );
    expect(
      (calls[0]?.init.headers as Record<string, string>).authorization,
    ).toBe("token T0K");
  });

  it("refuses an archive larger than a store may be", async () => {
    const result = await fetchStoreArchive(
      { url: "https://codeberg.org/acme/plugins", token: null, user: null },
      {
        fetch: async () =>
          new Response("x", {
            status: 200,
            headers: { "content-length": String(MAX_STORE_ARCHIVE_BYTES + 1) },
          }),
        lookup: async () => ["93.184.216.34"],
      },
    );
    expect(result).toMatchObject({ ok: false, code: "too-large" });
  });

  it("says why an address builds nothing, without asking anyone", async () => {
    const fetchMock = mock(async () => new Response("x"));
    const result = await fetchStoreArchive(
      { url: "http://x/y", token: null, user: null },
      { fetch: fetchMock },
    );
    expect(result).toMatchObject({ ok: false, code: "invalid-url" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not put the token into what it says when the host refuses", async () => {
    const result = await fetchStoreArchive(
      {
        url: "https://codeberg.org/acme/plugins",
        token: "T0K-SECRET",
        user: null,
      },
      {
        fetch: async () => new Response("no", { status: 401 }),
        lookup: async () => ["93.184.216.34"],
      },
    );
    expect(result.ok).toBe(false);
    expect(JSON.stringify(result)).not.toContain("SECRET");
  });
});
