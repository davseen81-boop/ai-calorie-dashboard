import { SignJWT, jwtVerify } from "jose";

/**
 * Session token creation and verification.
 *
 * Kept free of `node:crypto`, `next/headers` and `server-only` so the Edge
 * middleware can import it — that is the whole reason this is separate from
 * `session.ts`.
 */

export const SESSION_COOKIE = "calorie_session";

/**
 * A year, and renewed on use (see `shouldRefresh`), so an account in regular
 * use is never signed out. A personal food diary you have to log back into is
 * a diary you stop keeping.
 *
 * It is not infinite on purpose: an abandoned session on a borrowed device
 * should eventually lapse.
 */
const SESSION_DAYS = 365;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

/**
 * How stale a token may get before it's reissued.
 *
 * Sliding expiry: each visit after this window pushes the expiry back another
 * year. Renewing on *every* request would rewrite the cookie constantly for no
 * benefit.
 */
const REFRESH_AFTER_SECONDS = 24 * 60 * 60;

export interface SessionClaims {
  userId: string;
  email: string;
  /** Issued-at, seconds since epoch. Absent on tokens minted before this. */
  issuedAt?: number;
}

/** True when the session is worth reissuing to extend its life. */
export function shouldRefresh(claims: SessionClaims): boolean {
  if (!claims.issuedAt) return true;
  return Date.now() / 1000 - claims.issuedAt > REFRESH_AFTER_SECONDS;
}

function getSecret(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error(
      "AUTH_SECRET is missing or too short (needs at least 32 characters). " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64url'))\"",
    );
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(getSecret());
}

/**
 * Returns the claims, or null for anything wrong — expired, tampered, signed
 * with a different secret, or malformed. Callers treat null as "signed out"
 * rather than distinguishing the cases, which would leak information.
 */
export async function verifySessionToken(
  token: string | undefined,
): Promise<SessionClaims | null> {
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, getSecret(), {
      algorithms: ["HS256"],
    });
    if (typeof payload.sub !== "string") return null;

    return {
      userId: payload.sub,
      email: typeof payload.email === "string" ? payload.email : "",
      issuedAt: typeof payload.iat === "number" ? payload.iat : undefined,
    };
  } catch {
    return null;
  }
}
