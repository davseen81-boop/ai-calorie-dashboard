import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { buildAuthUrl, isGoogleConfigured } from "@/lib/auth/google";
import { checkInviteCode, isInviteRequired } from "@/lib/auth/invite";
import {
  OAUTH_INVITE_COOKIE,
  OAUTH_STATE_COOKIE,
} from "@/lib/auth/oauth-cookies";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google — start the sign-in flow.
 *
 * `?invite=` is validated here rather than at the callback so a wrong code
 * fails immediately, before bouncing the user through Google. The result is
 * remembered in a short-lived cookie because the callback has no other way to
 * know whether this attempt was allowed to create an account.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;

  if (!isGoogleConfigured()) {
    return redirectWithError(origin, "Google sign-in isn't set up on this server.");
  }

  const invite = request.nextUrl.searchParams.get("invite") ?? undefined;
  const inviteOk = !isInviteRequired() || checkInviteCode(invite);

  const state = randomBytes(16).toString("hex");
  const response = NextResponse.redirect(buildAuthUrl({ origin, state }));

  const cookieBase = {
    httpOnly: true,
    sameSite: "lax" as const, // must survive Google's cross-site redirect back
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 10 * 60, // the flow is seconds; ten minutes is generous
  };

  // Guards against a forged callback: the state returned by Google must match
  // the one this browser was issued.
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookieBase);
  response.cookies.set(OAUTH_INVITE_COOKIE, inviteOk ? "ok" : "no", cookieBase);

  return response;
}

function redirectWithError(origin: string, message: string): NextResponse {
  const url = new URL("/login", origin);
  url.searchParams.set("error", message);
  return NextResponse.redirect(url);
}
