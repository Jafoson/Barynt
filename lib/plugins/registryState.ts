import "server-only";
import type { RegistrySnapshot } from "./registry";

// The one piece of the registry that has to be the same everywhere in the
// process. Next.js can bundle a shared module separately for each compilation
// layer (Server Actions, Route Handlers, Server Components, the instrumentation
// hook) even though they run in one process, and two bundled copies of a module
// would each get their own state: a change made from a Server Action would never
// reach the copy a page reads. That is what broke `lib/realtime/store.ts` in
// production while working locally, so, like there, the state hangs on `global`.
//
// It is kept apart from the registry itself so that a Server Action can say "the
// plugins changed" without pulling in the loader, the database or the session.

export interface RegistryState {
  /** Counts every `invalidatePluginRegistry()`. A build that finishes for an older one is discarded. */
  generation: number;
  /** What the last build made, or `null` before the first one and after an invalidation. */
  snapshot: RegistrySnapshot | null;
  /** A build that is running, so that requests wait for one build and do not start their own. */
  building: Promise<{
    snapshot: RegistrySnapshot;
    generation: number;
    failed: boolean;
  }> | null;
  /** `id@version` of every plugin that booted in this process. `boot` runs once per process. */
  booted: Set<string>;
  /** When the last build failed as a whole (not a plugin), so it is tried again after a while. */
  failedAt: number | null;
  /**
   * How many loads are running right now. While it is above zero the host's services
   * answer `null`: a plugin that boots later than the server start (one that was
   * approved while the app runs) boots from inside whichever request built the
   * registry, and must not see that request's user.
   */
  loading: number;
}

const KEY = Symbol.for("barynt.plugins.registry");

export function createRegistryState(): RegistryState {
  return {
    generation: 0,
    snapshot: null,
    building: null,
    booted: new Set(),
    failedAt: null,
    loading: 0,
  };
}

export function getRegistryState(): RegistryState {
  const holder = globalThis as unknown as Record<symbol, RegistryState>;
  holder[KEY] ??= createRegistryState();
  return holder[KEY];
}

/**
 * Says that what decides which plugins run has changed, such as a store that was
 * switched off or the setting for unsigned plugins: the next request builds the
 * registry again. Nothing that was loaded is kept in the meantime, so a plugin that
 * is no longer allowed is no longer handed out from this moment.
 *
 * What it cannot do is stop code that already runs: a timer or a listener a plugin
 * started in `boot` keeps going until the process restarts, because JavaScript
 * cannot unload it. It only applies to this process, so with several replicas each
 * has to be told.
 */
export function invalidatePluginRegistry(
  state: RegistryState = getRegistryState(),
): void {
  state.generation += 1;
  state.snapshot = null;
  state.failedAt = null;
}
