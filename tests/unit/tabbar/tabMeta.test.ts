import { describe, expect, it } from "bun:test";

import {
  tabColor,
  tabIcon,
  tabMeta,
  tabTitle,
  workspaceIdFromPath,
} from "@/components/ui/layout/TabBar/tabMeta";
import type { Translator } from "@/i18n/types";
import type { Project } from "@/types";

// Tab URLs are locale-agnostic (next-intl usePathname) — the first segment is
// the scope (workspace ID or "admin"), the second the section.
const BASE = "/fuchsly";

const projects: Project[] = [
  {
    id: "p-1",
    name: "Fuchsly",
    slug: "fuchsly",
    prefix: "FUX",
    color: "#3b82f6",
    avatarUrl: null,
    hiddenDetailFields: [],
  },
  {
    id: "p-2",
    name: "Side Project",
    slug: "side-project",
    prefix: "SID",
    color: "#22c55e",
    avatarUrl: null,
    hiddenDetailFields: [],
  },
];

// Only the `nav` slice is used by the helpers — fake translator returning the
// German values for the nav keys that tabMeta/tabTitle look up.
const dict: Record<string, string> = {
  "nav.myIssues": "Meine Aufgaben",
  "nav.inbox": "Posteingang",
  "nav.board": "Board",
  "nav.issues": "Aufgaben",
  "nav.members": "Mitglieder",
  "nav.teams": "Teams",
  "nav.settings": "Einstellungen",
  "nav.projects": "Projekte",
  "nav.general": "Allgemein",
  "nav.roles": "Rollen & Rechte",
  "nav.labels": "Labels",
  "nav.account": "Konto",
  "nav.appearance": "Aussehen",
  "nav.notifications": "Benachrichtigungen",
  "nav.security": "Sicherheit",
  "nav.connections": "Verbundene Konten",
  "nav.overview": "Übersicht",
  "nav.users": "Benutzer",
  "nav.workspaces": "Workspaces",
  "nav.audit": "Protokoll",
};
const t = ((key: string) => dict[key] ?? key) as unknown as Translator;

describe("tabTitle()", () => {
  it("returns the project name for a project board URL", () => {
    expect(tabTitle(`${BASE}/project/fuchsly`, projects, t)).toBe("Fuchsly");
  });

  it("resolves a slug with hyphens correctly", () => {
    expect(tabTitle(`${BASE}/project/side-project`, projects, t)).toBe(
      "Side Project",
    );
  });

  it("falls back to 'Board' when the project is unknown", () => {
    expect(tabTitle(`${BASE}/project/unbekannt`, projects, t)).toBe("Board");
  });

  it("maps the remaining navigation routes to their translation", () => {
    expect(tabTitle(`${BASE}/my`, projects, t)).toBe("Meine Aufgaben");
    expect(tabTitle(`${BASE}/inbox`, projects, t)).toBe("Posteingang");
    expect(tabTitle(`${BASE}/members`, projects, t)).toBe("Mitglieder");
    expect(tabTitle(`${BASE}/teams`, projects, t)).toBe("Teams");
    expect(tabTitle(`${BASE}/settings`, projects, t)).toBe("Einstellungen");
    expect(tabTitle(`${BASE}/projects`, projects, t)).toBe("Projekte");
  });
});

describe("tabIcon()", () => {
  it("uses the list icon for a project's /list view", () => {
    expect(tabIcon(`${BASE}/project/fuchsly/list`)).toBe("lucide:list");
  });

  it("uses the board icon for a project's board view", () => {
    expect(tabIcon(`${BASE}/project/fuchsly`)).toBe("lucide:square-kanban");
  });

  it("uses the overview icon for a project's home page", () => {
    // Board and Overview once shared the same icon — now that both exist,
    // you need to be able to tell them apart in the tab.
    expect(tabIcon(`${BASE}/project/fuchsly/overview`)).toBe(
      "lucide:layout-dashboard",
    );
  });

  it("uses the members icon for a project's members view", () => {
    expect(tabIcon(`${BASE}/project/fuchsly/members`)).toBe("lucide:users");
  });

  it("uses the gear for the head of the project settings", () => {
    expect(tabIcon(`${BASE}/project/fuchsly/settings`)).toBe("lucide:settings");
  });

  it("uses the icon of the respective settings section", () => {
    expect(tabIcon(`${BASE}/project/fuchsly/settings/roles`)).toBe(
      "lucide:shield-check",
    );
    expect(tabIcon(`${BASE}/project/fuchsly/settings/labels`)).toBe(
      "lucide:tag",
    );
  });

  it("falls back to the gear for unknown settings sections", () => {
    expect(tabIcon(`${BASE}/project/fuchsly/settings/gibtsnicht`)).toBe(
      "lucide:settings",
    );
  });

  it("falls back to the overview icon for unknown subpages", () => {
    // Overview is the page a project resolves to by default — even knowing
    // nothing else about an address, you at least know it belongs there.
    expect(tabIcon(`${BASE}/project/fuchsly/gibtsnicht`)).toBe(
      "lucide:layout-dashboard",
    );
  });
});

describe("Admin routes", () => {
  it("maps /admin to the overview", () => {
    expect(tabTitle("/admin", projects, t)).toBe("Übersicht");
    expect(tabIcon("/admin")).toBe("lucide:layout-dashboard");
  });

  it("maps /admin/users", () => {
    expect(tabTitle("/admin/users", projects, t)).toBe("Benutzer");
    expect(tabIcon("/admin/users")).toBe("lucide:users");
  });

  it("maps /admin/workspaces", () => {
    expect(tabTitle("/admin/workspaces", projects, t)).toBe("Workspaces");
    expect(tabIcon("/admin/workspaces")).toBe("lucide:building-2");
  });

  it("maps /admin/projects", () => {
    expect(tabTitle("/admin/projects", projects, t)).toBe("Projekte");
    expect(tabIcon("/admin/projects")).toBe("lucide:folders");
  });

  it("maps /admin/audit", () => {
    expect(tabTitle("/admin/audit", projects, t)).toBe("Protokoll");
    expect(tabIcon("/admin/audit")).toBe("lucide:scroll-text");
  });

  it("maps /admin/roles", () => {
    expect(tabTitle("/admin/roles", projects, t)).toBe("Rollen & Rechte");
    expect(tabIcon("/admin/roles")).toBe("lucide:shield-check");
  });

  it("never has a project color for admin", () => {
    expect(tabColor("/admin", projects)).toBeNull();
    expect(tabColor("/admin/users", projects)).toBeNull();
  });
});

describe("tabMeta()", () => {
  it("strips the query string before deriving title/color/icon", () => {
    const meta = tabMeta(
      `${BASE}/project/fuchsly?status=todo&priority=2`,
      projects,
      t,
    );
    expect(meta.title).toBe("Fuchsly");
    expect(meta.color).toBe("#3b82f6");
    // Project color present → no icon, the color dot is shown instead.
    expect(meta.icon).toBeNull();
  });

  it("appends the (Issues) suffix for the list view", () => {
    expect(tabMeta(`${BASE}/project/fuchsly/list`, projects, t).title).toBe(
      "Fuchsly (Aufgaben)",
    );
  });

  it("keeps the suffix even with active filters in the query string", () => {
    expect(
      tabMeta(`${BASE}/project/fuchsly/list?status=done`, projects, t).title,
    ).toBe("Fuchsly (Aufgaben)");
  });

  it("appends the (Members) suffix for the members view", () => {
    expect(tabMeta(`${BASE}/project/fuchsly/members`, projects, t).title).toBe(
      "Fuchsly (Mitglieder)",
    );
  });

  it("appends (Settings) to the head of the project settings", () => {
    expect(tabMeta(`${BASE}/project/fuchsly/settings`, projects, t).title).toBe(
      "Fuchsly (Einstellungen)",
    );
  });

  // Both sections live under /settings. If they carried the same suffix,
  // tabs sitting next to each other couldn't be told apart.
  it("names the section instead of (Settings) as soon as there is one", () => {
    expect(
      tabMeta(`${BASE}/project/fuchsly/settings/roles`, projects, t).title,
    ).toBe("Fuchsly (Rollen & Rechte)");
    expect(
      tabMeta(`${BASE}/project/fuchsly/settings/labels`, projects, t).title,
    ).toBe("Fuchsly (Labels)");
  });

  it("falls back to (Settings) for an unknown section", () => {
    expect(
      tabMeta(`${BASE}/project/fuchsly/settings/gibtsnicht`, projects, t).title,
    ).toBe("Fuchsly (Einstellungen)");
  });

  it("appends NO suffix for the board view", () => {
    expect(
      tabMeta(`${BASE}/project/fuchsly?status=done`, projects, t).title,
    ).toBe("Fuchsly");
  });

  it("returns an icon and no color for non-project routes", () => {
    const meta = tabMeta(`${BASE}/my`, projects, t);
    expect(meta.title).toBe("Meine Aufgaben");
    expect(meta.color).toBeNull();
    expect(meta.icon).toBe("lucide:user");
  });
});

// "My issues" has the same two views as a project. Without special handling,
// both tabs would be named the same and carry the same icon.
describe("My issues", () => {
  it("leaves the board unchanged", () => {
    const meta = tabMeta(`${BASE}/my?status=todo`, projects, t);
    expect(meta.title).toBe("Meine Aufgaben");
    expect(meta.icon).toBe("lucide:user");
  });

  it("names the list in the suffix and shows its icon", () => {
    const meta = tabMeta(`${BASE}/my/list`, projects, t);
    expect(meta.title).toBe("Meine Aufgaben (Aufgaben)");
    expect(meta.icon).toBe("lucide:list");
  });
});

// A user's own settings live under /<workspace>/account. The section
// doesn't belong to any workspace, but hangs under one — without special
// handling, all five tabs would be named "Account" and carry the same icon.
describe("Account routes", () => {
  it("names the head 'Account' and shows the person icon", () => {
    expect(tabTitle(`${BASE}/account`, projects, t)).toBe("Konto");
    expect(tabIcon(`${BASE}/account`)).toBe("lucide:user");
    expect(tabMeta(`${BASE}/account`, projects, t).title).toBe("Konto");
  });

  it("names the section as soon as there is one", () => {
    expect(tabMeta(`${BASE}/account/appearance`, projects, t).title).toBe(
      "Konto (Aussehen)",
    );
    expect(tabMeta(`${BASE}/account/security`, projects, t).title).toBe(
      "Konto (Sicherheit)",
    );
    expect(tabMeta(`${BASE}/account/connections`, projects, t).title).toBe(
      "Konto (Verbundene Konten)",
    );
  });

  it("gives each section its own icon", () => {
    expect(tabIcon(`${BASE}/account/appearance`)).toBe("lucide:palette");
    expect(tabIcon(`${BASE}/account/notifications`)).toBe("lucide:bell");
    expect(tabIcon(`${BASE}/account/security`)).toBe("lucide:shield-check");
    expect(tabIcon(`${BASE}/account/connections`)).toBe("lucide:link");
  });

  it("falls back to Account for an unknown section", () => {
    expect(tabMeta(`${BASE}/account/gibtsnicht`, projects, t).title).toBe(
      "Konto",
    );
    expect(tabIcon(`${BASE}/account/gibtsnicht`)).toBe("lucide:circle-user");
  });

  it("never has a project color", () => {
    expect(tabColor(`${BASE}/account`, projects)).toBeNull();
    expect(tabMeta(`${BASE}/account/security`, projects, t).icon).toBe(
      "lucide:shield-check",
    );
  });
});

describe("workspaceIdFromPath()", () => {
  it("returns the workspace ID for workspace routes", () => {
    expect(workspaceIdFromPath(`${BASE}/my`)).toBe("fuchsly");
    expect(workspaceIdFromPath(`${BASE}/project/fuchsly/list`)).toBe("fuchsly");
  });

  it("returns null for admin routes", () => {
    expect(workspaceIdFromPath("/admin")).toBeNull();
    expect(workspaceIdFromPath("/admin/members")).toBeNull();
  });
});

describe("Projects with the same name but different slugs", () => {
  const dupeProjects: Project[] = [
    {
      id: "p-fuch",
      name: "Fuchsly",
      slug: "fuchsly",
      prefix: "FUCH",
      color: "#f59e0b",
      avatarUrl: null,
      hiddenDetailFields: [],
    },
    {
      id: "p-fuc1",
      name: "Fuchsly",
      slug: "fuchsly-1",
      prefix: "FUC1",
      color: "#a78bfa",
      avatarUrl: null,
      hiddenDetailFields: [],
    },
  ];

  it("resolves /project/fuchsly to the first project", () => {
    expect(tabColor(`${BASE}/project/fuchsly`, dupeProjects)).toBe("#f59e0b");
  });

  it("resolves /project/fuchsly-1 to the second project", () => {
    expect(tabColor(`${BASE}/project/fuchsly-1`, dupeProjects)).toBe("#a78bfa");
  });

  it("does not confuse fuchsly and fuchsly-1", () => {
    const metaFuch = tabMeta(`${BASE}/project/fuchsly`, dupeProjects, t);
    const metaFuc1 = tabMeta(`${BASE}/project/fuchsly-1`, dupeProjects, t);
    expect(metaFuch.color).toBe("#f59e0b");
    expect(metaFuc1.color).toBe("#a78bfa");
    expect(metaFuch.color).not.toBe(metaFuc1.color);
  });

  it("the list view of fuchsly-1 is not mistaken for fuchsly", () => {
    expect(tabColor(`${BASE}/project/fuchsly-1/list`, dupeProjects)).toBe(
      "#a78bfa",
    );
    expect(tabColor(`${BASE}/project/fuchsly/list`, dupeProjects)).toBe(
      "#f59e0b",
    );
  });

  it("tabTitle returns the correct name (both are named Fuchsly)", () => {
    expect(tabTitle(`${BASE}/project/fuchsly`, dupeProjects, t)).toBe(
      "Fuchsly",
    );
    expect(tabTitle(`${BASE}/project/fuchsly-1`, dupeProjects, t)).toBe(
      "Fuchsly",
    );
  });
});

describe("tabs for an issue's own page", () => {
  const path = `${BASE}/issue/FUX-12`;

  it("is titled with the issue's key", () => {
    expect(tabTitle(path, projects, t)).toBe("FUX-12");
  });

  it("keeps a URL-encoded key readable", () => {
    expect(tabTitle(`${BASE}/issue/FUX%2D12`, projects, t)).toBe("FUX-12");
  });

  it("has its own icon and no project colour", () => {
    expect(tabIcon(path)).toBe("lucide:circle-dot");
    expect(tabColor(path, projects)).toBeNull();
  });
});
