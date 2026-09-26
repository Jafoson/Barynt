import { describe, expect, it } from "bun:test";
import {
  answersForProject,
  fieldsForProject,
  withAnswer,
} from "@/features/custom-fields/composerAnswers";
import type { CustomFieldRow } from "@/features/custom-fields/types";

// The answers a new issue is being made with while the composer is open.

function field(id: string, projectId: string | null): CustomFieldRow {
  return {
    id,
    key: id,
    name: id,
    description: "",
    icon: null,
    type: "text",
    config: { maxLength: 20 },
    position: 0,
    archived: false,
    pluginId: null,
    workspaceId: "w",
    projectId,
  };
}
const fields = [
  field("wide", null),
  field("web", "p-web"),
  field("app", "p-app"),
];

describe("the fields that apply to a project", () => {
  it("are the workspace-wide ones and the project's own, in their order", () => {
    expect(fieldsForProject(fields, "p-web").map((f) => f.id)).toEqual([
      "wide",
      "web",
    ]);
    expect(fieldsForProject(fields, "p-app").map((f) => f.id)).toEqual([
      "wide",
      "app",
    ]);
  });

  it("are only the workspace-wide ones for a project with none of its own", () => {
    expect(fieldsForProject(fields, "p-other").map((f) => f.id)).toEqual([
      "wide",
    ]);
  });

  it("are none when there are no fields", () => {
    expect(fieldsForProject([], "p-web")).toEqual([]);
  });
});

describe("setting an answer", () => {
  it("adds it, or changes it, leaving the others", () => {
    expect(withAnswer({ a: "x" }, "b", 5)).toEqual({ a: "x", b: 5 });
    expect(withAnswer({ a: "x", b: 1 }, "a", "y")).toEqual({ a: "y", b: 1 });
  });

  it("keeps zero, which is an answer", () => {
    expect(withAnswer({}, "a", 0)).toEqual({ a: 0 });
  });

  it("removes it when cleared: a field with no answer has no entry", () => {
    expect(withAnswer({ a: "x", b: 1 }, "a", null)).toEqual({ b: 1 });
    expect(Object.keys(withAnswer({ a: "x" }, "a", null))).toEqual([]);
  });

  it("does not change the object it was given", () => {
    const before = { a: "x" };
    withAnswer(before, "a", "y");
    withAnswer(before, "a", null);
    expect(before).toEqual({ a: "x" });
  });
});

describe("what is left after the project changed", () => {
  it("keeps the answers of fields that still apply", () => {
    expect(answersForProject({ wide: "x", web: "y" }, fields, "p-web")).toEqual(
      { wide: "x", web: "y" },
    );
  });

  it("drops the project's own answers when going to another project", () => {
    expect(answersForProject({ wide: "x", web: "y" }, fields, "p-app")).toEqual(
      { wide: "x" },
    );
  });

  it("drops the answer of a field the composer does not know", () => {
    expect(
      answersForProject({ ghost: "x", wide: "y" }, fields, "p-web"),
    ).toEqual({
      wide: "y",
    });
  });

  it("is empty when nothing applies", () => {
    expect(answersForProject({ web: "y" }, fields, "p-other")).toEqual({});
  });
});
