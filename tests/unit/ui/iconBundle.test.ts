import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { collectIconNames, renderBundle } from "../../../scripts/build-icons";

// Guards `lib/icons/bundle.generated.ts`: an icon that's used in the source
// but missing from the bundle isn't broken — it falls back to
// api.iconify.design — but it silently brings back the runtime dependency
// the bundle exists to remove (BARY-45). Regenerate: `bun run icons:build`.
describe("icon bundle", () => {
  const { source, missing } = renderBundle();

  it("finds every icon it is asked to bundle in its icon set", () => {
    expect(missing).toEqual([]);
  });

  it("is up to date with the icons used in the source", () => {
    const current = readFileSync(
      join(import.meta.dir, "../../../lib/icons/bundle.generated.ts"),
      "utf8",
    );
    expect(current).toBe(source);
  });

  it("actually finds icons (the scan isn't silently empty)", () => {
    const names = collectIconNames();
    expect(names.get("lucide")?.length ?? 0).toBeGreaterThan(50);
  });
});
