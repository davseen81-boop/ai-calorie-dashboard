import type { DayType } from "@/lib/db/schema";
import { macroGrams, type MacroSplit } from "./macros";

/**
 * Resolving a day's targets.
 *
 * Three things can move the number, and they are deliberately kept separate so
 * the dashboard can show its working:
 *   1. the normal-day goal,
 *   2. the day type (a plan: lighter or heavier than usual),
 *   3. logged exercise (a record of what actually happened).
 */

/** Defaults when the user hasn't set explicit rest/active targets. */
export const REST_DAY_FACTOR = 0.85;
export const ACTIVE_DAY_FACTOR = 1.15;

export interface DayTargetInput {
  dayType: DayType;
  normalGoal: number;
  restGoal: number | null;
  activeGoal: number | null;
  split: MacroSplit;
  exerciseBurned: number;
  adjustForExercise: boolean;
}

export interface DayTargets {
  dayType: DayType;
  /** The day-type target before exercise. */
  baseCalories: number;
  /** What exercise added (0 when the adjustment is off). */
  exerciseBonus: number;
  /** What to actually aim for. */
  calories: number;
  /** The normal-day figure, for showing the difference. */
  normalCalories: number;
  macros: { proteinG: number; carbsG: number; fatG: number };
}

export function resolveDayCalories(
  dayType: DayType,
  goals: { normalGoal: number; restGoal: number | null; activeGoal: number | null },
): number {
  if (dayType === "rest") {
    return goals.restGoal ?? Math.round((goals.normalGoal * REST_DAY_FACTOR) / 10) * 10;
  }
  if (dayType === "active") {
    return goals.activeGoal ?? Math.round((goals.normalGoal * ACTIVE_DAY_FACTOR) / 10) * 10;
  }
  return goals.normalGoal;
}

export function resolveDayTargets(input: DayTargetInput): DayTargets {
  const baseCalories = resolveDayCalories(input.dayType, {
    normalGoal: input.normalGoal,
    restGoal: input.restGoal,
    activeGoal: input.activeGoal,
  });

  const exerciseBonus = input.adjustForExercise ? input.exerciseBurned : 0;
  const calories = baseCalories + exerciseBonus;

  return {
    dayType: input.dayType,
    baseCalories,
    exerciseBonus,
    calories,
    normalCalories: input.normalGoal,
    // Macros follow the day's actual target, so a heavier day scales all three
    // rather than leaving yesterday's grams attached to a bigger number.
    macros: macroGrams(input.split, calories),
  };
}

/**
 * Average daily calories across a week of planned day types.
 *
 * Calorie cycling only works if the week still averages out to the intended
 * figure — three heavy days and no light ones is just eating more. This lets
 * the settings page say so.
 */
export function weeklyAverage(
  counts: Record<DayType, number>,
  goals: { normalGoal: number; restGoal: number | null; activeGoal: number | null },
): number {
  const total =
    counts.rest * resolveDayCalories("rest", goals) +
    counts.normal * resolveDayCalories("normal", goals) +
    counts.active * resolveDayCalories("active", goals);

  const days = counts.rest + counts.normal + counts.active;
  return days > 0 ? Math.round(total / days) : goals.normalGoal;
}
