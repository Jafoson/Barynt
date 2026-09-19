import { describe, expect, it } from "bun:test";
import { ISSUE_VIEW_PATH } from "@/features/issues/components/NewIssueButton/NewIssueFabClient";

// Tab paths are locale-agnostic (next-intl `usePathname`): the first segment
// is the workspace.
describe("where the floating new-issue button shows", () => {
  it("shows on a project's board and list", () => {
    expect(ISSUE_VIEW_PATH.test("/acme/project/web")).toBe(true);
    expect(ISSUE_VIEW_PATH.test("/acme/project/web/list")).toBe(true);
    expect(ISSUE_VIEW_PATH.test("/acme/project/web/")).toBe(true);
  });

  it("shows on my issues, board and list", () => {
    expect(ISSUE_VIEW_PATH.test("/acme/my")).toBe(true);
    expect(ISSUE_VIEW_PATH.test("/acme/my/list")).toBe(true);
  });

  it("stays away from settings, members, the dashboard and the overview", () => {
    for (const path of [
      "/acme",
      "/acme/dashboard",
      "/acme/members",
      "/acme/settings",
      "/acme/project/web/overview",
      "/acme/project/web/settings",
      "/acme/inbox",
      "/admin",
    ]) {
      expect(ISSUE_VIEW_PATH.test(path)).toBe(false);
    }
  });
});
