import { describe, expect, it, mock } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

// ── Mocks ─────────────────────────────────────────────────────────────────────
//
// What's checked is whether the trigger renders — not what it opens. The
// modal itself is therefore a stand-in: otherwise it would pull in the
// Server Function, and with it Prisma, into the test.

mock.module(
  "@/features/issues/components/CreateIssueModal/CreateIssueModal",
  () => ({ CreateIssueModal: () => null }),
);

mock.module("@iconify/react", () => ({
  Icon: ({ icon }: { icon: string }) => <i data-icon={icon} />,
}));

mock.module("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

mock.module("@/lib/context", () => ({
  useModal: () => ({ openModal: () => "" }),
}));

mock.module("@/i18n/navigation", () => ({
  usePathname: () => "/acme/project/web",
  useRouter: () => ({ push: () => {}, refresh: () => {} }),
}));

import { BoardColumn } from "@/features/issues/components/BoardColumn/BoardColumn";
import { ListGroupHeader } from "@/features/issues/components/ListView/components/ListGroupHeader";
import { NewIssueButton } from "@/features/issues/components/NewIssueButton/NewIssueButton";
import type { IssueComposerData } from "@/features/issues/types";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STATUS = {
  id: "backlog",
  name: "Backlog",
  short: "B",
  color: "#888",
  isColumn: true,
};

const PROJECTS = [
  {
    id: "p-1",
    name: "Web",
    slug: "web",
    prefix: "WEB",
    color: "#111",
    avatarUrl: null,
  },
  {
    id: "p-2",
    name: "App",
    slug: "app",
    prefix: "APP",
    color: "#222",
    avatarUrl: null,
  },
];

/** Composer data in which exactly the named projects allow creating issues. */
function composer(...creatableProjectIds: string[]): IssueComposerData {
  return {
    workspaceId: "acme",
    me: {
      id: "u-1",
      firstName: "Ada",
      lastName: "L",
      email: "ada@example.com",
      color: "#111",
    },
    projects: PROJECTS,
    members: [],
    labels: [],
    statuses: [STATUS],
    priorities: [],
    searchIssues: [],
    issueTypes: [{ id: "feature", name: "Feature", color: "#111" }],
    creatableProjectIds,
  };
}

const column = (data: IssueComposerData) =>
  renderToStaticMarkup(
    <BoardColumn
      status={STATUS}
      issues={[]}
      projectId="p-1"
      lookups={{
        projects: PROJECTS,
        members: [],
        labels: [],
        issueTypes: data.issueTypes,
      }}
      composer={data}
      newIssueLabel="Neue Aufgabe"
      isOver={false}
      dragging={null}
      dragOverCard={null}
      insertAbove={false}
      onColumnDragOver={() => {}}
      onColumnDragLeave={() => {}}
      onColumnDrop={() => {}}
      onCardDragStart={() => () => {}}
      onCardDragEnd={() => {}}
      onCardDragOver={() => () => {}}
      isCardActive={() => false}
      isCardFocused={() => false}
      onCardOpen={() => {}}
      onCardOpenInNewTab={() => {}}
    />,
  );

const groupHeader = (data: IssueComposerData) =>
  renderToStaticMarkup(
    <ListGroupHeader
      status={STATUS}
      count={0}
      projectId="p-1"
      composer={data}
      collapsed={false}
      onToggle={() => {}}
    />,
  );

/** How many triggers does the markup carry? All three spots use a plus icon. */
const plusCount = (html: string) =>
  html.split('data-icon="lucide:plus"').length - 1;

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("NewIssueButton (sidebar)", () => {
  it("appears when an issue may be created somewhere", () => {
    const html = renderToStaticMarkup(
      <NewIssueButton data={composer("p-1")} />,
    );
    expect(plusCount(html)).toBe(1);
    expect(html).toContain("actions.newIssue");
  });

  it("disappears entirely when nothing may be created anywhere", () => {
    const html = renderToStaticMarkup(<NewIssueButton data={composer()} />);
    expect(html).toBe("");
  });

  // The button defaults to the route's project. If nothing may be created
  // there, it falls back to the first allowed project instead of disappearing.
  it("appears even when only a different project is allowed", () => {
    const html = renderToStaticMarkup(
      <NewIssueButton data={composer("p-2")} />,
    );
    expect(plusCount(html)).toBe(1);
  });
});

describe("BoardColumn", () => {
  it("shows a plus in the header and the row at the end when allowed", () => {
    // Two triggers: the plus in the column header and the card below it.
    expect(plusCount(column(composer("p-1")))).toBe(2);
  });

  it("shows neither when issue.create is missing for this project", () => {
    expect(plusCount(column(composer()))).toBe(0);
  });

  it("checks the column's project, not just any project", () => {
    // p-2 is allowed, but the column belongs to p-1.
    expect(plusCount(column(composer("p-2")))).toBe(0);
  });

  it("remains a column — only the triggers are missing", () => {
    const html = column(composer());
    expect(html).toContain("Backlog");
  });
});

describe("ListGroupHeader", () => {
  it("shows the plus when allowed", () => {
    expect(plusCount(groupHeader(composer("p-1")))).toBe(1);
  });

  it("does not show it when issue.create is missing", () => {
    expect(plusCount(groupHeader(composer()))).toBe(0);
  });

  it("keeps the group header along with its collapse arrow", () => {
    const html = groupHeader(composer());
    expect(html).toContain("Backlog");
    expect(html).toContain('data-icon="lucide:chevron-down"');
  });
});
