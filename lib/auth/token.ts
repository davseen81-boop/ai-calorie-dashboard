import { SignJWT, jwtVerify } from "jose";

/**
 * Session token creation and verification.
 *
 * Kept free of `node:crypto`, `next/headers` and `server-only` so the Edge
 * middleware can import it — that is the whole reason this is separate from
 * `session.ts`.
 */

export const SESSION_COOKIE = "calorie_session";

/** Long enough that a personal tracker isn't constantly logging you out. */
const SESSION_DAYS = 30;
export const SESSION_MAX_AGE = SESSION_DAYS * 24 * 60 * 60;

export interface SessionClaims {
  userId: string;
  email: string;
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
    };
  } catch {
    return null;
  }
}
