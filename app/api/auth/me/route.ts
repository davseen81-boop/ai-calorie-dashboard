import { handleRouteError, ok } from "@/lib/api/response";
import { getSession } from "@/lib/auth/session";
import { getUserById } from "@/lib/db/users";

export const dynamic = "force-dynamic";

/**
 * GET /api/auth/me
 *
 * Returns `{ user: null }` rather than a 401 when signed out — the client uses
 * this to decide what to render, and an error there would be noise.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) return ok({ user: null });

    const user = await getUserById(session.userId);
    if (!user) return ok({ user: null });

    return ok({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
