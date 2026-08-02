import { NextRequest, NextResponse } from "next/server";

import {
  GoogleAuthError,
  exchangeCodeForIdentity,
  isGoogleConfigured,
} from "@/lib/auth/google";
import { isInviteRequired } from "@/lib/auth/invite";
import { createSessionToken } from "@/lib/auth/token";
import { SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/auth/token";
import { findOrCreateGoogleUser } from "@/lib/db/users";
import {
  OAUTH_INVITE_COOKIE,
  OAUTH_STATE_COOKIE,
} from "@/lib/auth/oauth-cookies";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/google/callback
 *
 * Google redirects here. Everything is verified before a session is issued:
 * the state cookie, the authorization code, and the signature, issuer and
 * audience of the identity token.
 */
export async function GET(request: NextRequest) {
  const origin = request.nextUrl.origin;
  const params = request.nextUrl.searchParams;

  // The user pressed cancel, or Google refused.
  const googleError = params.get("error");
  if (googleError) {
    return fail(origin, "Google sign-in was cancelled.");
  }

  if (!isGoogleConfigured()) {
    return fail(origin, "Google sign-in isn't set up on this server.");
  }

  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (!code || !state || !expectedState || state !== expectedState) {
    // Mismatched state means this callback didn't originate from a flow this
    // browser started — the classic OAuth CSRF.
    return fail(origin, "That sign-in link expired. Please try again.");
  }

  try {
    const identity = await exchangeCodeForIdentity({ code, origin });

    const inviteOk = request.cookies.get(OAUTH_INVITE_COOKIE)?.value === "ok";
    const result = await findOrCreateGoogleUser(identity, {
      allowCreate: !isInviteRequired() || inviteOk,
    });

    if (!result) {
      return fail(
        origin,
        "You need an invite code to create an account. Ask whoever runs this app.",
      );
    }

    const token = await createSessionToken({
      userId: result.user.id,
      email: result.user.email,
    });

    const response = NextResponse.redirect(new URL("/dashboard", origin));

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE,
    });

    // The one-shot flow cookies have served their purpose.
    clearFlowCookies(response);

    return response;
  } catch (error) {
    const message =
      error instanceof GoogleAuthError
        ? error.message
        : "Google sign-in failed. Please try again.";
    if (!(error instanceof GoogleAuthError)) {
      console.error("Google callback failed:", error);
    }
    return fail(origin, message);
  }
}

function fail(origin: string, message: string): NextResponse {
  const url = new URL("/login", origin);
  url.searchParams.set("error", message);
  const response = NextResponse.redirect(url);
  clearFlowCookies(response);
  return response;
}

function clearFlowCookies(response: NextResponse): void {
  for (const name of [OAUTH_STATE_COOKIE, OAUTH_INVITE_COOKIE]) {
    response.cookies.set(name, "", { path: "/", maxAge: 0 });
  }
}
