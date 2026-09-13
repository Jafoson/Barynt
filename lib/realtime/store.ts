import "server-only";

/** The most recent change recorded for one workspace. */
export interface LastChange {
  actorId: string;
  at: number;
}

declare global {
  // eslint-disable-next-line no-var
  var realtimeChanges: Map<string, LastChange> | undefined;
}

// Single-process, in-memory, deliberately not Redis or a DB column: the app
// runs as one long-lived container today (see docker-compose.yml, no
// replica count), and a poll only ever needs the single most recent change
// per workspace — nothing here needs to survive a restart, and losing one
// notification because the process just restarted is harmless (the next
// poll after a real change catches up within one interval).
//
// If Barynt is ever scaled to multiple `app` replicas, a poll landing on a
// different replica than the one that recorded the change would miss it —
// at that point this would need to move to a shared store (Redis, or a
// column on the workspace/project row). Not needed for the current
// single-instance deployment.
//
// The `global` assignment below is NOT guarded to dev only (unlike
// `lib/db.ts`/`lib/redis.ts`, where it exists purely to survive dev's HMR
// re-execution and is skipped in production because a fresh singleton per
// process is fine there — those hold stateless connections, and every
// importer getting the same *client* is a nice-to-have, not a correctness
// requirement). Here the `Map` itself is the data. Next.js can bundle a
// shared module like this one separately per compilation layer (Server
// Actions vs. Route Handlers) even within a single running process — two
// separately bundled copies of this file would each get their own
// module-level `changes` if it weren't for `global` bridging them, which is
// exactly what broke this in production while working fine locally:
// `recordProjectChange` (called from the Server Action layer) and
// `getLastChange` (called from the Route Handler layer) held two different,
// never-synchronized Maps.
const changes = global.realtimeChanges ?? new Map<string, LastChange>();
global.realtimeChanges = changes;

export function recordProjectChange(workspaceId: string, actorId: string) {
  changes.set(workspaceId, { actorId, at: Date.now() });
}

export function getLastChange(workspaceId: string): LastChange | null {
  return changes.get(workspaceId) ?? null;
}
