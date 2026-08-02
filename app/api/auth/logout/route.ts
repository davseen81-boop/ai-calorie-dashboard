import { handleRouteError, ok } from "@/lib/api/response";
import { clearSessionCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/** POST /api/auth/logout — always succeeds, signed in or not. */
export async function POST() {
  try {
    clearSessionCookie();
    return ok({ signedOut: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
