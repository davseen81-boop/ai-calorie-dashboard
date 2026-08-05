import { NextRequest } from "next/server";
import { z } from "zod";
import { fromZonedTime } from "date-fns-tz";

import { handleRouteError, ok } from "@/lib/api/response";
import { getTodaySummary } from "@/lib/db/dashboard";
import { getOrCreateProfile } from "@/lib/db/queries";
import { requireUserId } from "@/lib/auth/session";
import { localDateString } from "@/lib/date";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  /** Local calendar date to show. Omitted means today. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a yyyy-MM-dd date.")
    .optional(),
});

/**
 * GET /api/dashboard/today?date=yyyy-MM-dd
 *
 * Consumed vs goal, macro breakdown, and that day's meal timeline. The day is
 * resolved in the profile's timezone, not the server's.
 *
 * The whole aggregate is anchored to a single instant, so showing an earlier day
 * is a matter of choosing the right one rather than threading a date through
 * every query. For a finished day that instant is its last moment — passing
 * local noon instead would leave the advice claiming twelve hours remain in a
 * day that ended yesterday.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(request.url);
    const { date } = querySchema.parse({
      date: searchParams.get("date") ?? undefined,
    });

    if (!date) return ok(await getTodaySummary(userId));

    const profile = await getOrCreateProfile(userId);
    const today = localDateString(new Date(), profile.timezone);

    // Today is always the live figure, and a future date has nothing to show —
    // both fall back rather than inventing a day that has not happened.
    if (date >= today) return ok(await getTodaySummary(userId));

    const endOfThatDay = fromZonedTime(`${date}T23:59:59.999`, profile.timezone);
    return ok(await getTodaySummary(userId, endOfThatDay));
  } catch (error) {
    return handleRouteError(error);
  }
}
