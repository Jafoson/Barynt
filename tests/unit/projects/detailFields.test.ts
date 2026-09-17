import { describe, expect, it } from "bun:test";
import {
  DEFAULT_HIDDEN_DETAIL_FIELDS,
  isDetailFieldKey,
  visibleDetailFields,
} from "@/features/projects/detail-fields";

describe("visibleDetailFields() (BARY-31)", () => {
  it("shows everything when nothing is hidden", () => {
    const visible = visibleDetailFields([]);
    expect(visible.has("type")).toBe(true);
    expect(visible.has("dueDate")).toBe(true);
    expect(visible.size).toBe(11);
  });

  it("hides exactly what's listed", () => {
    const visible = visibleDetailFields(["dueDate", "storyPoints"]);
    expect(visible.has("dueDate")).toBe(false);
    expect(visible.has("storyPoints")).toBe(false);
    expect(visible.has("estimateHours")).toBe(true);
  });

  it("keeps permanent fields visible even if they're (wrongly) in the hidden list", () => {
    const visible = visibleDetailFields([
      "type",
      "status",
      "assignee",
      "description",
    ]);
    expect(visible.has("type")).toBe(true);
    expect(visible.has("status")).toBe(true);
    expect(visible.has("assignee")).toBe(true);
    expect(visible.has("description")).toBe(true);
  });

  it("ignores keys it doesn't know — a stale or future field key isn't a bug", () => {
    const visible = visibleDetailFields(["not-a-real-field"]);
    expect(visible.size).toBe(11);
  });

  it("resolves the default hidden set to hide exactly the planning fields", () => {
    const visible = visibleDetailFields(DEFAULT_HIDDEN_DETAIL_FIELDS);
    expect(visible.has("dueDate")).toBe(false);
    expect(visible.has("storyPoints")).toBe(false);
    expect(visible.has("estimateHours")).toBe(false);
    expect(visible.has("type")).toBe(true);
    expect(visible.has("status")).toBe(true);
    expect(visible.has("priority")).toBe(true);
    expect(visible.has("assignee")).toBe(true);
    expect(visible.has("description")).toBe(true);
    expect(visible.has("attachments")).toBe(true);
    expect(visible.has("labels")).toBe(true);
    expect(visible.has("relations")).toBe(true);
  });
});

describe("isDetailFieldKey() (BARY-31)", () => {
  it("accepts every real key", () => {
    expect(isDetailFieldKey("dueDate")).toBe(true);
    expect(isDetailFieldKey("description")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isDetailFieldKey("not-a-real-field")).toBe(false);
  });
});
