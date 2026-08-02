import { handleRouteError, ok } from "@/lib/api/response";
import { getTodaySummary } from "@/lib/db/dashboard";
import { requireUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/today
 *
 * Consumed vs goal, macro breakdown, and today's meal timeline. "Today" is
 * resolved in the profile's timezone, not the server's.
 */
export async function GET() {
  try {
    const userId = await requireUserId();
    return ok(await getTodaySummary(userId));
  } catch (error) {
    return handleRouteError(error);
  }
}
