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
const changes = global.realtimeChanges ?? new Map<string, LastChange>();
if (process.env.NODE_ENV !== "production") global.realtimeChanges = changes;

export function recordProjectChange(workspaceId: string, actorId: string) {
  changes.set(workspaceId, { actorId, at: Date.now() });
}

export function getLastChange(workspaceId: string): LastChange | null {
  return changes.get(workspaceId) ?? null;
}
