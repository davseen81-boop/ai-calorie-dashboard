import { NextRequest } from "next/server";

import { fail, handleRouteError, ok } from "@/lib/api/response";
import { requireUserId } from "@/lib/auth/session";
import { createExercise, listExercise } from "@/lib/db/exercise";
import { getOrCreateProfile } from "@/lib/db/queries";
import {
  createExerciseSchema,
  listExerciseQuerySchema,
} from "@/lib/validation/exercise";
import { estimateCaloriesBurned, findActivity } from "@/lib/nutrition/exercise";

export const dynamic = "force-dynamic";

/** GET /api/exercise */
export async function GET(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const query = listExerciseQuerySchema.parse(
      Object.fromEntries(request.nextUrl.searchParams),
    );

    return ok({ entries: await listExercise(query, userId) });
  } catch (error) {
    return handleRouteError(error);
  }
}

/**
 * POST /api/exercise
 *
 * The burn is estimated server-side from the MET table and the profile's
 * weight rather than trusted from the client — except when the client supplies
 * a figure explicitly, which means the user overrode it from a watch or
 * machine readout.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body: unknown = await request.json();
    const input = createExerciseSchema.parse(body);

    const activity = input.activityKey ? findActivity(input.activityKey) : undefined;
    if (input.activityKey && !activity) {
      return fail("bad_request", "That activity isn't recognised.", 400);
    }

    const profile = await getOrCreateProfile(userId);

    const manual = input.caloriesBurned !== undefined;
    const caloriesBurned = manual
      ? input.caloriesBurned!
      : estimateCaloriesBurned({
          met: activity?.met ?? 4,
          minutes: input.durationMinutes,
          weightKg: profile.weightKg,
        });

    const entry = await createExercise(
      {
        name: input.name?.trim() || activity?.label || "Exercise",
        activityKey: activity?.key ?? null,
        durationMinutes: input.durationMinutes,
        caloriesBurned,
        source: manual ? "manual" : "estimated",
        notes: input.notes ?? null,
        performedAt: input.performedAt ?? new Date(),
      },
      userId,
    );

    return ok(
      {
        ...entry,
        // Tells the UI whether the figure leaned on a default body weight.
        usedAssumedWeight: !manual && !profile.weightKg,
      },
      { status: 201 },
    );
  } catch (error) {
    return handleRouteError(error);
  }
}
