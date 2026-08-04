import { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, ok } from "@/lib/api/response";
import { requireUserId } from "@/lib/auth/session";
import { setDayType } from "@/lib/db/day-plans";
import { TRAINING_DAY_TYPES } from "@/lib/db/schema";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Local calendar date, `yyyy-MM-dd`, as the dashboard computed it. */
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a yyyy-MM-dd date."),
  dayType: z.enum(TRAINING_DAY_TYPES),
});

/**
 * PATCH /api/day-plan
 *
 * Marks a day as rest, normal or active. The date comes from the client
 * because it is the local calendar date the dashboard is showing — deriving
 * it server-side from "now" would disagree either side of midnight.
 */
export async function PATCH(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body: unknown = await request.json();
    const { date, dayType } = bodySchema.parse(body);

    return ok({ date, dayType: await setDayType(date, dayType, userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}
