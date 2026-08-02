/**
 * Cookie names for the in-flight Google OAuth exchange.
 *
 * In their own module because a Next.js `route.ts` may only export route
 * handlers and a few known config values — exporting constants from one is a
 * build error.
 */

/** Random per-attempt value; the callback rejects a mismatch (CSRF guard). */
export const OAUTH_STATE_COOKIE = "google_oauth_state";

/** Whether the attempt presented a valid invite code, if one is required. */
export const OAUTH_INVITE_COOKIE = "google_oauth_invite";
