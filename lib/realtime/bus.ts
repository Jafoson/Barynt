import "server-only";
import { EventEmitter } from "node:events";

export interface ProjectChangeEvent {
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

function channel(projectId: string) {
  return `project:${projectId}`;
}

export function emitProjectChange(event: ProjectChangeEvent) {
  bus.emit(channel(event.projectId), event);
}

/** Returns an unsubscribe function — always call it when the connection closes. */
export function subscribeProjectChange(
  projectId: string,
  handler: (event: ProjectChangeEvent) => void,
): () => void {
  bus.on(channel(projectId), handler);
  return () => {
    bus.off(channel(projectId), handler);
  };
}
