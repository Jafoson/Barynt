# A plugin's release: what it is, how it is checked, how it is put in place

A store entry (`plugins/<id>/source.json`) names a **release archive** for each version: an `https://` link and the SHA-512 of the
archive, pinned by the store. Installing from a store means getting that archive onto the instance and into the plugin directory
(`<plugins>/<id>/<version>/`, [Loading](loading.md)) without trusting anything about it that cannot be checked. This page is about that
path: [`lib/plugins/store/`](../../lib/plugins/store) (`release.ts`, `zip.ts`, `stageRelease.ts`) and, for the tar part, `tar.ts`. The
action that calls it (`installStorePlugin`: who may install, what the plugin needs, what it is recorded as) is described in [Lifecycle](lifecycle.md#where-the-files-come-from).

## The archive

A `.tgz`, `.tar.gz` or `.zip`, told by its first bytes and not by its name, with `barynt-plugin.json` **at its root**. The store's
CONTRIBUTING asks the same and the store's CI checks it. An archive of a whole repository (one directory at the top) is not a release.

| Rule | Why |
| --- | --- |
| Regular files and directories only. **A symlink, a hard link, a device, a pipe refuses the whole archive** | A release is all code that may run, so nothing that could make a directory say one thing and load another is kept (`hashPluginDirectory` refuses them, too). The archive of a *store* leaves such entries out; a release refuses them |
| A name with `..`, an absolute path, a backslash or a control character refuses the archive, also for an entry that would be left out | An archive with such a name is not one to trust the rest of |
| A file twice, two names that differ only in case, a name that is a file and a directory refuses the archive | One name, one file, whatever the file system; nothing to choose between |
| At most 5000 files, 12 directory levels, 32 MiB a file, 128 MiB in all, 50 MiB downloaded, 10 000 entries | The limits of `hashPluginDirectory` (`INTEGRITY_LIMITS`), so nothing is accepted here that could not be hashed and approved afterwards. The store's CONTRIBUTING says 200 MB unpacked; a plugin between 128 and 200 MB passes the store's CI and is refused here, with the reason |
| A gzip or a deflate stream is unpacked with a ceiling on its output | A small file that inflates to gigabytes is refused, not unpacked |

Directories only say where files go; an empty one is not part of a plugin's hash, so it is checked and then left out. `tar czf plugin.tgz .`
writes an entry for `.` and names that start with `./`; both are fine.

### The zip reader

`zip.ts` is pure (like `tar.ts`), and reads what every other reader reads: **the central directory**, where the sizes and names are.
It refuses what it does not understand or could be made to see differently: zip64, archives in more than one part, encrypted entries,
any compression method but stored and deflate, a checksum or size that is wrong, an entry that inflates to more or less than it says
(so a small entry cannot become a bomb), a name in the local header that is not the one in the directory, entries whose bytes overlap
(the overlapping zip bomb), and an end record that is not the last thing in the file (bytes after the archive, or something that looks
like one inside a comment, do not change what is read). A symlink is a symlink by the Unix mode in the attributes, and refuses the
archive. It was compared with `unzip -l` on an archive that Python's `zipfile` wrote, and the tests build hostile ones.

## Checking a release (`verifyRelease`, nothing is written)

1. **Download** the link of the entry with `safeDownload` ([ADR 0003](adr-0003-store-transport.md): https only, public addresses only, every
   redirect checked, size and time limited). **No credentials are sent**: a release link is not the store's host, and a token goes only to
   the host it was given for. A release behind a private link cannot be installed until that is decided.
2. **The hash**: the SHA-512 of the bytes has to be the one the store pinned (128 lower-case hex characters, compared without leaking where
   they differ). A release that was changed after the store listed it is refused with that reason, **before anything is read from it**.
3. **Read and plan** the archive (the rules above).
4. **The manifest** inside has to be valid (`parseManifest`), at most 256 KiB, and **equal, key for key, to the manifest the store
   lists**: the version, what it asks for, where it applies, whether it has code. What the admin was shown is what is installed.

**Only the version the store describes can be installed**, the one the store's manifest copy is for (the newest it lists, its CI keeps
that). It is the only version whose manifest can be compared with what the store lists, so an older one is shown in the details and is not
offered, and if the described version is withdrawn nothing is offered, though older versions were not withdrawn. That is deliberate: it is
the strict choice, and it can be loosened later.

## Putting it in place (`placeRelease`)

Written into a fresh directory `.staging/release-*` (mode 0700, files 0644, never executable, `wx`), hashed the way an installed plugin is
hashed (`Plugin.integrity`), and moved to `<plugins>/<id>/<version>` with **one rename**: what is there is all of a release or not there.

- `.staging` and `<plugins>/<id>` have to be real directories, and a symlink in their place is refused, so a write cannot go somewhere else.
- A version that is **there already is never overwritten**: the same files are fine (nothing is written, `created: false`), other files are
  refused, because whoever put them there did not go through this.
- The id and version become path parts, so they are checked again here and not left to the caller.
- Leftovers of a run that was cut off are removed from `.staging` when they are over an hour old.
- Everything is in memory between the download and the write: at most 50 MiB compressed and 128 MiB unpacked at once. That is acceptable for
  a rare admin action and is the reason for the limits.

## What this does not do

- It does not make the code safe, only what the store pinned and listed. Approved malicious code is still malicious ([Security](security.md)).
- It does not check the code against what the manifest asks for; a capability is a promise, not a limit.
- It does not install anything: no row is written, nothing is switched on, nothing runs. That is the action's job (`storeInstall.ts`), which
  also checks who may, that the plugin fits this Barynt and what is installed, and records it. An **update** from the store the plugin came
  from goes through the same two steps, and puts the new version next to the old one instead of over it ([Lifecycle](lifecycle.md#update-from-a-store)).
