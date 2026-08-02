import "server-only";

import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Google Sign-In via the OAuth 2.0 authorization-code flow.
 *
 * Implemented directly rather than through an auth framework: the flow is
 * three requests, and a framework would bring its own database adapter,
 * session model and config surface that would have to be reconciled with the
 * ones this app already has.
 */

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** Cached across requests — refetching Google's keys per login would be rude. */
const jwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/oauth2/v3/certs"),
);

export function isGoogleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() &&
      process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );
}

export class GoogleAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

function credentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new GoogleAuthError("Google sign-in isn't configured on this server.");
  }
  return { clientId, clientSecret };
}

/**
 * The redirect URI, derived from the request's own origin.
 *
 * Must match one registered in Google Cloud exactly. Deriving it means
 * localhost and production work from the same code — register both.
 */
export function redirectUri(origin: string): string {
  return `${origin}/api/auth/google/callback`;
}

export function buildAuthUrl(options: {
  origin: string;
  state: string;
}): string {
  const { clientId } = credentials();

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri(options.origin),
    response_type: "code",
    // Only identity — no Drive, Gmail or anything else.
    scope: "openid email profile",
    state: options.state,
    // Google won't return a refresh token and we don't need one: the session
    // is ours, and Google is only asked to prove identity once.
    prompt: "select_account",
  });

  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export interface GoogleIdentity {
  googleId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
  picture: string | null;
}

/**
 * Exchange the authorization code and verify the returned identity token.
 *
 * The id_token is verified against Google's published keys and checked for
 * issuer and audience — without that, a token minted for a different
 * application would be accepted here.
 */
export async function exchangeCodeForIdentity(options: {
  code: string;
  origin: string;
}): Promise<GoogleIdentity> {
  const { clientId, clientSecret } = credentials();

  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: options.code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri(options.origin),
      grant_type: "authorization_code",
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new GoogleAuthError(
      `Google rejected the sign-in (${response.status}). ${detail.slice(0, 200)}`,
    );
  }

  const tokens = (await response.json()) as { id_token?: string };
  if (!tokens.id_token) {
    throw new GoogleAuthError("Google didn't return an identity token.");
  }

  let payload;
  try {
    ({ payload } = await jwtVerify(tokens.id_token, jwks, {
      issuer: ISSUERS,
      audience: clientId,
    }));
  } catch {
    throw new GoogleAuthError("Google's identity token failed verification.");
  }

  const email = typeof payload.email === "string" ? payload.email : null;
  if (!payload.sub || !email) {
    throw new GoogleAuthError("Google didn't share an email address.");
  }

  // An unverified address could be one the person doesn't actually control,
  // which would let them claim someone else's account by email match.
  if (payload.email_verified !== true) {
    throw new GoogleAuthError(
      "That Google account's email isn't verified, so it can't be used to sign in.",
    );
  }

  return {
    googleId: payload.sub,
    email: email.toLowerCase(),
    emailVerified: true,
    name: typeof payload.name === "string" ? payload.name : null,
    picture: typeof payload.picture === "string" ? payload.picture : null,
  };
}
