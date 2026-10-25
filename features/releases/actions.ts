"use server";

import { cookies } from "next/headers";
import { getLocale } from "next-intl/server";
import { APP_VERSION } from "@/lib/app-info";
import { listReleaseVersions, readReleaseNotes } from "@/lib/releases";
import type { PMDoc } from "@/lib/richtext/types";
import { getSession } from "@/lib/session";
import { SEEN_RELEASE_COOKIE } from "./constants";

/** The notes of one version in the viewer's language. `null` when there are
 *  none, or for a version that isn't out yet. */
export async function loadReleaseNotes(version: string): Promise<PMDoc | null> {
  if (!(await getSession())) return null;
  if (!(await listReleaseVersions(APP_VERSION)).includes(version)) return null;
  return readReleaseNotes(version, await getLocale());
}

/** Remembers that this browser has seen the running version's notes, so the
 *  window doesn't open on its own again until the next update. */
export async function markReleaseSeen(): Promise<void> {
  if (!(await getSession())) return;
  (await cookies()).set(SEEN_RELEASE_COOKIE, APP_VERSION, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
