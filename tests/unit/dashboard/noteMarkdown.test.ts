import { describe, expect, it } from "bun:test";
import {
  plainTitle,
  toggleTask,
} from "@/features/dashboard/components/Widget/components/NoteMarkdown";

// The note's light Markdown: what names a tab, and how a click on a task
// rewrites the text.

describe("plainTitle", () => {
  it("drops heading, list and task marks", () => {
    expect(plainTitle("# Ziele Q4\nmehr")).toBe("Ziele Q4");
    expect(plainTitle("- [ ] Release planen")).toBe("Release planen");
    expect(plainTitle("1. Erstens")).toBe("Erstens");
  });

  it("keeps a link's text and drops emphasis", () => {
    expect(plainTitle("**Wichtig:** [Docs](https://x.y)")).toBe(
      "Wichtig: Docs",
    );
  });

  it("skips empty first lines", () => {
    expect(plainTitle("\n\n  Hallo")).toBe("Hallo");
  });
});

describe("toggleTask", () => {
  it("ticks and unticks the task on a line", () => {
    const text = "Liste\n- [ ] eins\n- [x] zwei";
    expect(toggleTask(text, 1)).toBe("Liste\n- [x] eins\n- [x] zwei");
    expect(toggleTask(text, 2)).toBe("Liste\n- [ ] eins\n- [ ] zwei");
  });
});
