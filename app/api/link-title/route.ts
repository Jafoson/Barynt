import { fetchLinkTitle } from "@/lib/link-title";
import { getSession } from "@/lib/session";

// The title of the page a link field points to, read by the server (see
// `lib/link-title.ts`). Only signed-in people may ask. A page without one,
// or one that cannot be reached, answers an empty title and the page shows
// the site's name instead.
export async function GET(request: Request) {
  if (!(await getSession())) return new Response(null, { status: 401 });
  const url = new URL(request.url).searchParams.get("url") ?? "";
  const title = url.length <= 2000 ? await fetchLinkTitle(url) : null;
  return Response.json(
    { title },
    { headers: { "cache-control": "private, max-age=86400" } },
  );
}
