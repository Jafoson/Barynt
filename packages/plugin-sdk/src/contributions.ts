// What a plugin's server module can register, one entry per extension point.
//
// Only the *point* is decided here. What a definition holds belongs to the
// ticket that builds the point, so every definition is provisional (any object)
// until then. The manifest lists the ids under `contributes`; `register*` hands
// the host the code for each id.
//
// Points with a screen (pages, navigation, views, issue panels, issue actions,
// dashboard widgets, commands) are missing on purpose: a server module cannot
// hand over a React component. They belong to the client entry, which is
// defined with the slot framework (BARY-65).

/** A definition whose members are not decided yet: any object. */
type Provisional = Readonly<Record<string, unknown>>;

/** Validation and defaults for a setting (BARY-66). */
export type SettingDefinition = Provisional;

/** A permission the plugin adds. */
export type PermissionDefinition = Provisional;

/** A listener for events of the core (BARY-84). */
export type EventListenerDefinition = Provisional;

/** The code of a background job (BARY-90). */
export type JobDefinition = Provisional;

/** A webhook the plugin receives or sends. */
export type WebhookDefinition = Provisional;

/** A notification type with its texts (BARY-92). */
export type NotificationDefinition = Provisional;

/** Server-side rules of a custom field, such as validation (BARY-79). */
export type CustomFieldDefinition = Provisional;

/**
 * The manifest extension points (`contributes.<point>`) a server module can
 * fulfil. The host uses the list to tell a missing implementation from an id
 * that a client entry will provide.
 */
export const SERVER_CONTRIBUTION_POINTS = [
  "settings",
  "permissions",
  "events",
  "jobs",
  "webhooks",
  "notifications",
  "customFields",
] as const;

export type ServerContributionPoint =
  (typeof SERVER_CONTRIBUTION_POINTS)[number];
