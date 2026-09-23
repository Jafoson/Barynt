// The services a plugin gets in `boot(ctx)`.
//
// `boot` runs once per process, before any request. So `ctx.user` is not "the
// current user" but a service that answers when asked, from inside a request.
// Only what the tickets already fix is typed; the rest is provisional and
// marked as such, so that the names exist now and the members arrive additively.

/** Anything that survives JSON, the only thing a plugin may hand to the host. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export interface PluginUser {
  readonly id: string;
  readonly name: string;
}

export interface PluginWorkspace {
  readonly id: string;
  readonly name: string;
}

/** Who is signed in. Answers `null` outside a request. */
export interface UserService {
  current(): Promise<PluginUser | null>;
}

/** Which workspace the current request belongs to. Answers `null` outside a request. */
export interface WorkspaceService {
  current(): Promise<PluginWorkspace | null>;
}

/** Background work. A job is declared with `registerJob`; this queues a run. */
export interface JobService {
  /** Runs the job `id` of this plugin once, as soon as a worker is free (BARY-90). */
  enqueue(id: string, payload?: JsonValue): Promise<void>;
}

/**
 * Provisional: storage in scopes (platform, workspace, project, user, issue)
 * arrives with BARY-85. No members until then.
 */
export type PluginStorage = Record<never, never>;

/**
 * Provisional: what a plugin can do with events beyond listening (that is
 * `registerEventListener`) arrives with BARY-84. No members until then.
 */
export type PluginEvents = Record<never, never>;
