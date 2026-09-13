import { describe, expect, test } from "bun:test";
import {
  ATTACHMENT_IMAGE_DEFAULT_WIDTH,
  ATTACHMENT_IMAGE_MAX_WIDTH,
  ATTACHMENT_IMAGE_MIN_WIDTH,
  clampAttachmentWidth,
  formatBytes,
  type ResolvedAttachmentRef,
  remapAttachmentIds,
  stripAttachmentAttrs,
  withResolvedAttachments,
} from "@/lib/richtext/attachments";
import type { PMDoc } from "@/lib/richtext/types";

function docWith(attrs: Record<string, unknown> | null): PMDoc {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Vorher" }] },
      { type: "attachment", attrs },
      { type: "paragraph", content: [{ type: "text", text: "Danach" }] },
    ],
  };
}

const RESOLVED: Record<string, ResolvedAttachmentRef> = {
  "att-1": {
    url: "https://s3.example/attachments/i-1/x.png",
    name: "screenshot.png",
    mimeType: "image/png",
    size: 2048,
  },
};

describe("withResolvedAttachments()", () => {
  test("enriches a known attachment with url/name/mimeType/size", () => {
    const doc = docWith({ id: "att-1" });
    const resolved = withResolvedAttachments(doc, RESOLVED);
    expect(resolved.content?.[1].attrs).toEqual({
      id: "att-1",
      url: "https://s3.example/attachments/i-1/x.png",
      name: "screenshot.png",
      mimeType: "image/png",
      size: 2048,
      width: null,
    });
  });

  test("leaves an unknown attachment without a url — deleted attachment", () => {
    const doc = docWith({ id: "att-gone" });
    const resolved = withResolvedAttachments(doc, RESOLVED);
    expect(resolved.content?.[1].attrs).toEqual({
      id: "att-gone",
      url: null,
      name: "",
      mimeType: null,
      size: null,
      width: null,
    });
  });

  test("keeps the width stored in the document unchanged", () => {
    const doc = docWith({ id: "att-1", width: 480 });
    const resolved = withResolvedAttachments(doc, RESOLVED);
    expect(resolved.content?.[1].attrs?.width).toBe(480);
  });

  test("recurses through nested nodes (e.g. inside a blockquote)", () => {
    const doc: PMDoc = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [{ type: "attachment", attrs: { id: "att-1" } }],
        },
      ],
    };
    const resolved = withResolvedAttachments(doc, RESOLVED);
    expect(resolved.content?.[0].content?.[0].attrs?.url).toBe(
      "https://s3.example/attachments/i-1/x.png",
    );
  });

  test("leaves other node types unchanged", () => {
    const doc: PMDoc = {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Hi" }] }],
    };
    expect(withResolvedAttachments(doc, RESOLVED)).toEqual(doc);
  });
});

describe("stripAttachmentAttrs()", () => {
  test("strips everything except id and width — even accidentally included attributes", () => {
    const doc = docWith({
      id: "att-1",
      url: "https://s3.example/attachments/i-1/x.png",
      name: "screenshot.png",
      mimeType: "image/png",
      size: 2048,
    });
    const stripped = stripAttachmentAttrs(doc);
    expect(stripped.content?.[1].attrs).toEqual({ id: "att-1", width: null });
  });

  test("keeps a width that is set", () => {
    const doc = docWith({ id: "att-1", width: 480 });
    const stripped = stripAttachmentAttrs(doc);
    expect(stripped.content?.[1].attrs).toEqual({ id: "att-1", width: 480 });
  });

  test("recurses through nested nodes", () => {
    const doc: PMDoc = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "attachment",
              attrs: { id: "att-1", url: "https://s3.example/x.png" },
            },
          ],
        },
      ],
    };
    expect(stripAttachmentAttrs(doc).content?.[0].content?.[0].attrs).toEqual({
      id: "att-1",
      width: null,
    });
  });
});

describe("remapAttachmentIds()", () => {
  test("swaps a mapped draft id for the real one", () => {
    const doc = docWith({ id: "draft-1" });
    const remapped = remapAttachmentIds(doc, new Map([["draft-1", "att-1"]]));
    expect(remapped.content?.[1].attrs).toEqual({ id: "att-1", width: null });
  });

  test("keeps the width stored in the document unchanged", () => {
    const doc = docWith({ id: "draft-1", width: 480 });
    const remapped = remapAttachmentIds(doc, new Map([["draft-1", "att-1"]]));
    expect(remapped.content?.[1].attrs).toEqual({ id: "att-1", width: 480 });
  });

  test("drops the node for a draft id mapped to null — a failed upload", () => {
    const doc = docWith({ id: "draft-1" });
    const remapped = remapAttachmentIds(doc, new Map([["draft-1", null]]));
    expect(remapped.content).toHaveLength(2);
    expect(remapped.content?.some((n) => n.type === "attachment")).toBe(false);
  });

  test("leaves an id absent from the map untouched", () => {
    const doc = docWith({ id: "att-existing" });
    const remapped = remapAttachmentIds(doc, new Map());
    expect(remapped.content?.[1].attrs).toEqual({ id: "att-existing" });
  });

  test("recurses through nested nodes", () => {
    const doc: PMDoc = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [{ type: "attachment", attrs: { id: "draft-1" } }],
        },
      ],
    };
    const remapped = remapAttachmentIds(doc, new Map([["draft-1", "att-1"]]));
    expect(remapped.content?.[0].content?.[0].attrs).toEqual({
      id: "att-1",
      width: null,
    });
  });
});

describe("clampAttachmentWidth()", () => {
  test("keeps a value that is within range", () => {
    expect(clampAttachmentWidth(400)).toBe(400);
  });

  test("rounds to whole pixels", () => {
    expect(clampAttachmentWidth(400.6)).toBe(401);
  });

  test("clamps at the lower and upper bound", () => {
    expect(clampAttachmentWidth(10)).toBe(ATTACHMENT_IMAGE_MIN_WIDTH);
    expect(clampAttachmentWidth(5000)).toBe(ATTACHMENT_IMAGE_MAX_WIDTH);
  });

  test("falls back to the default width — missing or invalid value", () => {
    expect(clampAttachmentWidth(null)).toBe(ATTACHMENT_IMAGE_DEFAULT_WIDTH);
    expect(clampAttachmentWidth(undefined)).toBe(
      ATTACHMENT_IMAGE_DEFAULT_WIDTH,
    );
    expect(clampAttachmentWidth(Number.NaN)).toBe(
      ATTACHMENT_IMAGE_DEFAULT_WIDTH,
    );
    expect(clampAttachmentWidth("400")).toBe(ATTACHMENT_IMAGE_DEFAULT_WIDTH);
  });
});

describe("formatBytes()", () => {
  test("shows bytes under 1 KB directly", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  test("converts to KB/MB/GB", () => {
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0 MB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
  });
});
