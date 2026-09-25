import type {
  CustomFieldDefinition,
  EventListenerDefinition,
  JobDefinition,
  NotificationDefinition,
  PermissionDefinition,
  SettingDefinition,
  WebhookDefinition,
} from "./contributions";
import type {
  JobService,
  PluginEvents,
  PluginProject,
  PluginStorage,
  PluginWorkspace,
  SettingsService,
  UserService,
  WorkspaceService,
} from "./services";

/** What the host knows about the plugin from its manifest. */
export interface PluginInfo {
  readonly id: string;
  readonly version: string;
}

/** The versions of the host the plugin runs in. */
export interface HostInfo {
  /** The running Barynt, what the manifest's `barynt` range is matched against. */
  readonly barynt: string;
  /** The SDK contract the host implements, see `SDK_VERSION`. */
  readonly sdk: string;
}

/**
 * The first phase. `register` only *declares*: it hands the host the code for
 * each id the manifest lists under `contributes`. It asks for nothing, no data
 * and no other plugin, because at this point not every plugin has registered
 * yet. That is what makes the order of plugins irrelevant.
 *
 * Every method takes the id from the manifest. An id the manifest does not
 * list, or one registered twice, is an error the host reports for the plugin.
 */
export interface RegistrationContext {
  readonly plugin: PluginInfo;
  readonly host: HostInfo;

  registerSetting(id: string, definition: SettingDefinition): void;
  registerPermission(id: string, definition: PermissionDefinition): void;
  registerEventListener(id: string, definition: EventListenerDefinition): void;
  registerJob(id: string, definition: JobDefinition): void;
  registerWebhook(id: string, definition: WebhookDefinition): void;
  registerNotification(id: string, definition: NotificationDefinition): void;
  registerCustomField(id: string, definition: CustomFieldDefinition): void;
}

/**
 * The second phase, once every plugin has registered. The services are the
 * host's; a plugin only reaches what they let it reach.
 */
export interface BootContext {
  readonly plugin: PluginInfo;
  readonly host: HostInfo;

  readonly storage: PluginStorage;
  readonly events: PluginEvents;
  readonly jobs: JobService;
  readonly user: UserService;
  readonly workspace: WorkspaceService;
  readonly settings: SettingsService;
}

/**
 * What `onEnable` and `onDisable` get: the plugin is switched on or off in one
 * workspace. Plain values, no services: what the hook needs to know is which
 * workspace it is about, and the services (storage, events) are provisional until
 * their tickets are built (BARY-85, BARY-84), when they arrive here additively.
 */
export interface WorkspaceLifecycleContext {
  readonly plugin: PluginInfo;
  readonly host: HostInfo;
  /** The workspace the plugin is switched on or off in. */
  readonly workspace: PluginWorkspace;
}

/**
 * What `onProjectEnable` and `onProjectDisable` get: the plugin is switched on or off in one
 * project. Like `WorkspaceLifecycleContext`, plain values: which project it is about, and
 * the workspace that project is in.
 */
export interface ProjectLifecycleContext {
  readonly plugin: PluginInfo;
  readonly host: HostInfo;
  /** The workspace the project is in. */
  readonly workspace: PluginWorkspace;
  /** The project the plugin is switched on or off in. */
  readonly project: PluginProject;
}

/** What `onUninstall` gets: the plugin is removed from the whole platform. */
export interface UninstallContext {
  readonly plugin: PluginInfo;
  readonly host: HostInfo;
}
