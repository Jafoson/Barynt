# ADR 0003: How a store's repository gets onto the instance

|  |  |
| --- | --- |
| Status | **Accepted.** What is left open is under [Still open](#still-open). |
| Date | 2026-09-24 |
| Tickets | BARY-111 (this step), BARY-105 (the sync that uses it), BARY-107 (the install that uses the download), BARY-97 (egress rules, later) |
| Builds on | [Store format](store-format.md) (what is read), [Security](security.md) (who may run code) |

## Question

A store is a Git repository ([Store format](store-format.md)). The instance keeps a local copy and reads the
catalog from it. The address of a store is entered by the platform admin, the repository is written by other
people, and the instance runs in a container that has, at most, what the image gave it. How does the copy get
there, and what may it be when it arrives?

## Answer

**The archive of the default branch, downloaded over https, unpacked by us with an allowlist.**

1. The instance builds one address from the store's address and asks for it. No `git` binary, no git protocol, no
   `ssh`. Every host that matters has "the default branch as a tarball" (table below).
2. The download goes through one function, `safeDownload` ([`lib/plugins/store/fetch.ts`](../../lib/plugins/store/fetch.ts)),
   which is also what a plugin's release archive will be fetched with (BARY-107). It refuses to talk to anything but the
   public internet, limits size and time, and never sends a token anywhere but to the host it was given for.
3. The bytes are read by our own tar reader ([`tar.ts`](../../lib/plugins/store/tar.ts)), which never writes anything
   and says no to what it does not understand.
4. `unpackStoreArchive` ([`archive.ts`](../../lib/plugins/store/archive.ts)) writes **only** `store.json` and, for each
   plugin, `barynt-plugin.json` and `source.json`. The rest of the repository (readme, workflows, images, scripts,
   symlinks, whatever else) is not written to the disk at all. Where a file goes is made from names we allow, never
   from a path the archive wrote.
5. What is on the disk is then read as before: as data, never as code (`reader.ts`).

## Why not `git clone`

| | `git clone` | Archive over https |
| --- | --- | --- |
| Needs in the image | a `git` binary and its libraries, kept up to date | nothing: `fetch` and `zlib` are in the runtime |
| What a hostile repository can do to the client | hooks are not run on clone, but config, submodules (`.gitmodules`), LFS filters and `core.fsmonitor`-style settings are a long history of client-side vulnerabilities; every one is ours to track | nothing of the repository is interpreted: it is a file list |
| Symlinks, odd names, huge files | written to disk, then guarded against | never written; refused or left out while reading |
| Size | the whole history | one tree; limited to 64 MiB |
| Private repositories | credentials in a URL or a helper, which end up in `.git/config` and in process lists | one `Authorization` header, never in the address |
| Testable without a network | no | yes: `fetch` and DNS are replaced |

The price: no history, so no signed-commit check (see [Still open](#still-open)) and no commit id for what was
read. The install of a plugin does not need either: it pins a **hash of the release archive** in the store's entry.

## The address for each kind of host

The kind of host is decided by its name, and anything unknown is treated as Gitea/Forgejo (Codeberg and every
self-hosted one). The addresses are built, never taken from the user beyond `owner/repository`, and the owner and
repository names are checked (`A-Za-z0-9._-`, at most 100 characters, no leading dot or dash, no `%`, no path).

| Host | Address asked | A token is sent as |
| --- | --- | --- |
| `github.com` | public: `https://codeload.github.com/<owner>/<repo>/tar.gz/HEAD`; with a token: `https://api.github.com/repos/<owner>/<repo>/tarball` | `Authorization: Bearer <token>`, to `api.github.com` only |
| `gitlab.com`, `gitlab.*` | `https://<host>/<path>/-/archive/HEAD/<name>-HEAD.tar.gz` (subgroups allowed) | `PRIVATE-TOKEN: <token>` |
| `bitbucket.org` | `https://bitbucket.org/<workspace>/<repo>/get/HEAD.tar.gz` | `Authorization: Basic base64(user:token)`; a user name is required with a token |
| anything else (Gitea, Forgejo, Codeberg) | `https://<host>/<path>/archive/HEAD.tar.gz` | `Authorization: token <token>` |

The API of GitHub answers with a redirect to a signed address on `codeload.github.com`. The token is **not** sent
there: credentials go to the host that was asked first, and to no other, also after a redirect and also if the
redirect leads back.

The host is recognised by its whole name. `notbitbucket.org`, `github.com.evil.example` and the like are Gitea
hosts, so a token given for them goes nowhere but to them.

## What `safeDownload` refuses

An address that is written by another person is not trusted, so, in this order:

- **Only `https://`**, no user name or password in the address, no port but the standard one, and a **name, not a
  number**. `https://2130706433/` and `https://0x7f000001/` are parsed to `127.0.0.1` by the URL parser and refused as
  numbers; `https://[::1]/` too.
- **Every address the name resolves to has to be on the public internet.** Loopback, private ranges, link-local
  (where cloud metadata is, `169.254.169.254`), carrier-grade NAT, documentation and benchmarking ranges, multicast and
  the reserved space are refused for IPv4. For IPv6 only `2000::/3` (where addresses are handed out) is accepted, minus
  Teredo/protocol assignments and documentation, so unique-local, link-local, multicast and everything not yet
  assigned are refused without a list. An IPv4 address written inside an IPv6 one (`::ffff:10.0.0.1`, NAT64
  `64:ff9b::/96`, 6to4 `2002::/16`) is judged as the IPv4 address it carries. One address in the answer that is not
  public refuses the whole name.
- **Every redirect is checked the same way**, by the same rules, at most five (configurable), and the redirect is
  followed by us, not by `fetch`, so nothing is reached that was not looked at.
- **A limit on the size**: refused, not cut, from the `content-length` if it is honest and from the bytes read if it
  is not. **A limit on the time** for everything, redirects and the reading of the body included (default 60 s).
- What comes back is only bytes. What they mean is checked by the one who asked (a hash, a schema), never here.
- It never throws, and what it says never carries a header, so a token cannot end up in a log, a page or an audit
  entry through an error.

### What this does not cover

**DNS rebinding.** The name is resolved and checked, then `fetch` resolves it again to connect. A name that answers
with a public address the first time and a private one the second gets through. Closing this needs the connection
to be made to the address we checked, which `fetch` does not allow, or a fence around the process. That fence is the
egress rule planned in BARY-97 (the pod may not reach private ranges at all). Until then this guard is the first line,
not the last, and it is written down here so nobody takes it for the last. What it does stop: an address that
is plainly inside, a redirect to one, and a name that is configured to point inside.

## What the unpacker does with an archive

- **gunzip has a ceiling** (128 MiB of output): a small file that inflates to gigabytes is refused, not unpacked.
- **The tar reader** understands the classic and ustar header, the `prefix` of ustar, PAX `path` and `size`, and the GNU
  long name. It **refuses** what it does not understand: a wrong checksum, a size in base-256, a PAX record it cannot
  read, an archive that is cut off, more than 200 000 entries, more than the total size allowed.
- **Names** are cleaned (`cleanEntryPath`): a `..`, an absolute path, a backslash, a control character, a part over 255
  or a path over 512 characters or 32 levels deep refuses the archive, even for a file that would have been left out,
  because an archive with such a name is not one to trust the rest of.
- **One top-level directory** (what a host's archive has); more than one refuses it.
- **Only regular files with the names of a store are written.** A symlink, hard link, device or directory entry is never
  written. A name that is not `store.json` or `plugins/<id>/{barynt-plugin.json,source.json}` (with a valid plugin id)
  is left out. A file that is in the archive twice refuses it, and we do not choose which one counts. A file over
  256 KiB or more than 2000 plugins refuses it.
- **Files are created with `wx`** (they must not exist) and mode `0644`, into a directory that is ours and empty.
  Nothing is ever executable. The caller (BARY-105) unpacks into a temporary directory and moves it into place only if
  the reader accepts it, so a half-written or refused archive never replaces a store that worked.

## What was tested

- Unit tests with hostile input for every piece (the address guard with the edges of each range and every notation of
  an address, the download with a replaced `fetch` and DNS, the tar reader with cut, damaged and made-up headers and
  random bytes, the unpacker on a real directory).
- **Mutation checks** on all of it: a defect is put into the source one at a time and the tests must fail. The few
  that survive are equivalent (a check that a neighbouring check already makes, such as a PAX record without a space,
  which the length check catches next), and where a check was unreachable it was removed instead.
- The tar reader against **real archives**, once and by hand: what GNU `tar` (ustar, gnu, posix and pax formats) and
  `git archive` write, compared entry by entry with the output of `tar -tv`. That is not part of the suite, because it
  needs the system's `tar` and `git`; the suite builds its archives itself (`tests/unit/store-support/tarBuilder.ts`).

## Still open

- **The egress fence** (BARY-97): closes the DNS rebinding gap above and covers the plugin's own network access too.
- **A self-hosted GitLab that is not called `gitlab.*`** is taken for Gitea and fails with a 404. A store setting for
  "this host is GitLab" is the answer when someone needs it; guessing from the response is not.
- **Which commit was read.** The archive of `HEAD` has no stable name; the sync (BARY-105) records the time and the
  store's own `store.json`, not a commit. Signed commits (`maintainerKeys`) need a `git` object, so they need
  another transport than this one, and are not read.
- **Conditional requests** (`ETag`): a store page that is opened often should not download the archive each time. The
  sync (BARY-105) decides how often it asks; adding `If-None-Match` is a small change to `safeDownload` if it turns
  out to matter.
- **A plugin's release archive** is fetched with the same `safeDownload` (BARY-107), but unpacked in full and checked
  against the store's SHA-512, not by the allowlist above.
