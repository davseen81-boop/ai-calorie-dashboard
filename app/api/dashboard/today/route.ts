import { handleRouteError, ok } from "@/lib/api/response";
import { getTodaySummary } from "@/lib/db/dashboard";

export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard/today
 *
 * Consumed vs goal, macro breakdown, and today's meal timeline. "Today" is
 * resolved in the profile's timezone, not the server's.
 */
export async function GET() {
  try {
    return ok(await getTodaySummary());
  } catch (error) {
    return handleRouteError(error);
  }
}
