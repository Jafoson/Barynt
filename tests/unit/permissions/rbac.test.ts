import { describe, expect, it } from "bun:test";
import {
  ALL_PERMISSIONS,
  isPermissionAllowedIn,
  PERMISSIONS,
  type Permission,
  permissionDesc,
  permissionsFor,
  ROLE_SCOPES,
  type RoleScope,
  SYSTEM_ROLES,
  type SystemRole,
  systemRoleId,
  systemRolesIn,
  toPermission,
  toRoleScope,
} from "@/lib/rbac";

// The registry is pure data definition. These tests keep it internally
// consistent: a key names only object and action, every role carries only
// permissions that may actually be granted in its scope, and ranks stay
// unique per scope.

function role(key: string): SystemRole {
  const found = SYSTEM_ROLES.find((r) => r.key === key);
  if (!found) throw new Error(`Rolle ${key} fehlt`);
  return found;
}

describe("Permission registry (lib/rbac/permissions.ts)", () => {
  it("describes every permission and has no duplicates", () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
    for (const key of ALL_PERMISSIONS) {
      expect(permissionDesc(key).length).toBeGreaterThan(0);
    }
  });

  it("names no level in the key — only object and action", () => {
    // This was exactly the reason for the redesign: `workspace.label.create`
    // and `project.label.create` are the same operation in different scopes.
    for (const key of ALL_PERMISSIONS) {
      expect(key.startsWith("workspace.label")).toBe(false);
      expect(key.startsWith("project.label")).toBe(false);
      expect(key.startsWith("project.issue")).toBe(false);
      expect(key.startsWith("project.comment")).toBe(false);
      expect(key.startsWith("workspace.member")).toBe(false);
      expect(key.startsWith("workspace.team")).toBe(false);
    }
  });

  it("lists every permission in at least one scope", () => {
    for (const key of ALL_PERMISSIONS) {
      expect(PERMISSIONS[key].scopes.length).toBeGreaterThan(0);
      for (const scope of PERMISSIONS[key].scopes) {
        expect(ROLE_SCOPES).toContain(scope);
      }
    }
  });

  it("allows the same permission to apply in workspace and project", () => {
    // For objects that genuinely exist at both levels: the role's scope
    // decides which of the two is meant.
    for (const key of [
      "label.create",
      "member.invite",
      "role.manage",
    ] as Permission[]) {
      expect(isPermissionAllowedIn(key, "WORKSPACE")).toBe(true);
      expect(isPermissionAllowedIn(key, "PROJECT")).toBe(true);
    }
  });

  it("keeps purely project-related permissions out of the workspace", () => {
    // Otherwise a workspace role could reach past the project role and govern
    // into every project — that's exactly what the separation is meant to
    // prevent.
    for (const key of [
      "issue.create",
      "issue.update.any",
      "comment.create",
      "project.view",
      "project.update",
      "project.delete",
    ] as Permission[]) {
      expect(isPermissionAllowedIn(key, "WORKSPACE")).toBe(false);
      expect(isPermissionAllowedIn(key, "PROJECT")).toBe(true);
    }
  });

  it("keeps the workspace's master keys out of the project roles", () => {
    // A project cannot grant itself the keys to all the others.
    for (const key of [
      "project.view.all",
      "project.admin.all",
    ] as Permission[]) {
      expect(isPermissionAllowedIn(key, "WORKSPACE")).toBe(true);
      expect(isPermissionAllowedIn(key, "PROJECT")).toBe(false);
      expect(isPermissionAllowedIn(key, "PLATFORM")).toBe(false);
    }
  });

  it("keeps platform permissions out of the tenant scopes", () => {
    for (const key of [
      "platform.access",
      "user.manage",
      "tenant.access",
      "workspace.suspend",
    ] as Permission[]) {
      expect(isPermissionAllowedIn(key, "WORKSPACE")).toBe(false);
      expect(isPermissionAllowedIn(key, "PROJECT")).toBe(false);
      expect(isPermissionAllowedIn(key, "PLATFORM")).toBe(true);
    }
  });

  it("keeps workspace-only permissions out of the project scope", () => {
    for (const key of [
      "workspace.update",
      "config.manage",
      "project.create",
      "project.view.all",
      "team.create",
    ] as Permission[]) {
      expect(isPermissionAllowedIn(key, "WORKSPACE")).toBe(true);
      expect(isPermissionAllowedIn(key, "PROJECT")).toBe(false);
    }
  });

  // `audit.view` now applies in all three scopes — the same key, three
  // slices of the same log (see `lib/rbac/permissions.ts`).
  it("grants `audit.view` in platform, workspace, and project", () => {
    expect(isPermissionAllowedIn("audit.view", "PLATFORM")).toBe(true);
    expect(isPermissionAllowedIn("audit.view", "WORKSPACE")).toBe(true);
    expect(isPermissionAllowedIn("audit.view", "PROJECT")).toBe(true);
  });

  it("grants `role.manage` in all three scopes", () => {
    // One permission, three meanings — depending on where it's attached.
    for (const scope of ROLE_SCOPES) {
      expect(isPermissionAllowedIn("role.manage", scope)).toBe(true);
    }
  });

  // Installing plugin code changes what runs in the whole app; enabling it only
  // decides where it applies. The two must not be grantable at the other level.
  it("keeps installing plugins on the platform and enabling them in a workspace or a project", () => {
    expect(PERMISSIONS["plugin.manage"].scopes).toEqual(["PLATFORM"]);
    expect(PERMISSIONS["plugin.enable"].scopes).toEqual([
      "WORKSPACE",
      "PROJECT",
    ]);
    for (const scope of ["WORKSPACE", "PROJECT"] as const) {
      expect(isPermissionAllowedIn("plugin.manage", scope)).toBe(false);
      expect(isPermissionAllowedIn("plugin.enable", scope)).toBe(true);
    }
    expect(isPermissionAllowedIn("plugin.enable", "PLATFORM")).toBe(false);
  });

  // The definitions of custom fields (BARY-79): one permission, in a workspace for the fields
  // that apply everywhere and in a project for that project's. Filling a field in is not this.
  it("lets custom fields be managed in a workspace or a project, and nowhere else", () => {
    expect(PERMISSIONS["customfield.manage"].scopes).toEqual([
      "WORKSPACE",
      "PROJECT",
    ]);
    for (const scope of ["WORKSPACE", "PROJECT"] as const) {
      expect(isPermissionAllowedIn("customfield.manage", scope)).toBe(true);
    }
    expect(isPermissionAllowedIn("customfield.manage", "PLATFORM")).toBe(false);
    expect(permissionsFor("PLATFORM")).not.toContain("customfield.manage");
  });

  it("safely narrows arbitrary strings", () => {
    expect(toPermission("issue.create")).toBe("issue.create");
    expect(toPermission("project.issue.create")).toBeNull();
    expect(toPermission("")).toBeNull();
    expect(toRoleScope("WORKSPACE")).toBe("WORKSPACE");
    expect(toRoleScope("GLOBAL")).toBeNull();
  });
});

describe("System roles (lib/rbac/roles.ts)", () => {
  it("each exist exactly once — no copies per tenant", () => {
    const ids = SYSTEM_ROLES.map((r) => systemRoleId(r.scope, r.key));
    expect(new Set(ids).size).toBe(ids.length);
    // The id carries no workspace and no project.
    for (const id of ids) expect(id.startsWith("sys:")).toBe(true);
  });

  it("distributes across the three scopes", () => {
    expect(systemRolesIn("PLATFORM").map((r) => r.key)).toEqual([
      "platform_admin",
      "platform_support",
      "platform_member",
    ]);
    expect(systemRolesIn("WORKSPACE").map((r) => r.key)).toEqual([
      "owner",
      "admin",
      "manager",
      "project_lead",
      "member",
      "viewer",
      "guest",
    ]);
    expect(systemRolesIn("PROJECT").map((r) => r.key)).toEqual([
      "project_admin",
      "contributor",
      "project_viewer",
      "project_guest",
      "blocked",
    ]);
  });

  for (const scope of ROLE_SCOPES) {
    describe(scope, () => {
      const roles = systemRolesIn(scope as RoleScope);

      it("carries only permissions that may be granted in this scope", () => {
        for (const r of roles) {
          for (const p of r.allow) {
            expect(isPermissionAllowedIn(p, r.scope)).toBe(true);
          }
        }
      });

      it("references only valid keys and repeats none", () => {
        const valid = new Set<string>(ALL_PERMISSIONS);
        for (const r of roles) {
          expect(new Set(r.allow).size).toBe(r.allow.length);
          for (const p of r.allow) expect(valid.has(p)).toBe(true);
        }
      });

      it("assigns every rank only once", () => {
        const ranks = roles.map((r) => r.rank);
        expect(new Set(ranks).size).toBe(ranks.length);
      });
    });
  }

  describe("Scope PLATFORM", () => {
    it("deliberately gives platform_admin NO tenant access", () => {
      const admin = role("platform_admin");
      expect(admin.allow).not.toContain("tenant.access");
      // …but everything else in the scope.
      expect(admin.allow.length).toBe(permissionsFor("PLATFORM").length - 1);
    });

    it("bundles tenant access in platform_support", () => {
      const support = role("platform_support");
      expect(support.allow).toContain("tenant.access");
      expect(support.allow).not.toContain("user.manage");
    });

    it("leaves the null role without any rights", () => {
      const member = role("platform_member");
      expect(member.allow).toEqual([]);
    });

    it("lets only the platform admin install plugins", () => {
      const holders = systemRolesIn("PLATFORM")
        .filter((r) => r.allow.includes("plugin.manage"))
        .map((r) => r.key);
      expect(holders).toEqual(["platform_admin"]);
    });
  });

  describe("Scope WORKSPACE", () => {
    it("gives the owner everything in its scope", () => {
      expect(role("owner").allow.length).toBe(
        permissionsFor("WORKSPACE").length,
      );
    });

    it("takes only workspace.delete away from the admin", () => {
      const admin = role("admin");
      expect(admin.allow).not.toContain("workspace.delete");
      expect(admin.allow).toContain("role.manage");
    });

    it("keeps the manager out of roles and private projects", () => {
      const manager = role("manager");
      expect(manager.allow).not.toContain("role.manage");
      expect(manager.allow).not.toContain("project.view.all");
      expect(manager.allow).toContain("member.invite");
    });

    it("lets only the owner and the admin enable plugins", () => {
      // Switching a plugin on lets its code work with the workspace's data. The
      // manager configures the workspace but is deliberately left out.
      const holders = systemRolesIn("WORKSPACE")
        .filter((r) => r.allow.includes("plugin.enable"))
        .map((r) => r.key);
      expect(holders).toEqual(["owner", "admin"]);
      expect(role("manager").allow).toContain("webhook.manage");
    });

    it("lets the owner, the admin and the manager manage the workspace's custom fields, and nobody else", () => {
      // They are configuration, like the statuses and priorities: the manager has them.
      const holders = systemRolesIn("WORKSPACE")
        .filter((r) => r.allow.includes("customfield.manage"))
        .map((r) => r.key);
      expect(holders).toEqual(["owner", "admin", "manager"]);
    });

    it("lets only the project admin manage a project's custom fields", () => {
      const holders = systemRolesIn("PROJECT")
        .filter((r) => r.allow.includes("customfield.manage"))
        .map((r) => r.key);
      expect(holders).toEqual(["project_admin"]);
      // Filling a field in is editing the issue, which a contributor may do for their own.
      expect(role("contributor").allow).not.toContain("customfield.manage");
      expect(role("contributor").allow).toContain("issue.update.own");
    });

    it("lets only the project admin enable plugins in a project", () => {
      const holders = systemRolesIn("PROJECT")
        .filter((r) => r.allow.includes("plugin.enable"))
        .map((r) => r.key);
      expect(holders).toEqual(["project_admin"]);
    });

    it("grants the master key only to the workspace's leadership", () => {
      const opensAll = systemRolesIn("WORKSPACE")
        .filter((r) => r.allow.includes("project.admin.all"))
        .map((r) => r.key);
      expect(opensAll).toEqual(["owner", "admin", "project_lead"]);
      // Whoever may reach through also sees everything — otherwise reaching
      // through would be limited to projects they could already find anyway.
      for (const key of opensAll) {
        expect(role(key).allow).toContain("project.view.all");
      }
    });

    it("carries no project rights in any role", () => {
      // Whatever applies in the project belongs in the project role. A
      // workspace role that carried issue permissions would be ineffective
      // and therefore misleading.
      for (const r of systemRolesIn("WORKSPACE")) {
        for (const key of r.allow) {
          expect(isPermissionAllowedIn(key, "WORKSPACE")).toBe(true);
        }
      }
    });

    it("names the enrollment project role for every role", () => {
      // Without this field, enrollment would have to guess from workspace
      // permissions what someone may do in the project — but those no longer
      // live there.
      const projectKeys = systemRolesIn("PROJECT").map((r) => r.key);
      for (const r of systemRolesIn("WORKSPACE")) {
        expect(r.defaultProjectRoleKey).toBeDefined();
        expect(projectKeys).toContain(r.defaultProjectRoleKey as string);
      }
    });
  });

  describe("Scope PROJECT", () => {
    const READ_AND_COMMENT: Permission[] = [
      "project.view",
      "comment.create",
      "comment.delete.own",
      "comment.update.own",
      "comment.react",
    ];

    it("restricts the restrictive roles solely through their list", () => {
      // A role only names what it allows. Since only the project role counts
      // in the project, "not listed" is already the denial — and a newly
      // introduced project permission is therefore automatically locked out,
      // without anyone maintaining a deny list.
      for (const key of ["project_viewer", "project_guest"]) {
        expect([...role(key).allow].sort()).toEqual(
          [...READ_AND_COMMENT].sort(),
        );
      }
    });

    it("blocks all project access with `blocked`", () => {
      // The empty list is the whole exclusion. What distinguishes `blocked`
      // from "no row in ProjectMember at all" isn't here, but in enrollment:
      // `enrollWorkspaceMembers` writes with `skipDuplicates` and leaves an
      // existing row alone. Whoever was removed comes back when switching to
      // public; whoever is blocked stays out.
      expect(role("blocked").allow).toEqual([]);
    });

    it("gives project_admin everything in its scope", () => {
      expect(role("project_admin").allow.length).toBe(
        permissionsFor("PROJECT").length,
      );
    });
  });
});
