import { handleRouteError, ok } from "@/lib/api/response";
import { isGoogleConfigured } from "@/lib/auth/google";
import { isInviteRequired } from "@/lib/auth/invite";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/config
 *
 * Tells the sign-in pages which options to render, so enabling Google or the
 * invite gate is a server env change with no rebuild and no `NEXT_PUBLIC_`
 * variable to keep in sync.
 *
 * Returns only booleans — never the invite code or any client id.
 */
export async function GET() {
  try {
    return ok({
      googleEnabled: isGoogleConfigured(),
      inviteRequired: isInviteRequired(),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
