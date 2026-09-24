import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  lstat,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  symlink,
  utimes,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { storeCloneDir } from "@/lib/plugins/store/paths";
import { readStoreDirectory } from "@/lib/plugins/store/reader";
import { removeStoreClone, syncStoreClone } from "@/lib/plugins/store/sync";
import { storeArchive } from "../store-support/storeArchive";
import { entry, tgz } from "../store-support/tarBuilder";

// Bringing a store's clone up to date. What matters: what arrives replaces the clone only
// when it is a store, whatever goes wrong the clone that was there is left as it was, and
// nothing is left behind. The disk is real; the download is a replaced `fetch`.

const KEY = "github.com/acme/plugins";
const SOURCE = {
  url: "https://github.com/acme/plugins",
  token: null,
  user: null,
};
const PUBLIC = ["140.82.112.3"];

let root: string;
let dir: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "barynt-sync-"));
  dir = join(root, "plugins");
  await mkdir(dir);
});
afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const serving = (body: Buffer | (() => Buffer | Response)) => ({
  fetch: mock(async () => {
    const value = typeof body === "function" ? body() : body;
    return value instanceof Response
      ? value
      : new Response(new Uint8Array(value), { status: 200 });
  }),
  lookup: async () => PUBLIC,
});
const sync = (deps: Parameters<typeof syncStoreClone>[1]) =>
  syncStoreClone({ pluginsDir: dir, key: KEY, source: SOURCE }, deps);
const clone = () => storeCloneDir(dir, KEY);
const idsIn = async () => {
  const snapshot = await readStoreDirectory(clone());
  return snapshot.ok ? snapshot.entries.map((e) => e.id) : snapshot.error;
};
const inStores = async () => (await readdir(join(dir, ".stores"))).sort();

describe("a store that is fetched", () => {
  it("becomes the clone, readable as a store, and says what it holds", async () => {
    const result = await sync(
      serving(storeArchive({ plugins: [{ id: "notes" }, { id: "wiki" }] })),
    );
    expect(result).toEqual({ ok: true, entries: 2, problems: 0 });
    expect(await idsIn()).toEqual(["notes", "wiki"]);
  });

  it("leaves nothing but the clone in the store directory", async () => {
    await sync(serving(storeArchive({ plugins: [{ id: "notes" }] })));
    expect(await inStores()).toEqual([clone().split("/").pop() as string]);
  });

  it("replaces the clone that was there, and nothing of the old one stays", async () => {
    await sync(
      serving(storeArchive({ plugins: [{ id: "notes" }, { id: "wiki" }] })),
    );
    const result = await sync(
      serving(storeArchive({ plugins: [{ id: "board" }] })),
    );
    expect(result).toEqual({ ok: true, entries: 1, problems: 0 });
    expect(await idsIn()).toEqual(["board"]);
    expect(await inStores()).toHaveLength(1);
  });

  it("counts an entry that cannot be used, and still takes the store", async () => {
    const result = await sync(
      serving(
        storeArchive({
          plugins: [{ id: "notes" }, { id: "broken", noSource: true }],
        }),
      ),
    );
    expect(result).toEqual({ ok: true, entries: 1, problems: 1 });
    expect(await idsIn()).toEqual(["notes"]);
  });

  it("makes the plugin directory when it is not there yet", async () => {
    const later = join(root, "not", "yet");
    const result = await syncStoreClone(
      { pluginsDir: later, key: KEY, source: SOURCE },
      serving(storeArchive({ plugins: [{ id: "notes" }] })),
    );
    expect(result.ok).toBe(true);
  });

  it("asks for the archive of the store's address, with the token it was given", async () => {
    const deps = serving(storeArchive());
    await syncStoreClone(
      { pluginsDir: dir, key: KEY, source: { ...SOURCE, token: "T0K" } },
      deps,
    );
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = deps.fetch.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ];
    expect(url).toBe("https://api.github.com/repos/acme/plugins/tarball");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer T0K",
    );
  });

  it("gives the time it may take to the download", async () => {
    const result = await syncStoreClone(
      { pluginsDir: dir, key: KEY, source: SOURCE, timeoutMs: 30 },
      {
        fetch: (_url, init) =>
          new Promise<Response>((_res, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("aborted", "AbortError")),
            );
          }),
        lookup: async () => PUBLIC,
      },
    );
    expect(result).toEqual({
      ok: false,
      error: "The download took too long.",
      code: "download",
    });
  });
});

describe("what goes wrong leaves the clone as it was", () => {
  beforeEach(async () => {
    await sync(serving(storeArchive({ plugins: [{ id: "notes" }] })));
  });
  const stays = async () => {
    expect(await idsIn()).toEqual(["notes"]);
    expect(await inStores()).toHaveLength(1);
  };

  it("when the store cannot be reached", async () => {
    const result = await sync(
      serving(() => new Response("gone", { status: 404 })),
    );
    expect(result).toEqual({
      ok: false,
      error: "The server answered 404.",
      code: "download",
    });
    await stays();
  });

  it("when the address leads inside", async () => {
    const result = await sync({
      fetch: mock(async () => new Response("x")),
      lookup: async () => ["10.0.0.5"],
    });
    expect(result).toMatchObject({ ok: false, code: "download" });
    await stays();
  });

  it("when what came is not an archive", async () => {
    const result = await sync(serving(Buffer.from("<html>Not found</html>")));
    expect(result).toEqual({
      ok: false,
      error: "The store's archive is not a gzip archive.",
      code: "unusable",
    });
    await stays();
  });

  it("when the archive is no store", async () => {
    const result = await sync(
      serving(tgz(entry({ name: "r/README.md", data: "hello" }))),
    );
    expect(result).toEqual({
      ok: false,
      error: "The archive is no store: it has no store.json.",
      code: "unusable",
    });
    await stays();
  });

  it("when its store.json is not one", async () => {
    const result = await sync(
      serving(
        tgz(entry({ name: "r/store.json", data: '{"schemaVersion":99}' })),
      ),
    );
    expect(result).toMatchObject({ ok: false, code: "unusable" });
    expect(result.ok === false && result.error).toContain("Not a store");
    await stays();
  });

  it("when the archive is hostile", async () => {
    const result = await sync(
      serving(
        tgz(
          entry({ name: "r/store.json", data: "{}" }),
          entry({ name: "../x", data: "1" }),
        ),
      ),
    );
    expect(result).toMatchObject({ ok: false, code: "unusable" });
    await stays();
  });

  it("when the new clone cannot be moved in: the old one goes back", async () => {
    const result = await sync({
      ...serving(storeArchive({ plugins: [{ id: "board" }] })),
      beforeInstall: async (fresh) => {
        await rm(fresh, { recursive: true });
      },
    });
    expect(result).toMatchObject({
      ok: false,
      code: "disk",
      error: expect.stringContaining("could not be put in place"),
    });
    await stays();
  });
});

describe("the directory it works in", () => {
  it("does not go through a symlink in place of .stores", async () => {
    const elsewhere = join(root, "elsewhere");
    await mkdir(elsewhere);
    await symlink(elsewhere, join(dir, ".stores"));
    const result = await sync(
      serving(storeArchive({ plugins: [{ id: "notes" }] })),
    );
    expect(result).toEqual({
      ok: false,
      error: "The store directory is not a directory.",
      code: "disk",
    });
    expect(await readdir(elsewhere)).toEqual([]);
  });

  it("replaces a symlink where the clone should be, without following it", async () => {
    const elsewhere = join(root, "elsewhere");
    await mkdir(elsewhere);
    await writeFile(join(elsewhere, "keep.txt"), "mine");
    await mkdir(join(dir, ".stores"));
    await symlink(elsewhere, clone());
    const result = await sync(
      serving(storeArchive({ plugins: [{ id: "notes" }] })),
    );
    expect(result.ok).toBe(true);
    expect((await lstat(clone())).isDirectory()).toBe(true);
    expect(await readdir(elsewhere)).toEqual(["keep.txt"]);
  });

  it("says so when the plugin directory cannot be written", async () => {
    await writeFile(join(root, "file"), "x");
    const result = await syncStoreClone(
      { pluginsDir: join(root, "file"), key: KEY, source: SOURCE },
      serving(storeArchive()),
    );
    expect(result).toMatchObject({ ok: false, code: "disk" });
    expect(result.ok === false && result.error).toContain("cannot be written");
  });

  it("keeps what an earlier sync left when it is not an hour old yet: it may still be running", async () => {
    const stores = join(dir, ".stores");
    await mkdir(stores);
    const recent = new Date(Date.now() - 30 * 60 * 1000);
    const older = new Date(Date.now() - 61 * 60 * 1000);
    await mkdir(join(stores, ".tmp-recent"));
    await utimes(join(stores, ".tmp-recent"), recent, recent);
    await mkdir(join(stores, ".tmp-older"));
    await utimes(join(stores, ".tmp-older"), older, older);
    await sync(serving(storeArchive()));
    const names = await inStores();
    expect(names).toContain(".tmp-recent");
    expect(names).not.toContain(".tmp-older");
  });

  it("goes on clearing when something it looks at is not there any more", async () => {
    const stores = join(dir, ".stores");
    await mkdir(stores);
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (let i = 0; i < 6; i++) {
      // A link that points nowhere: `stat` cannot look at it.
      await symlink(join(root, "nowhere"), join(stores, `.tmp-dangling-${i}`));
      await mkdir(join(stores, `.tmp-old-${i}`));
      await utimes(join(stores, `.tmp-old-${i}`), old, old);
    }
    await sync(serving(storeArchive()));
    expect((await inStores()).filter((n) => n.startsWith(".tmp-old-"))).toEqual(
      [],
    );
  });

  it("clears what an earlier sync left when it is old, and only that", async () => {
    const stores = join(dir, ".stores");
    await mkdir(stores);
    const old = new Date(Date.now() - 2 * 60 * 60 * 1000);
    for (const name of [".tmp-old", "other-store-1234.old-99"]) {
      await mkdir(join(stores, name));
      await utimes(join(stores, name), old, old);
    }
    await mkdir(join(stores, ".tmp-fresh"));
    await mkdir(join(stores, "other-store-1234"));
    const cutOff = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await utimes(join(stores, "other-store-1234"), cutOff, cutOff);
    await sync(serving(storeArchive()));
    expect(await inStores()).toEqual(
      [
        ".tmp-fresh",
        "other-store-1234",
        clone().split("/").pop() as string,
      ].sort(),
    );
  });
});

describe("two syncs of the same store at once", () => {
  it("download it once and both get the result", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps = {
      fetch: mock(async () => {
        await gate;
        return new Response(
          new Uint8Array(storeArchive({ plugins: [{ id: "notes" }] })),
          {
            status: 200,
          },
        );
      }),
      lookup: async () => PUBLIC,
    };
    const first = sync(deps);
    const second = sync(deps);
    release?.();
    const [a, b] = await Promise.all([first, second]);
    expect(deps.fetch).toHaveBeenCalledTimes(1);
    expect(a).toEqual({ ok: true, entries: 1, problems: 0 });
    expect(b).toEqual(a);
  });

  it("of different stores each download their own", async () => {
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const deps = {
      fetch: mock(async () => {
        await gate;
        return new Response(new Uint8Array(storeArchive()), { status: 200 });
      }),
      lookup: async () => PUBLIC,
    };
    const other = { ...SOURCE, url: "https://github.com/acme/other" };
    const first = sync(deps);
    const second = syncStoreClone(
      { pluginsDir: dir, key: "github.com/acme/other", source: other },
      deps,
    );
    release?.();
    await Promise.all([first, second]);
    expect(deps.fetch).toHaveBeenCalledTimes(2);
  });

  it("never throw, whatever they are given", async () => {
    const result = await syncStoreClone(
      { pluginsDir: dir, key: null as never, source: SOURCE },
      {},
    );
    expect(result).toEqual({
      ok: false,
      error: "The store could not be updated.",
      code: "disk",
    });
  });

  it("do not hold each other up for another store, or for the next time", async () => {
    const deps = serving(storeArchive());
    await sync(deps);
    await sync(deps);
    await syncStoreClone(
      {
        pluginsDir: dir,
        key: "github.com/acme/other",
        source: { ...SOURCE, url: "https://github.com/acme/other" },
      },
      deps,
    );
    expect(deps.fetch).toHaveBeenCalledTimes(3);
  });
});

describe("removing a clone", () => {
  it("removes that store's clone, with everything in it, and no other", async () => {
    await sync(serving(storeArchive({ plugins: [{ id: "notes" }] })));
    await syncStoreClone(
      {
        pluginsDir: dir,
        key: "github.com/acme/other",
        source: { ...SOURCE, url: "https://github.com/acme/other" },
      },
      serving(storeArchive()),
    );
    expect(await inStores()).toHaveLength(2);
    await removeStoreClone(dir, KEY);
    expect(await inStores()).toEqual([
      storeCloneDir(dir, "github.com/acme/other").split("/").pop() as string,
    ]);
  });

  it("does not mind a clone that is not there, and never throws", async () => {
    await expect(removeStoreClone(dir, KEY)).resolves.toBeUndefined();
    await writeFile(join(root, "file"), "x");
    await expect(
      removeStoreClone(join(root, "file"), KEY),
    ).resolves.toBeUndefined();
    await expect(removeStoreClone(dir, null as never)).resolves.toBeUndefined();
  });

  it("does not follow a symlink where the clone is", async () => {
    const elsewhere = join(root, "elsewhere");
    await mkdir(elsewhere);
    await writeFile(join(elsewhere, "keep.txt"), "mine");
    await mkdir(join(dir, ".stores"));
    await symlink(elsewhere, clone());
    await removeStoreClone(dir, KEY);
    expect(await readdir(elsewhere)).toEqual(["keep.txt"]);
    expect(await inStores()).toEqual([]);
  });
});
