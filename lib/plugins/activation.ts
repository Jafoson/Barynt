// A plugin is switched on once per workspace or per project. The database
// can't make "once per level" unique with a nullable `projectId`, so every
// `PluginActivation` carries a `scopeKey` that does (`@@unique([pluginId,
// scopeKey])`). A CHECK constraint in the migration keeps key and ids in step.

export interface ActivationScope {
  workspaceId: string;
  projectId?: string | null;
}

/** `pr:<projectId>` for a project, `ws:<workspaceId>` for a workspace. */
export function activationScopeKey(scope: ActivationScope): string {
  return scope.projectId ? `pr:${scope.projectId}` : `ws:${scope.workspaceId}`;
}
