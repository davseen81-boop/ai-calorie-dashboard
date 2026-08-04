import "server-only";

import { addDays, format, getISODay, parseISO } from "date-fns";

import { localDateString } from "@/lib/date";
import { resolveDayTargets } from "@/lib/nutrition/day-targets";
import { summarisePlan, sessionsOnDay } from "@/lib/nutrition/training-plan";
import { getOrCreateProfile } from "./queries";
import { resolveDayType, type DayTypeSource } from "./day-plans";
import { listTrainingSessions } from "./training-plan";
import type { TrainingDayType } from "./schema";

/**
 * What a day ahead looks like before it happens.
 *
 * Everything the dashboard shows for today, resolved for a future date so meals
 * can be planned against the right number: a Saturday with football has a
 * different target from a Sunday off, and planning against today's figure gets
 * both wrong.
 */

export interface DayOutlook {
  /** Local calendar date, `yyyy-MM-dd`. */
  date: string;
  weekday: string;
  daysAhead: number;
  dayType: TrainingDayType;
  source: DayTypeSource;
  calories: number;
  macros: { proteinG: number; carbsG: number; fatG: number };
  sessions: Array<{ name: string; minutes: number; calories: number }>;
  /** What the plan says that day's training costs. */
  plannedBurn: number;
}

export async function getDayOutlook(
  userId: string,
  daysAhead: number,
  now: Date = new Date(),
): Promise<DayOutlook> {
  const profile = await getOrCreateProfile(userId);

  // Stepped in local calendar days rather than by adding 24 hours, so a DST
  // change doesn't land the answer on the wrong date.
  const localToday = parseISO(localDateString(now, profile.timezone));
  const target = addDays(localToday, daysAhead);
  const date = format(target, "yyyy-MM-dd");
  const isoWeekday = getISODay(target);

  const day = await resolveDayType(date, isoWeekday, userId);

  const split = {
    protein: profile.proteinPct,
    carbs: profile.carbsPct,
    fat: profile.fatPct,
  };

  const targets = resolveDayTargets({
    dayType: day.type,
    normalGoal: profile.dailyCalorieGoal,
    restGoal: profile.restDayCalories,
    activeGoal: profile.activeDayCalories,
    split,
    // Deliberately zero. The rest/training split already prices that day's
    // training into the target; adding the planned burn on top would be the
    // same double count the activity multiplier used to make.
    exerciseBurned: 0,
    adjustForExercise: false,
  });

  const scheduled = sessionsOnDay(await listTrainingSessions(userId), isoWeekday);
  const costed = summarisePlan(scheduled, profile.weightKg).sessions;

  return {
    date,
    weekday: format(target, "EEEE"),
    daysAhead,
    dayType: day.type,
    source: day.source,
    calories: targets.calories,
    macros: targets.macros,
    sessions: costed.map((session) => ({
      name: session.name,
      minutes: session.durationMinutes,
      calories: session.caloriesPerSession,
    })),
    plannedBurn: costed.reduce((sum, s) => sum + s.caloriesPerSession, 0),
  };
}
