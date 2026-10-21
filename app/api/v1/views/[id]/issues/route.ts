import { NextResponse } from "next/server";
import { listViewIssuesForUser } from "@/features/api-v1/views";
import { encodeCursor, parseCursor, parseLimit } from "@/lib/api/cursor";
import { pickFields } from "@/lib/api/fields";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  insufficientScope,
  notFoundJson,
  rateLimited,
  unauthorized,
  withRateLimitHeaders,
} from "@/lib/api/respond";
import { hasScope, resolveApiUser } from "@/lib/api-auth";

/** The issues a view shows, for the caller — their `@me`, their projects
 *  (BARY-172). Needs `issues:read` too: a view never opens issues a key
 *  couldn't read otherwise. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "views:read") || !hasScope(auth, "issues:read"))
    return insufficientScope();

  const { id } = await params;
  const url = new URL(req.url);
  const fields = url.searchParams.get("fields");
  const page = await listViewIssuesForUser(auth.userId, id, {
    cursor: parseCursor(url.searchParams),
    take: parseLimit(url.searchParams),
  });
  if (!page) return withRateLimitHeaders(notFoundJson(), info);

  const last = page.rows.at(-1);
  return withRateLimitHeaders(
    NextResponse.json({
      data: page.rows.map((row) => pickFields(row, fields)),
      nextCursor: page.hasMore && last ? encodeCursor(last.id) : null,
    }),
    info,
  );
}
