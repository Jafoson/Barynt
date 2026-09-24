import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { PrismaClient } from "../lib/generated/prisma/client";
import {
  normalizeStoreUrl,
  OFFICIAL_STORE_NAME,
  OFFICIAL_STORE_URL,
} from "../lib/plugins/storeUrl";
import { provisionSystemRbac } from "../lib/rbac-provision";
import {
  DEFAULT_ISSUE_TYPES,
  DEFAULT_PRIORITIES,
  DEFAULT_STATUSES,
} from "../lib/workspace-defaults";

/**
 * Non-destructive, idempotent system bootstrap: the global Status/Priority/
 * IssueType rows every workspace's WorkspaceStatus/WorkspacePriority/
 * WorkspaceIssueType join rows point at — `createWorkspace()`
 * (`features/workspaces/actions.ts`) fails its foreign key without them —
 * plus the shared RBAC permissions and system roles (`provisionSystemRbac`).
 *
 * `prisma migrate deploy` (the production path — see docker-compose.yml's
 * `migrate` service) only ever touches schema, never data, so a fresh
 * deployment is otherwise left unable to create its first workspace at all.
 * This is the piece of `prisma/seed.ts` that isn't demo data — seed.ts calls
 * it too, instead of duplicating it, so the two can't drift apart.
 *
 * Upsert/skipDuplicates only — safe to run again on an already-provisioned
 * or otherwise non-empty database, unlike `prisma/seed.ts`, which deletes
 * every row first.
 */
export async function bootstrapSystemData(db: PrismaClient): Promise<void> {
  for (const s of DEFAULT_STATUSES) {
    await db.status.upsert({ where: { id: s.id }, update: s, create: s });
  }
  for (const p of DEFAULT_PRIORITIES) {
    await db.priority.upsert({ where: { id: p.id }, update: p, create: p });
  }
  for (const t of DEFAULT_ISSUE_TYPES) {
    await db.issueType.upsert({ where: { id: t.id }, update: t, create: t });
  }
  await db.$transaction((tx) => provisionSystemRbac(tx));

  // The official plugin store, on by default. `update` never touches `enabled`:
  // an admin who switched it off keeps it off across deploys. It only makes sure
  // the row counts as official, which is what keeps it from being deleted.
  const officialKey = normalizeStoreUrl(OFFICIAL_STORE_URL);
  if (officialKey) {
    await db.pluginStore.upsert({
      where: { key: officialKey },
      update: { official: true },
      create: {
        url: OFFICIAL_STORE_URL,
        key: officialKey,
        name: OFFICIAL_STORE_NAME,
        official: true,
        enabled: true,
      },
    });
  }
}

if (import.meta.main) {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = new PrismaClient({ adapter: new PrismaPg(pool) });

  bootstrapSystemData(db)
    .then(() => {
      console.log(
        "✓ System data bootstrapped (statuses, priorities, issue types, RBAC)",
      );
      return db.$disconnect();
    })
    .catch(async (err) => {
      console.error(err);
      await db.$disconnect();
      process.exit(1);
    });
}
