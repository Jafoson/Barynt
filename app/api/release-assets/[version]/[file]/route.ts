import { readFile } from "node:fs/promises";
import path from "node:path";
import { VERSION_PATTERN } from "@/lib/releases";

/**
 * The images of a release's notes (`releases/assets/<version>/<file>`) for the
 * in-app window. Only plain raster images from a version's own folder; the
 * folder of a released version never changes, so the answer is cacheable
 * for good.
 */

const TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

const FILE_PATTERN = /^[\w-][\w.-]*\.(png|jpe?g|gif|webp)$/i;

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ version: string; file: string }> },
) {
  const { version, file } = await params;
  const type = TYPES[file.split(".").pop()?.toLowerCase() ?? ""];
  if (!VERSION_PATTERN.test(version) || !FILE_PATTERN.test(file) || !type) {
    return new Response(null, { status: 404 });
  }
  try {
    const bytes = await readFile(
      path.join(process.cwd(), "releases", "assets", version, file),
    );
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": type,
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
