import "server-only";

import {
  randomBytes,
  scrypt,
  timingSafeEqual,
  type ScryptOptions,
} from "node:crypto";
import { promisify } from "node:util";

// promisify picks the 3-argument overload, which drops the cost parameters.
// Asserting the 4-argument shape keeps them.
const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
) => Promise<Buffer>;

/** Cost parameters. N=16384 is the common baseline for interactive logins. */
const KEY_LENGTH = 64;
const SCRYPT_PARAMS = { N: 16_384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

/**
 * Password hashing with scrypt.
 *
 * scrypt is built into Node, so there's no native dependency to break on
 * Vercel, and it's memory-hard — meaningfully more expensive to attack in
 * bulk than a plain SHA. The salt is random per password and stored alongside
 * the derived key, so two identical passwords never share a hash.
 *
 * Node-only: this runs in route handlers, never in middleware (the Edge
 * runtime has no `node:crypto` scrypt).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scryptAsync(
    password.normalize("NFKC"),
    salt,
    KEY_LENGTH,
    SCRYPT_PARAMS,
  );

  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

/**
 * Verify a password against a stored hash.
 *
 * Compared with `timingSafeEqual` so the time taken doesn't leak how much of
 * the hash matched.
 */
export async function verifyPassword(
  password: string,
  stored: string,
): Promise<boolean> {
  const [saltHex, keyHex] = stored.split(":");
  if (!saltHex || !keyHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(keyHex, "hex");
  if (expected.length !== KEY_LENGTH) return false;

  const derived = await scryptAsync(
    password.normalize("NFKC"),
    salt,
    KEY_LENGTH,
    SCRYPT_PARAMS,
  );

  return timingSafeEqual(derived, expected);
}
