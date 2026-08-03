import { NextResponse, type NextRequest } from "next/server";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  shouldRefresh,
  verifySessionToken,
  type SessionClaims,
} from "@/lib/auth/token";

/**
 * Route protection.
 *
 * Runs on the Edge runtime, so it only verifies the session JWT — no database
 * and no `node:crypto`. Route handlers still call `requireUserId()`
 * themselves; this is the outer gate, not the only one, so a mistake in the
 * matcher can't silently expose an endpoint.
 */

const PUBLIC_PAGES = ["/login", "/signup"];
const PUBLIC_APIS = [
  "/api/auth/login",
  "/api/auth/signup",
  "/api/auth/logout",
  "/api/auth/config",
  // The whole Google flow, including the callback Google redirects back to.
  "/api/auth/google",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const session = await verifySessionToken(
    request.cookies.get(SESSION_COOKIE)?.value,
  );

  const isPublicPage = PUBLIC_PAGES.some((p) => pathname.startsWith(p));
  const isPublicApi = PUBLIC_APIS.some((p) => pathname.startsWith(p));

  if (isPublicApi) return NextResponse.next();

  if (!session) {
    if (isPublicPage) return NextResponse.next();

    // APIs get a JSON 401; the client turns that into a redirect. Sending a
    // 307 to an HTML page would make fetch() parse markup as JSON.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: { code: "unauthorized", message: "You need to be signed in." } },
        { status: 401 },
      );
    }

    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Preserve where they were headed so login can return them there.
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // Signed in but on an auth page — nothing to do here.
  if (isPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return withRenewedSession(NextResponse.redirect(url), session);
  }

  return withRenewedSession(NextResponse.next(), session);
}

/**
 * Sliding expiry: push the session's life back on use.
 *
 * Without this a session would lapse a fixed year after sign-in no matter how
 * often it was used. Renewing here means anyone using the app regularly is
 * never signed out — which is the point of a daily food diary.
 */
async function withRenewedSession(
  response: NextResponse,
  session: SessionClaims,
): Promise<NextResponse> {
  if (!shouldRefresh(session)) return response;

  try {
    const token = await createSessionToken({
      userId: session.userId,
      email: session.email,
    });

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });
  } catch {
    // A failed renewal must never block the request — the existing cookie is
    // still valid, and the next request will try again.
  }

  return response;
}

export const config = {
  /**
   * Everything except Next internals and public assets.
   *
   * The web app manifest must be excluded explicitly: browsers fetch it before
   * any session exists (and sometimes without credentials), so gating it makes
   * the install prompt never appear.
   */
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|fonts/|icons/|manifest.webmanifest|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|webp|ico|webmanifest)$).*)",
  ],
};
