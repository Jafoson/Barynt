import { NextResponse } from "next/server";
import { requestAttachmentUploadForUser } from "@/features/api-v1/mutations";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  insufficientScope,
  mutationJson,
  rateLimited,
  unauthorized,
  withRateLimitHeaders,
} from "@/lib/api/respond";
import { hasScope, resolveApiUser } from "@/lib/api-auth";

/** Step one of a large upload: a presigned URL to PUT the file to. Step two
 *  is `POST /issues/{id}/attachments` with the returned `key`. */
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

  return mutationJson(
    await requestAttachmentUploadForUser(auth.userId, id, body),
    info,
    201,
  );
}
