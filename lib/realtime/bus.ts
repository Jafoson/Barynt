import "server-only";
import { EventEmitter } from "node:events";

export interface ProjectChangeEvent {
  /** The channel this event is published on — see the note on `channel()`
   *  below for why this is the workspace, not the project. */
  workspaceId: string;
  /** Which project the change belongs to — lets a single-project board
   *  (unlike the cross-project "My issues" board) ignore events for
   *  projects it isn't showing. */
  projectId: string;
  /** Set when the change belongs to one issue (a card, its comments); unset
   *  for project-wide changes (e.g. a workspace label). */
  issueId?: string;
  /** Who made the change — lets a subscriber ignore its own writes, since
   *  the acting user's own view already updated via the Server Action's
   *  own `revalidatePath`. */
  actorId: string;
  at: number;
}

declare global {
  // eslint-disable-next-line no-var
  var realtimeBus: EventEmitter | undefined;
}

// Single-process pub/sub, deliberately not Redis: the app runs as one
// long-lived container today (see docker-compose.yml, no replica count), so
// an in-process EventEmitter reaches every open connection without new
// infrastructure. If Barynt is ever scaled to multiple `app` replicas, this
// would need to move to Redis pub/sub (SUBSCRIBE/PUBLISH via a second
// `ioredis` connection — a subscriber connection can't issue other
// commands, see `lib/redis.ts`) so an event published on one replica also
// reaches clients connected to another. Not needed for the current
// single-instance deployment.
const bus = global.realtimeBus ?? new EventEmitter();
// Every open board/issue tab holds one listener; the default limit of 10
// would print misleading "possible memory leak" warnings well within normal
// use.
bus.setMaxListeners(0);
if (process.env.NODE_ENV !== "production") global.realtimeBus = bus;

// Channeled by workspace, not project: a board can show issues from more
// than one project at once (the cross-project "My issues" board,
// `app/[locale]/(default)/[workspace]/my/page.tsx`, has no single
// `projectId` to subscribe to) — every page that can show this feature does
// have a workspace, so that's the one scope guaranteed to exist everywhere
// a subscriber needs one. `event.projectId` still travels along so a
// single-project board can ignore events for projects it isn't displaying.
function channel(workspaceId: string) {
  return `workspace:${workspaceId}`;
}

export function emitProjectChange(event: ProjectChangeEvent) {
  bus.emit(channel(event.workspaceId), event);
}

/** Returns an unsubscribe function — always call it when the connection closes. */
export function subscribeProjectChange(
  workspaceId: string,
  handler: (event: ProjectChangeEvent) => void,
): () => void {
  bus.on(channel(workspaceId), handler);
  return () => {
    bus.off(channel(workspaceId), handler);
  };
}
