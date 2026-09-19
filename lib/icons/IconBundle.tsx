"use client";

import { addCollection } from "@iconify/react";
import { ICON_COLLECTIONS } from "./bundle.generated";

// Registered when this module is evaluated — before any `<Icon>` renders,
// on the server (SSR) as well as in the browser — so the icons come out of
// the app's own bundle: no request to api.iconify.design, no empty
// placeholders while it answers (or when it doesn't). Icons that aren't in
// the bundle still fall back to the API. Regenerate with `bun run icons:build`.
for (const collection of ICON_COLLECTIONS) addCollection(collection);

/** Renders nothing; mounted once in the root layout so the import above runs. */
export function IconBundle() {
  return null;
}
