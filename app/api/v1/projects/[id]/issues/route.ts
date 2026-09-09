import { NextResponse } from "next/server";
import { createIssueForUser } from "@/features/api-v1/mutations";
import { listIssuesForUser } from "@/features/api-v1/queries";
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

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "issues:read")) return insufficientScope();

  const { id } = await params;
  const url = new URL(req.url);
  const take = parseLimit(url.searchParams);
  const fields = url.searchParams.get("fields");

  const page = await listIssuesForUser(auth.userId, id, {
    status: url.searchParams.get("status") ?? undefined,
    assignee: url.searchParams.get("assignee") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    cursor: parseCursor(url.searchParams),
    take,
  });
  if (!page) return notFoundJson();

  const last = page.rows.at(-1);
  return withRateLimitHeaders(
    NextResponse.json({
      data: page.rows.map((row) => pickFields(row, fields)),
      nextCursor: page.hasMore && last ? encodeCursor(last.id) : null,
    }),
    info,
  );
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await resolveApiUser(req);
  if (!auth) return unauthorized();

  const { ok, info } = await checkRateLimit(auth.keyId);
  if (!ok) return rateLimited(info);

  if (!hasScope(auth, "issues:write")) return insufficientScope();

  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return withRateLimitHeaders(
      NextResponse.json({ error: { code: "invalid_body" } }, { status: 422 }),
      info,
    );
  }

  const result = await createIssueForUser(auth.userId, id, body);
  if (!result.ok) {
    const res =
      result.status === 404
        ? notFoundJson()
        : NextResponse.json(
            { error: { code: "invalid_body" } },
            { status: 422 },
          );
    return withRateLimitHeaders(res, info);
  }

  return withRateLimitHeaders(
    NextResponse.json({ data: result.data }, { status: 201 }),
    info,
  );
}
