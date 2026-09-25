// A sample plugin store for development: writes a local clone of a store with a dozen
// made-up plugins into `<plugins dir>/.stores/` and connects it as a store, so the store
// page has something to show before a store can be fetched. Nothing here is a real plugin,
// and the download links do not exist; installing from it is not possible (and not meant to).
//
//   bun run plugins:dev-store            writes the clone and connects the store
//   bun run plugins:dev-store --remove   removes both
//
// The plugin directory is `BARYNT_PLUGINS_DIR`, or `~/.barynt/plugins` when it is not set,
// like the app's.

import { mkdir, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { db } from "../lib/db";
import { storeCloneDir } from "../lib/plugins/store/paths";
import { normalizeStoreUrl } from "../lib/plugins/storeUrl";

const URL_OF_STORE = "https://example.com/barynt-dev-store";

interface Sample {
  id: string;
  name: string | Record<string, string>;
  description: string | Record<string, string>;
  author: string;
  categories: string[];
  keywords?: string[];
  capabilities?: string[];
  code?: boolean;
  scope?: "workspace" | "platform" | "project";
  barynt?: string;
  released: string;
  /** More versions, older first than the main one. */
  older?: { version: string; released: string; revoked?: true | string }[];
  allRevoked?: boolean;
}

const SAMPLES: Sample[] = [
  {
    id: "github-sync",
    name: "GitHub Sync",
    description: {
      en: "Link pull requests and commits to issues automatically.",
      de: "Pull Requests und Commits automatisch mit Tickets verknüpfen.",
    },
    author: "Barynt",
    categories: ["integration", "developer-tools"],
    keywords: ["git", "pull-request"],
    capabilities: [
      "issues:read",
      "issues:write",
      "network:egress:api.github.com",
    ],
    code: true,
    released: "2026-09-20",
    older: [
      { version: "1.1.0", released: "2026-08-02" },
      {
        version: "1.0.0",
        released: "2026-06-11",
        revoked: "The first release leaked tokens into the log.",
      },
    ],
  },
  {
    id: "slack",
    name: "Slack",
    description:
      "Notifications, unfurled links and issues created straight from Slack.",
    author: "Barynt",
    categories: ["communication", "integration"],
    capabilities: [
      "issues:read",
      "notifications:send",
      "network:egress:slack.com",
    ],
    code: true,
    released: "2026-09-18",
  },
  {
    id: "auto-triage",
    name: "Auto-Triage",
    description: "Rules that label, assign and prioritise new issues.",
    author: "Barynt Labs",
    categories: ["automation"],
    capabilities: ["issues:read", "issues:write"],
    code: true,
    released: "2026-09-10",
  },
  {
    id: "sentry",
    name: "Sentry",
    description: "Turn production errors into prioritised issues.",
    author: "Sentry",
    categories: ["integration", "developer-tools"],
    capabilities: ["issues:write", "network:egress:sentry.io"],
    code: true,
    released: "2026-08-25",
  },
  {
    id: "figma",
    name: "Figma",
    description: "Live preview of frames inside issues.",
    author: "Figma",
    categories: ["integration", "customization"],
    capabilities: ["issues:read", "network:egress:api.figma.com"],
    code: true,
    released: "2026-07-30",
  },
  {
    id: "timesheets",
    name: { en: "Timesheets", de: "Zeiterfassung" },
    description: {
      en: "Track time on issues, with an export for billing.",
      de: "Zeit pro Ticket erfassen, mit Export für die Abrechnung.",
    },
    author: "Tempohub",
    categories: ["reporting", "planning"],
    capabilities: ["issues:read", "issues:write"],
    code: true,
    released: "2026-09-02",
  },
  {
    id: "cycle-insights",
    name: "Cycle Insights",
    description: "Lead times, burn-up and bottlenecks for your cycles.",
    author: "Barynt Labs",
    categories: ["reporting"],
    capabilities: ["issues:read"],
    code: true,
    released: "2026-08-14",
  },
  {
    id: "pagerduty",
    name: "PagerDuty",
    description: "Link incidents and postmortems to issues.",
    author: "PagerDuty",
    categories: ["integration", "communication"],
    capabilities: ["issues:read", "network:egress:api.pagerduty.com"],
    code: true,
    released: "2026-07-01",
  },
  {
    id: "audit-export",
    name: "Audit Export",
    description: "Stream the audit log to a SIEM or an S3 bucket.",
    author: "Barynt",
    categories: ["security", "import-export"],
    capabilities: ["audit:read"],
    code: true,
    scope: "platform",
    released: "2026-09-12",
  },
  {
    id: "gantt",
    name: "Gantt chart",
    description: "A timeline of a project's issues, drawn from their dates.",
    author: "Barynt Labs",
    categories: ["planning"],
    scope: "project",
    released: "2026-06-20",
  },
  {
    id: "release-checklist",
    name: "Release checklist",
    description: "A checklist a project ticks off before each release.",
    author: "Barynt Labs",
    categories: ["planning", "automation"],
    scope: "project",
    released: "2026-09-08",
  },
  {
    id: "team-views",
    name: "Team views",
    description:
      "Ready-made saved views for a team's week, described in a manifest, no code.",
    author: "Barynt Labs",
    categories: ["customization"],
    released: "2026-05-05",
  },
  {
    id: "legacy-importer",
    name: "Legacy importer",
    description:
      "Imports from tools that Barynt 1.0 has moved on from. Needs a newer Barynt than this one.",
    author: "Community",
    categories: ["import-export"],
    barynt: ">=1.0.0",
    released: "2026-09-01",
  },
  {
    id: "retired-helper",
    name: "Retired helper",
    description: "Every version of this plugin was withdrawn by its author.",
    author: "Community",
    categories: ["other"],
    released: "2026-03-03",
    allRevoked: true,
  },
];

const HASH = (seed: string) =>
  Array.from(
    { length: 128 },
    (_, i) =>
      "0123456789abcdef"[(seed.charCodeAt(i % seed.length) + i * 7) % 16],
  ).join("");

function pluginsDir(): string {
  const set = process.env.BARYNT_PLUGINS_DIR?.trim();
  return set || join(homedir(), ".barynt", "plugins");
}

async function main() {
  const key = normalizeStoreUrl(URL_OF_STORE);
  if (!key) throw new Error("the sample store address is not a store address");
  const dir = storeCloneDir(pluginsDir(), key);

  if (process.argv.includes("--remove")) {
    await rm(dir, { recursive: true, force: true });
    await db.pluginStore.deleteMany({ where: { key } });
    console.log(`Removed the sample store (${dir}).`);
    return;
  }

  await rm(dir, { recursive: true, force: true });
  await mkdir(join(dir, "plugins"), { recursive: true });
  await writeFile(
    join(dir, "store.json"),
    JSON.stringify(
      { schemaVersion: 1, id: "barynt-dev-store", name: "Barynt dev store" },
      null,
      2,
    ),
  );

  for (const sample of SAMPLES) {
    const entryDir = join(dir, "plugins", sample.id);
    await mkdir(entryDir, { recursive: true });
    const version = "1.2.0";
    const manifest = {
      manifestVersion: 1,
      id: sample.id,
      name: sample.name,
      version,
      description: sample.description,
      author: sample.author,
      license: "MIT",
      categories: sample.categories,
      ...(sample.keywords ? { keywords: sample.keywords } : {}),
      barynt: sample.barynt ?? "^0.1.0",
      ...(sample.scope ? { scope: sample.scope } : {}),
      ...(sample.capabilities ? { capabilities: sample.capabilities } : {}),
      ...(sample.code ? { server: "server.js" } : {}),
      repository: `https://example.com/plugins/${sample.id}`,
    };
    const versions = [
      {
        version,
        released: sample.released,
        revoked: sample.allRevoked ? (true as const) : undefined,
      },
      ...(sample.older ?? []),
    ].map((v) => ({
      version: v.version,
      download: `https://example.com/downloads/${sample.id}-${v.version}.tgz`,
      sha512: HASH(`${sample.id}${v.version}`),
      released: v.released,
      changelog: `https://example.com/plugins/${sample.id}/releases/tag/v${v.version}`,
      ...(v.revoked !== undefined ? { revoked: v.revoked } : {}),
    }));
    await writeFile(
      join(entryDir, "barynt-plugin.json"),
      JSON.stringify(manifest, null, 2),
    );
    await writeFile(
      join(entryDir, "source.json"),
      JSON.stringify(
        { repository: `https://example.com/plugins/${sample.id}`, versions },
        null,
        2,
      ),
    );
  }

  await db.pluginStore.upsert({
    where: { key },
    update: { enabled: true },
    create: {
      url: URL_OF_STORE,
      key,
      name: "Barynt dev store",
      official: false,
      enabled: true,
    },
  });
  console.log(
    `Wrote ${SAMPLES.length} sample plugins to ${dir} and connected the store "Barynt dev store".`,
  );
  console.log("Remove it again with: bun run plugins:dev-store --remove");
}

main()
  .then(() => db.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await db.$disconnect();
    process.exit(1);
  });
