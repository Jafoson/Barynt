"use server";

import { redirect } from "next/navigation";
import {
  createAuthorizationCode,
  validateAuthorizeRequest,
} from "@/lib/oauth/authorize";
import { getSession } from "@/lib/session";

function readAuthorizeFields(formData: FormData) {
  return {
    clientId: String(formData.get("client_id") ?? ""),
    redirectUri: String(formData.get("redirect_uri") ?? ""),
    codeChallenge: String(formData.get("code_challenge") ?? ""),
    codeChallengeMethod: String(formData.get("code_challenge_method") ?? ""),
    resource: formData.get("resource")?.toString() || undefined,
    scope: formData.get("scope")?.toString() || undefined,
    state: formData.get("state")?.toString() || undefined,
  };
}

function withState(url: URL, state?: string): string {
  if (state) url.searchParams.set("state", state);
  return url.toString();
}

/** Rebuilds the original `/oauth/authorize?...` query from the hidden form
 *  fields — used to bounce back to the page's own validation (and its
 *  `invalidTitle` card) rather than inventing a second error route. */
function authorizeUrlFrom(req: ReturnType<typeof readAuthorizeFields>): string {
  const params = new URLSearchParams({
    client_id: req.clientId,
    redirect_uri: req.redirectUri,
    code_challenge: req.codeChallenge,
    code_challenge_method: req.codeChallengeMethod,
    response_type: "code",
  });
  if (req.resource) params.set("resource", req.resource);
  if (req.scope) params.set("scope", req.scope);
  if (req.state) params.set("state", req.state);
  return `/oauth/authorize?${params.toString()}`;
}

/**
 * The user clicked "Allow" on the consent screen
 * (`features/oauth/components/ConsentScreen`). Re-validates everything
 * server-side instead of trusting the hidden form fields — those are
 * exactly the OAuth request parameters, and a form is an untrusted client
 * input like any other, no different from the query string the page
 * itself was rendered from.
 */
export async function approveOAuthConsent(formData: FormData): Promise<never> {
  const req = readAuthorizeFields(formData);
  const session = await getSession();
  if (!session) redirect("/login");

  const validation = await validateAuthorizeRequest(req);
  if (!validation.ok) {
    // Nothing safe to redirect to — the redirect_uri itself may be the
    // part that failed validation. Bounce back to the page's own
    // validation instead of inventing a second error path.
    redirect(authorizeUrlFrom(req));
  }

  const code = await createAuthorizationCode(req, session.userId);
  const redirectUrl = new URL(req.redirectUri);
  redirectUrl.searchParams.set("code", code);
  redirect(withState(redirectUrl, req.state));
}

/** The user clicked "Deny" — sent back to the client with the OAuth
 *  standard error code instead of ever minting a code. */
export async function denyOAuthConsent(formData: FormData): Promise<never> {
  const req = readAuthorizeFields(formData);

  let redirectUrl: URL;
  try {
    redirectUrl = new URL(req.redirectUri);
  } catch {
    redirect(authorizeUrlFrom(req));
  }
  redirectUrl.searchParams.set("error", "access_denied");
  redirect(withState(redirectUrl, req.state));
}
