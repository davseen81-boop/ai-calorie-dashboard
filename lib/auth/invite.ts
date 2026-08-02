import "server-only";

import { timingSafeEqual } from "node:crypto";

/**
 * Optional invite gate on sign-up.
 *
 * When `SIGNUP_INVITE_CODE` is unset, sign-up stays open — so adding this
 * feature doesn't lock anyone out of an existing deployment by surprise. Set
 * the variable and only people with the code can create an account.
 *
 * Existing users signing in are never asked for it; this gates creation only.
 */
export function isInviteRequired(): boolean {
  return Boolean(process.env.SIGNUP_INVITE_CODE?.trim());
}

export function checkInviteCode(supplied: string | undefined): boolean {
  const expected = process.env.SIGNUP_INVITE_CODE?.trim();
  if (!expected) return true; // gate disabled

  const given = supplied?.trim() ?? "";
  if (given.length === 0) return false;

  // Compared without early-exit so response time doesn't reveal how many
  // characters were right. Lengths are compared first because
  // timingSafeEqual throws on a mismatch.
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;

  return timingSafeEqual(a, b);
}

export class InvalidInviteError extends Error {
  constructor() {
    super("That invite code isn't right.");
    this.name = "InvalidInviteError";
  }
}
