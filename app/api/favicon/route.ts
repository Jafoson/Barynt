import { fetchFavicon } from "@/lib/favicon";
import { getSession } from "@/lib/session";

// The icon of a site a link field points to, fetched by the server (see
// `lib/favicon.ts`). Only signed-in people may ask; a site without an icon
// answers 404 and the page shows its own link symbol instead.
export async function GET(request: Request) {
  if (!(await getSession())) return new Response(null, { status: 401 });
  const host = new URL(request.url).searchParams.get("host") ?? "";
  const icon = await fetchFavicon(host.trim().toLowerCase());
  if (!icon) {
    return new Response(null, {
      status: 404,
      headers: { "cache-control": "private, max-age=3600" },
    });
  }
  return new Response(icon.body as BodyInit, {
    headers: {
      "content-type": icon.contentType,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
    },
  });
}
