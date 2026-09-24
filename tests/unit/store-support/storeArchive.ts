import { entry, tgz } from "./tarBuilder";

// The archive a host would give for a store: one directory at the top, `store.json`, and
// for each plugin the two files that count, next to a readme that is not. Tests only.

export interface SamplePlugin {
  id: string;
  version?: string;
  /** Leave `source.json` out, which makes the entry unusable. */
  noSource?: boolean;
}

export const manifestOf = (id: string, version = "1.0.0") =>
  JSON.stringify({
    manifestVersion: 1,
    id,
    name: id,
    version,
    description: `The ${id} plugin`,
    author: "Acme",
    license: "MIT",
    categories: ["other"],
    barynt: "^0.1.0",
  });

export const sourceOf = (version = "1.0.0") =>
  JSON.stringify({
    versions: [
      {
        version,
        download: `https://example.com/${version}.tgz`,
        sha512: "a".repeat(128),
      },
    ],
  });

export function storeArchive(
  options: { name?: string; plugins?: SamplePlugin[]; root?: string } = {},
): Buffer {
  const root = options.root ?? "repo-abc123";
  const files = [
    entry({ name: `${root}/`, flag: "5" }),
    entry({
      name: `${root}/store.json`,
      data: JSON.stringify({
        schemaVersion: 1,
        id: "test-store",
        name: options.name ?? "Test Store",
      }),
    }),
    entry({ name: `${root}/README.md`, data: "# A store" }),
  ];
  for (const plugin of options.plugins ?? []) {
    files.push(
      entry({
        name: `${root}/plugins/${plugin.id}/barynt-plugin.json`,
        data: manifestOf(plugin.id, plugin.version),
      }),
    );
    if (!plugin.noSource) {
      files.push(
        entry({
          name: `${root}/plugins/${plugin.id}/source.json`,
          data: sourceOf(plugin.version),
        }),
      );
    }
  }
  return tgz(...files);
}
