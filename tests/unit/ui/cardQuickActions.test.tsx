import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));

mock.module("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// The sheet only reads the patch function; the Server Function behind it
// would drag Prisma into the test.
mock.module("@/features/issues/useIssuePatch", () => ({
  useIssuePatch: () => ({ patch: () => {}, isPending: false }),
}));

import { CardQuickActions } from "@/features/issues/components/BoardCard/CardQuickActions";
import type { GroupDef } from "@/features/issues/group";
import type { IssueDetail } from "@/types";

const groups: GroupDef[] = [
  { key: "status", id: "todo", label: "Todo", alwaysShow: true },
  { key: "status", id: "done", label: "Done", alwaysShow: true },
];

function issue(access: Partial<IssueDetail["access"]>): IssueDetail {
  return {
    id: "i-1",
    assignee: null,
    access: { canEdit: false, canAssign: false, ...access },
  } as unknown as IssueDetail;
}

function render(i: IssueDetail, withMove = true) {
  return renderToStaticMarkup(
    <CardQuickActions
      issue={i}
      identifier="WEB-7"
      title="Fix the login redirect"
      members={[]}
      moveTargets={withMove ? groups : undefined}
      currentGroupId="todo"
      onMoveTo={withMove ? () => {} : undefined}
      onOpen={() => {}}
      onOpenInNewTab={() => {}}
      onEditTitle={() => {}}
      close={() => {}}
    />,
  );
}

describe("CardQuickActions", () => {
  it("names the issue it acts on", () => {
    const html = render(issue({}));
    expect(html).toContain("WEB-7");
    expect(html).toContain("Fix the login redirect");
  });

  it("offers only opening to someone who can't change anything", () => {
    const html = render(issue({}));
    expect(html).toContain("issues.quickOpen");
    expect(html).toContain("issues.quickOpenNewTab");
    expect(html).not.toContain("actions.editTitle");
    expect(html).not.toContain("issues.quickAssign");
    expect(html).not.toContain("issues.moveTo");
  });

  it("adds rename and move to someone who can edit", () => {
    const html = render(issue({ canEdit: true }));
    expect(html).toContain("actions.editTitle");
    expect(html).toContain("issues.moveTo");
    expect(html).toContain("Todo");
    expect(html).toContain("Done");
    expect(html).not.toContain("issues.quickAssign");
  });

  it("adds assigning for someone who can assign", () => {
    expect(render(issue({ canAssign: true }))).toContain("issues.quickAssign");
  });

  it("marks the column the card is in", () => {
    const html = render(issue({ canEdit: true }));
    expect(html.match(/aria-current="true"/g)).toHaveLength(1);
  });

  it("has no move section without columns to move to", () => {
    expect(render(issue({ canEdit: true }), false)).not.toContain(
      "issues.moveTo",
    );
  });
});
