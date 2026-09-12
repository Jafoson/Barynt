import { NextResponse } from "next/server";
import createMiddleware from "next-intl/middleware";
import { auth } from "@/auth.edge";
import { routing } from "@/i18n/routing";

// Public pages (without locale prefix) reachable without a valid session.
//
// `/invite` belongs here: the token in the path is the authorization, and
// whoever accepts an invitation doesn't have a password yet — an auth gate in
// front of it would be a door with the key lying behind it. `/join`
// (shareable invite link, `lib/invite-links.ts`) for the same reason — that
// page itself decides between "already signed in" and "sign in first".
// `/share` (public issue link, `lib/issue-share.ts`) is inherently meant for
// non-members — an auth gate in front of it would defeat its purpose.
const PUBLIC_PATHS = ["/login", "/register", "/invite", "/join", "/share"];

const handleI18nRouting = createMiddleware(routing);

// `auth` (edge instance) exposes the session as `req.auth` (JWT decoding).
export default auth((request) => {
  const { pathname } = request.nextUrl;

  // Strip the locale prefix so public paths can be checked locale-independently.
  const segments = pathname.split("/").filter(Boolean);
  const hasLocalePrefix = (routing.locales as readonly string[]).includes(
    segments[0],
  );
  const restPath = hasLocalePrefix
    ? `/${segments.slice(1).join("/")}`
    : pathname;

  const isPublic = PUBLIC_PATHS.some(
    (p) => restPath === p || restPath.startsWith(`${p}/`),
  );

  // Auth gate: protected route without a valid session → redirect to login.
  if (!isPublic && !request.auth) {
    const locale = hasLocalePrefix ? segments[0] : routing.defaultLocale;
    const loginUrl = new URL(`/${locale}/login`, request.url);
    // callbackUrl without a locale prefix – the client navigates via
    // next-intl, which adds the active locale automatically. Carries the
    // original query string too (`request.nextUrl.search`) — dropping it
    // silently broke `/oauth/authorize`: an unauthenticated visit there
    // lost client_id/code_challenge/state/resource on the login
    // round-trip, since a bare pathname reaches the callback with nothing
    // left to resume the OAuth flow with.
    loginUrl.searchParams.set("callbackUrl", restPath + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  // next-intl takes over locale routing (e.g. /login → /de/login) and sets
  // the locale headers needed by the downstream Server Components.
  return handleI18nRouting(request);
});

export const config = {
  // Run on all paths except API routes, Next.js internals, and files with an
  // extension (e.g. favicon.ico). Matches the next-intl recommendation.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
