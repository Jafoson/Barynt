// The gallery pictures of the repository README: the guide's screenshots,
// cut to one size (16:9, from the top left) so the grid looks even.
//
//   node scripts/docs-shots/readme-images.mjs
//
// Run it after re-recording the screenshots (capture.mjs).

import { join } from "node:path";
import sharp from "sharp";

const SHOTS = [
  "board",
  "issue-detail",
  "views-gallery",
  "roles",
  "inbox",
  "mcp-settings",
];
const SRC = join(import.meta.dirname, "../../docs/guide/assets/en");
const OUT = join(import.meta.dirname, "../../docs/readme");

for (const name of SHOTS) {
  await sharp(join(SRC, `${name}.webp`))
    .resize(1200, 675, { fit: "cover", position: "left top" })
    .webp({ quality: 82 })
    .toFile(join(OUT, `${name}.webp`));
  console.log(`wrote docs/readme/${name}.webp`);
}
