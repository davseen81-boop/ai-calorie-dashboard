import { NextRequest } from "next/server";
import { z } from "zod";

import { handleRouteError, ok } from "@/lib/api/response";
import { requireUserId } from "@/lib/auth/session";
import { getPeriodReport } from "@/lib/db/report";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  period: z.enum(["week", "month"]).default("week"),
  /** How many periods back. Bounded so a crafted URL can't walk years of data. */
  offset: z.coerce.number().int().min(0).max(52).default(0),
});

/**
 * GET /api/reports?period=week|month&offset=0
 *
 * Whether each day in the period met its own target, and whether the period
 * did on average.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const { searchParams } = new URL(request.url);
    const { period, offset } = querySchema.parse({
      period: searchParams.get("period") ?? undefined,
      offset: searchParams.get("offset") ?? undefined,
    });

    return ok(await getPeriodReport(userId, period, offset));
  } catch (error) {
    return handleRouteError(error);
  }
}
