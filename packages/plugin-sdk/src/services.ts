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

export interface PluginProject {
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

/** What a setting holds: a line of text, a number, a yes/no, or the value of a choice. */
export type SettingValue = string | number | boolean;

/**
 * A plugin's settings at one level, by the setting's id: what an admin set, else the
 * setting's default, else `null` (not set). Every setting the manifest declares is in it.
 */
export type PluginSettingValues = Readonly<Record<string, SettingValue | null>>;

/**
 * What the people who run the plugin set in its settings (`contributes.settings`). The values are
 * the host's to keep and check; the plugin only reads them. Each method answers `null` where the
 * plugin has nothing to read: outside a request, where the plugin is off, where the signed-in user
 * may not see the workspace or project, and for a plugin of another level.
 */
export interface SettingsService {
  /**
   * The settings that apply where the current request is: a plugin that applies to the whole
   * platform gets the platform's, a plugin that applies per workspace gets the workspace's of the
   * request (the one `ctx.workspace.current()` names). A plugin that applies per project gets
   * `null`: it asks with `ofProject`.
   */
  current(): Promise<PluginSettingValues | null>;
  /**
   * For a plugin that applies per project: its settings in `projectId`, if the signed-in user may
   * see that project and the plugin is on there. `null` for a plugin of another level.
   */
  ofProject(projectId: string): Promise<PluginSettingValues | null>;
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
