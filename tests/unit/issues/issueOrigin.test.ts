import { describe, expect, it } from "bun:test";
import {
  carryIssueOrigin,
  issueOrigin,
  rememberIssueOrigin,
} from "@/features/issues/issue-origin";

function memoryStore() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
  };
}

describe("issue origin", () => {
  it("returns the view an issue was opened from", () => {
    const store = memoryStore();
    rememberIssueOrigin("WEB-7", "/acme/project/web/list?status=todo", store);
    expect(issueOrigin("WEB-7", store)).toBe(
      "/acme/project/web/list?status=todo",
    );
  });

  it("knows nothing about an issue it wasn't asked to remember", () => {
    const store = memoryStore();
    rememberIssueOrigin("WEB-7", "/acme/project/web/list", store);
    // A later visit from elsewhere (a link, the inbox) must not follow it.
    expect(issueOrigin("WEB-8", store)).toBeNull();
  });

  it("only keeps the latest issue's origin", () => {
    const store = memoryStore();
    rememberIssueOrigin("WEB-7", "/acme/project/web/list", store);
    rememberIssueOrigin("WEB-9", "/acme/my", store);
    expect(issueOrigin("WEB-7", store)).toBeNull();
    expect(issueOrigin("WEB-9", store)).toBe("/acme/my");
  });

  it("carries the origin along when stepping to the next issue", () => {
    const store = memoryStore();
    rememberIssueOrigin("WEB-7", "/acme/project/web/list", store);
    carryIssueOrigin("WEB-7", "WEB-8", store);
    expect(issueOrigin("WEB-8", store)).toBe("/acme/project/web/list");
  });

  it("doesn't invent an origin when there is none to carry", () => {
    const store = memoryStore();
    carryIssueOrigin("WEB-7", "WEB-8", store);
    expect(issueOrigin("WEB-8", store)).toBeNull();
  });

  it("copes with storage that isn't there or holds garbage", () => {
    expect(issueOrigin("WEB-7", null)).toBeNull();
    rememberIssueOrigin("WEB-7", "/x", null);
    const store = memoryStore();
    store.setItem("issue-origin", "{not json");
    expect(issueOrigin("WEB-7", store)).toBeNull();
  });
});
