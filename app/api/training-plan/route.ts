import { NextRequest } from "next/server";

import { handleRouteError, ok } from "@/lib/api/response";
import { requireUserId } from "@/lib/auth/session";
import { getOrCreateProfile } from "@/lib/db/queries";
import {
  createTrainingSession,
  listTrainingSessions,
} from "@/lib/db/training-plan";
import { summarisePlan, suggestTargets } from "@/lib/nutrition/training-plan";
import { createTrainingSessionSchema } from "@/lib/validation/training-plan";

export const dynamic = "force-dynamic";

/**
 * The weekly training plan, and what it implies for the daily targets.
 *
 * The summary is computed server-side rather than in the browser so the figures
 * behind a suggested target come from the same code that resolves the day type
 * — two implementations would eventually disagree about what a session costs.
 */
async function buildResponse(userId: string) {
  const [sessions, profile] = await Promise.all([
    listTrainingSessions(userId),
    getOrCreateProfile(userId),
  ]);

  const plan = summarisePlan(sessions, profile.weightKg);

  return {
    sessions: plan.sessions,
    trainingDays: plan.trainingDays,
    restDayCount: plan.restDayCount,
    weeklyCalories: plan.weeklyCalories,
    averageDailyCalories: plan.averageDailyCalories,
    typicalTrainingBurn: plan.typicalTrainingBurn,
    caloriesByWeekday: plan.caloriesByWeekday,
    suggested: suggestTargets(profile.dailyCalorieGoal, plan),
    dailyGoal: profile.dailyCalorieGoal,
    /** Without a weight the MET maths falls back to an assumed 70kg. */
    usingAssumedWeight: !profile.weightKg,
  };
}

export async function GET() {
  try {
    const userId = await requireUserId();
    return ok(await buildResponse(userId));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const userId = await requireUserId();
    const body: unknown = await request.json();
    const input = createTrainingSessionSchema.parse(body);

    await createTrainingSession(
      {
        name: input.name,
        activityKey: input.activityKey ?? null,
        durationMinutes: input.durationMinutes,
        daysOfWeek: input.daysOfWeek,
      },
      userId,
    );

    // The whole summary comes back, not just the new row: every figure on the
    // card depends on the full plan.
    return ok(await buildResponse(userId), { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
