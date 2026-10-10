import { fetchPublic } from "@/lib/public-fetch";

// A site's icon, fetched by this server — see `lib/public-fetch.ts` for why
// and for the guards.

const MAX_BYTES = 64 * 1024;

export interface FetchedIcon {
  body: Uint8Array;
  contentType: string;
}

/** The icon at `https://<host>/favicon.ico`, or `null` if there is none. */
export async function fetchFavicon(host: string): Promise<FetchedIcon | null> {
  let url: URL;
  try {
    url = new URL(`https://${host}/favicon.ico`);
  } catch {
    return null;
  }
  return fetchPublic(url, {
    accept: "image/*",
    maxBytes: MAX_BYTES,
    types: /^image\/(x-icon|vnd\.microsoft\.icon|png|gif|jpeg|webp)$/,
    protocols: ["https:"],
  });
}
