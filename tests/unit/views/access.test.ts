import { describe, expect, it } from "bun:test";
import {
  canChangeVisibility,
  canCreateView,
  canEditView,
  canSeeView,
  type ViewAccessFacts,
  visibilityFitsScope,
} from "@/features/views/access";

const facts = (over: Partial<ViewAccessFacts> = {}): ViewAccessFacts => ({
  userId: "me",
  canSeeScope: true,
  canShare: false,
  canManage: false,
  ...over,
});

const mine = { visibility: "PRIVATE" as const, ownerId: "me" };
const theirsPrivate = { visibility: "PRIVATE" as const, ownerId: "other" };
const sharedMine = { visibility: "PROJECT" as const, ownerId: "me" };
const sharedTheirs = { visibility: "PROJECT" as const, ownerId: "other" };

describe("visibilityFitsScope", () => {
  it("ties PROJECT to a project and WORKSPACE to none", () => {
    expect(visibilityFitsScope("PROJECT", "p1")).toBe(true);
    expect(visibilityFitsScope("PROJECT", null)).toBe(false);
    expect(visibilityFitsScope("WORKSPACE", null)).toBe(true);
    expect(visibilityFitsScope("WORKSPACE", "p1")).toBe(false);
    expect(visibilityFitsScope("PRIVATE", "p1")).toBe(true);
    expect(visibilityFitsScope("PRIVATE", null)).toBe(true);
  });
});

describe("canSeeView", () => {
  it("shows a private view to its owner only", () => {
    expect(canSeeView(mine, facts())).toBe(true);
    expect(canSeeView(theirsPrivate, facts({ canManage: true }))).toBe(false);
  });

  it("shows a shared view to everyone in the scope", () => {
    expect(canSeeView(sharedTheirs, facts())).toBe(true);
  });

  it("hides everything once the scope is out of reach", () => {
    expect(canSeeView(mine, facts({ canSeeScope: false }))).toBe(false);
    expect(canSeeView(sharedTheirs, facts({ canSeeScope: false }))).toBe(false);
  });
});

describe("canEditView", () => {
  it("lets the owner edit a private view without any permission", () => {
    expect(canEditView(mine, facts())).toBe(true);
  });

  it("lets the creator edit a shared view only while holding view.share", () => {
    expect(canEditView(sharedMine, facts({ canShare: true }))).toBe(true);
    expect(canEditView(sharedMine, facts())).toBe(false);
  });

  it("needs view.manage for someone else's shared view", () => {
    expect(canEditView(sharedTheirs, facts({ canShare: true }))).toBe(false);
    expect(canEditView(sharedTheirs, facts({ canManage: true }))).toBe(true);
  });

  it("keeps a shared view whose creator was deleted manageable", () => {
    const orphan = { visibility: "PROJECT" as const, ownerId: null };
    expect(canEditView(orphan, facts({ canShare: true }))).toBe(false);
    expect(canEditView(orphan, facts({ canManage: true }))).toBe(true);
  });
});

describe("canCreateView", () => {
  it("allows a private view to anyone in the scope", () => {
    expect(canCreateView("PRIVATE", "p1", facts())).toBe(true);
    expect(canCreateView("PRIVATE", "p1", facts({ canSeeScope: false }))).toBe(
      false,
    );
  });

  it("needs view.share for a shared view", () => {
    expect(canCreateView("PROJECT", "p1", facts())).toBe(false);
    expect(canCreateView("PROJECT", "p1", facts({ canShare: true }))).toBe(
      true,
    );
  });

  it("refuses a visibility that doesn't fit the scope", () => {
    expect(canCreateView("WORKSPACE", "p1", facts({ canShare: true }))).toBe(
      false,
    );
    expect(canCreateView("PROJECT", null, facts({ canShare: true }))).toBe(
      false,
    );
  });
});

describe("canChangeVisibility", () => {
  const withProject = <T extends object>(v: T) => ({ ...v, projectId: "p1" });

  it("lets the owner share a private view with view.share", () => {
    expect(
      canChangeVisibility(
        withProject(mine),
        "PROJECT",
        facts({ canShare: true }),
      ),
    ).toBe(true);
    expect(canChangeVisibility(withProject(mine), "PROJECT", facts())).toBe(
      false,
    );
  });

  it("lets only the creator take a shared view back to private", () => {
    expect(
      canChangeVisibility(
        withProject(sharedMine),
        "PRIVATE",
        facts({ canShare: true }),
      ),
    ).toBe(true);
    expect(
      canChangeVisibility(
        withProject(sharedTheirs),
        "PRIVATE",
        facts({ canManage: true }),
      ),
    ).toBe(false);
  });

  it("refuses a visibility from the other level", () => {
    expect(
      canChangeVisibility(
        withProject(sharedMine),
        "WORKSPACE",
        facts({ canShare: true, canManage: true }),
      ),
    ).toBe(false);
  });
});
