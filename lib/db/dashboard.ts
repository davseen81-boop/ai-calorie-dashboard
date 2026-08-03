import "server-only";

import { and, eq, gte, lt, sql } from "drizzle-orm";

import { db } from "./index";
import { meals } from "./schema";
import { dayRangeInZone, recentDayRanges } from "@/lib/date";
import { getOrCreateProfile } from "./queries";
import { listMeals } from "./queries";
import { listExercise, sumExerciseCalories } from "./exercise";
import { buildAdvice, type TargetAdvice } from "@/lib/nutrition/exercise";
import type { ExerciseEntryRow, MealWithItems } from "./schema";

/** Aggregates backing /api/dashboard/today and /api/dashboard/weekly. */

export interface MacroTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface DailyGoals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface TodaySummary {
  date: string;
  timezone: string;
  consumed: MacroTotals;
  goals: DailyGoals;
  /** Negative once the goal is exceeded — the UI colour-codes on the sign. */
  remainingCalories: number;
  /** 0..1+, uncapped so the ring can show an overshoot. */
  goalProgress: number;
  meals: MealWithItems[];
  exercise: {
    entries: ExerciseEntryRow[];
    /** Net calories burned today. */
    caloriesBurned: number;
    /** Whether those calories were added to the target. */
    adjustsTarget: boolean;
    /** The profile's goal before exercise. */
    baseGoal: number;
  };
  advice: TargetAdvice;
}

/** Sum the `total_*` columns over a half-open instant range. */
async function sumRange(
  start: Date,
  end: Date,
  userId: string,
): Promise<MacroTotals> {
  const [row] = await db
    .select({
      calories: sql<number>`coalesce(sum(${meals.totalCalories}), 0)`,
      proteinG: sql<number>`coalesce(sum(${meals.totalProteinG}), 0)`,
      carbsG: sql<number>`coalesce(sum(${meals.totalCarbsG}), 0)`,
      fatG: sql<number>`coalesce(sum(${meals.totalFatG}), 0)`,
    })
    .from(meals)
    .where(
      and(
        eq(meals.userId, userId),
        gte(meals.loggedAt, start),
        lt(meals.loggedAt, end),
      ),
    );

  return {
    calories: round(row?.calories ?? 0),
    proteinG: round(row?.proteinG ?? 0),
    carbsG: round(row?.carbsG ?? 0),
    fatG: round(row?.fatG ?? 0),
  };
}

/** One decimal place — see the note in `recalcMealTotals`. */
function round(value: number): number {
  return Math.round(value * 10) / 10;
}

export async function getTodaySummary(
  userId: string,
  now: Date = new Date(),
): Promise<TodaySummary> {
  const profile = await getOrCreateProfile(userId);
  const { start, end } = dayRangeInZone(profile.timezone, now);

  // The meal list is fetched rather than derived from the sum because the
  // timeline needs the individual items anyway.
  const todaysMeals = await listMeals({ from: start, to: end }, userId);

  const summed = todaysMeals.reduce<MacroTotals>(
    (acc, meal) => ({
      calories: acc.calories + meal.totalCalories,
      proteinG: acc.proteinG + meal.totalProteinG,
      carbsG: acc.carbsG + meal.totalCarbsG,
      fatG: acc.fatG + meal.totalFatG,
    }),
    { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
  );

  const consumed: MacroTotals = {
    calories: round(summed.calories),
    proteinG: round(summed.proteinG),
    carbsG: round(summed.carbsG),
    fatG: round(summed.fatG),
  };

  const [exerciseEntries, burned] = await Promise.all([
    listExercise({ from: start, to: end }, userId),
    sumExerciseCalories(start, end, userId),
  ]);

  const adjustsTarget = profile.adjustTargetForExercise;
  const baseGoal = profile.dailyCalorieGoal;

  // Exercise raises the calorie target only. Macro goals are left alone: a
  // 300 kcal run doesn't change how much protein the day needs, and scaling
  // them would silently move three targets the user never set.
  const goals: DailyGoals = {
    calories: baseGoal + (adjustsTarget ? burned : 0),
    proteinG: profile.proteinGoalG,
    carbsG: profile.carbsGoalG,
    fatG: profile.fatGoalG,
  };

  return {
    date: start.toISOString(),
    timezone: profile.timezone,
    consumed,
    goals,
    remainingCalories: goals.calories - consumed.calories,
    // Guard against a zero goal, which the schema forbids but a hand-edited
    // database could still contain.
    goalProgress: goals.calories > 0 ? consumed.calories / goals.calories : 0,
    meals: todaysMeals,
    exercise: {
      entries: exerciseEntries,
      caloriesBurned: burned,
      adjustsTarget,
      baseGoal,
    },
    advice: buildAdvice({
      consumed: consumed.calories,
      baseGoal,
      exerciseBurned: adjustsTarget ? burned : 0,
      adjustedGoal: goals.calories,
      hoursLeftInDay: Math.max(
        0,
        (end.getTime() - now.getTime()) / (60 * 60 * 1000),
      ),
    }),
  };
}

export interface WeeklyDay {
  /** Local calendar date, `yyyy-MM-dd`. */
  date: string;
  totals: MacroTotals;
  mealCount: number;
  metGoal: boolean;
}

export interface WeeklySummary {
  timezone: string;
  goals: DailyGoals;
  days: WeeklyDay[];
  /** Averaged over days with at least one meal, not all N days — otherwise a
   *  day the user forgot to log drags the average toward zero. */
  averageCalories: number;
  daysLogged: number;
}

export async function getWeeklySummary(
  days = 7,
  userId: string,
  now: Date = new Date(),
): Promise<WeeklySummary> {
  const profile = await getOrCreateProfile(userId);
  const ranges = recentDayRanges(profile.timezone, days, now);

  const goals: DailyGoals = {
    calories: profile.dailyCalorieGoal,
    proteinG: profile.proteinGoalG,
    carbsG: profile.carbsGoalG,
    fatG: profile.fatGoalG,
  };

  // One aggregate query per day. At 7 days against SQLite this is cheaper than
  // it looks, and it keeps DST-shifted day boundaries exact — a single GROUP BY
  // would have to bucket in SQL, which cannot apply the user's zone.
  const days_ = await Promise.all(
    ranges.map(async (range) => {
      const totals = await sumRange(range.start, range.end, userId);

      const [countRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(meals)
        .where(
          and(
            eq(meals.userId, userId),
            gte(meals.loggedAt, range.start),
            lt(meals.loggedAt, range.end),
          ),
        );

      return {
        date: range.date,
        totals,
        mealCount: countRow?.count ?? 0,
        metGoal: totals.calories > 0 && totals.calories <= goals.calories,
      } satisfies WeeklyDay;
    }),
  );

  const logged = days_.filter((d) => d.mealCount > 0);
  const averageCalories =
    logged.length > 0
      ? logged.reduce((sum, d) => sum + d.totals.calories, 0) / logged.length
      : 0;

  return {
    timezone: profile.timezone,
    goals,
    days: days_,
    averageCalories,
    daysLogged: logged.length,
  };
}
