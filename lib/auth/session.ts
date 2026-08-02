import "server-only";

import { cookies } from "next/headers";

import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  verifySessionToken,
  type SessionClaims,
} from "./token";

/** Cookie handling for route handlers and server components. */

export async function setSessionCookie(claims: SessionClaims): Promise<void> {
  const token = await createSessionToken(claims);

  cookies().set(SESSION_COOKIE, token, {
    httpOnly: true, // unreadable from JavaScript, so XSS can't lift it
    sameSite: "lax", // survives normal navigation, blocks cross-site POSTs
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

export function clearSessionCookie(): void {
  cookies().set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

/** The signed-in user's claims, or null. */
export async function getSession(): Promise<SessionClaims | null> {
  return verifySessionToken(cookies().get(SESSION_COOKIE)?.value);
}

/**
 * The signed-in user's id, or throws.
 *
 * Every data route calls this instead of defaulting to a constant, so a route
 * that forgets to scope its query fails loudly rather than quietly serving
 * another account's data.
 */
export async function requireUserId(): Promise<string> {
  const session = await getSession();
  if (!session) throw new UnauthorizedError();
  return session.userId;
}

export class UnauthorizedError extends Error {
  constructor() {
    super("You need to be signed in.");
    this.name = "UnauthorizedError";
  }
}

export { SESSION_COOKIE };
