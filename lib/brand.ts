/**
 * Brand strings, in one place.
 *
 * These appear in the header, the sign-in screen, the browser title, the web
 * manifest, the iOS home screen and the README. Spread across those files they
 * drift the moment the name changes — which it already has.
 *
 * No React, no `server-only`: the manifest and the root layout need these too.
 */

/** Rendered uppercase by the wordmark; written this way for alt text and titles. */
export const BRAND_NAME = "Energy ARC";

export const BRAND_TAGLINE = "Your smart AI Calorie calculator";

/** Full title, for the browser tab and the install prompt. */
export const BRAND_TITLE = `${BRAND_NAME} — ${BRAND_TAGLINE}`;

/**
 * What sits under the icon on a home screen. Kept to the name alone —
 * launchers truncate at roughly 12 characters, and the tagline would be lost
 * mid-word.
 */
export const BRAND_SHORT_NAME = BRAND_NAME;
