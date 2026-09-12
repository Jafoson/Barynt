-- The 2026-06-16 migration that first introduced the Workspace model
-- (20260616000000_add_workspace) hard-inserted a default workspace
-- ('nimbus', 'Nimbus') to migrate the app's pre-workspace data into. On any
-- installation that already existed back then, real content has since
-- accumulated in it — nothing to clean up. But `prisma migrate deploy`
-- replays the *entire* migration history on a brand-new database too, so
-- every fresh self-hosted install has been getting this same empty
-- placeholder workspace ever since, with zero members (the User table was
-- still empty at the point that migration ran) — confirmed live on a
-- freshly deployed instance.
--
-- Only removes it when it's still genuinely empty (no member ever joined),
-- so a real, long-running installation's actual "nimbus" workspace is
-- never touched. Everything scoped to it (Project, Status, Priority,
-- IssueType, Role, Team, Label — all ON DELETE CASCADE to Workspace) goes
-- with it, which is safe precisely because "no members" means nothing
-- real was ever attached either.
DELETE FROM "Workspace"
WHERE id = 'nimbus'
  AND NOT EXISTS (
    SELECT 1 FROM "WorkspaceMember" WHERE "workspaceId" = 'nimbus'
  );
