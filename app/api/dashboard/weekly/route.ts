import { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, ok } from "@/lib/api/response";
import { getWeeklySummary } from "@/lib/db/dashboard";
import { requireUserId } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  // Defaults to 7 for the dashboard chart; capped at 90 so a hand-crafted URL
  // cannot trigger 365 aggregate queries.
  days: z.coerce.number().int().min(1).max(90).default(7),
});

/**
 * GET /api/dashboard/weekly?days=7
 *
 * Per-day calorie and macro totals, oldest first — the bar chart's data source.
 */
export async function GET(request: NextRequest) {
  try {
    const { days } = querySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );
    const userId = await requireUserId();
    return ok(await getWeeklySummary(days, userId));
  } catch (error) {
    return handleRouteError(error);
  }
}
