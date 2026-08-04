import "server-only";

import { and, eq, gte, lt } from "drizzle-orm";
import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  getISODay,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { fromZonedTime } from "date-fns-tz";

import { db } from "./index";
import { exerciseEntries, meals, dayPlans, type DayType } from "./schema";
import { localDateString } from "@/lib/date";
import { resolveDayCalories } from "@/lib/nutrition/day-targets";
import { macroGrams } from "@/lib/nutrition/macros";
import {
  classifyDay,
  summarisePeriod,
  type DayStatus,
  type PeriodTotals,
} from "@/lib/nutrition/report";
import { getOrCreateProfile } from "./queries";
import { listTrainingSessions } from "./training-plan";

/**
 * Weekly and monthly reports.
 *
 * Each day is judged against its own target, which means resolving the day type
 * for every date in the range — explicit choice, then the weekly training plan,
 * then normal. All of it comes from four queries regardless of period length:
 * bucketing instants into local days in memory beats one query per day, which
 * is what a month would otherwise cost.
 */

export type ReportPeriod = "week" | "month";

export interface ReportDay {
  /** Local calendar date, `yyyy-MM-dd`. */
  date: string;
  dayType: DayType;
  target: number;
  consumed: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
  exerciseCalories: number;
  status: DayStatus;
}

export interface PeriodReport {
  period: ReportPeriod;
  /** How many periods back — 0 is the current one. */
  offset: number;
  label: string;
  from: string;
  to: string;
  /** True while the period is still running, so partial results read as partial. */
  inProgress: boolean;
  days: ReportDay[];
  totals: PeriodTotals;
  macros: {
    protein: { average: number; target: number };
    carbs: { average: number; target: number };
    fat: { average: number; target: number };
  };
}

export async function getPeriodReport(
  userId: string,
  period: ReportPeriod,
  offset: number,
  now: Date = new Date(),
): Promise<PeriodReport> {
  const profile = await getOrCreateProfile(userId);
  const zone = profile.timezone;

  const todayLocal = parseISO(localDateString(now, zone));
  const anchor =
    period === "week" ? subWeeks(todayLocal, offset) : subMonths(todayLocal, offset);

  // Weeks start Monday, matching the ISO weekdays the training plan uses.
  const first =
    period === "week" ? startOfWeek(anchor, { weekStartsOn: 1 }) : startOfMonth(anchor);
  const last =
    period === "week" ? endOfWeek(anchor, { weekStartsOn: 1 }) : endOfMonth(anchor);

  // A period still running is only judged on the days that have happened.
  const lastElapsed = last > todayLocal ? todayLocal : last;
  const inProgress = last > todayLocal;

  const dayCount = differenceInCalendarDays(lastElapsed, first) + 1;
  const dates = Array.from({ length: Math.max(0, dayCount) }, (_, i) =>
    format(addDays(first, i), "yyyy-MM-dd"),
  );

  // One instant range covering the whole period, converted from the user's
  // local midnights so the boundaries match what they experienced.
  const rangeStart = fromZonedTime(first, zone);
  const rangeEnd = fromZonedTime(addDays(lastElapsed, 1), zone);

  const [mealRows, exerciseRows, planRows, sessions] = await Promise.all([
    db
      .select({
        loggedAt: meals.loggedAt,
        calories: meals.totalCalories,
        proteinG: meals.totalProteinG,
        carbsG: meals.totalCarbsG,
        fatG: meals.totalFatG,
      })
      .from(meals)
      .where(
        and(
          eq(meals.userId, userId),
          gte(meals.loggedAt, rangeStart),
          lt(meals.loggedAt, rangeEnd),
        ),
      ),
    db
      .select({
        performedAt: exerciseEntries.performedAt,
        caloriesBurned: exerciseEntries.caloriesBurned,
      })
      .from(exerciseEntries)
      .where(
        and(
          eq(exerciseEntries.userId, userId),
          gte(exerciseEntries.performedAt, rangeStart),
          lt(exerciseEntries.performedAt, rangeEnd),
        ),
      ),
    db.query.dayPlans.findMany({ where: eq(dayPlans.userId, userId) }),
    listTrainingSessions(userId),
  ]);

  const byDate = new Map<
    string,
    { calories: number; proteinG: number; carbsG: number; fatG: number; mealCount: number }
  >();
  for (const row of mealRows) {
    const key = localDateString(row.loggedAt, zone);
    const bucket = byDate.get(key) ?? {
      calories: 0, proteinG: 0, carbsG: 0, fatG: 0, mealCount: 0,
    };
    bucket.calories += row.calories;
    bucket.proteinG += row.proteinG;
    bucket.carbsG += row.carbsG;
    bucket.fatG += row.fatG;
    bucket.mealCount += 1;
    byDate.set(key, bucket);
  }

  const burnByDate = new Map<string, number>();
  for (const row of exerciseRows) {
    const key = localDateString(row.performedAt, zone);
    burnByDate.set(key, (burnByDate.get(key) ?? 0) + row.caloriesBurned);
  }

  const explicit = new Map(planRows.map((row) => [row.date, row.dayType]));
  const trainingWeekdays = new Set(
    sessions.flatMap((session) => session.daysOfWeek),
  );

  const goalInputs = {
    normalGoal: profile.dailyCalorieGoal,
    restGoal: profile.restDayCalories,
    activeGoal: profile.activeDayCalories,
  };
  const split = {
    protein: profile.proteinPct,
    carbs: profile.carbsPct,
    fat: profile.fatPct,
  };

  const days: ReportDay[] = dates.map((date) => {
    // Same precedence as the dashboard: what they chose, then their plan,
    // then normal.
    const dayType: DayType =
      explicit.get(date) ??
      (sessions.length === 0
        ? "normal"
        : trainingWeekdays.has(getISODay(parseISO(date)))
          ? "active"
          : "rest");

    const eaten = byDate.get(date);
    const burned = burnByDate.get(date) ?? 0;
    const base = resolveDayCalories(dayType, goalInputs);
    const target = base + (profile.adjustTargetForExercise ? burned : 0);

    return {
      date,
      dayType,
      target,
      consumed: round(eaten?.calories ?? 0),
      proteinG: round(eaten?.proteinG ?? 0),
      carbsG: round(eaten?.carbsG ?? 0),
      fatG: round(eaten?.fatG ?? 0),
      mealCount: eaten?.mealCount ?? 0,
      exerciseCalories: burned,
      status: classifyDay(eaten?.calories ?? 0, target, (eaten?.mealCount ?? 0) > 0),
    };
  });

  const totals = summarisePeriod(
    days.map((day) => ({
      consumed: day.consumed,
      target: day.target,
      logged: day.mealCount > 0,
    })),
  );

  const loggedDays = days.filter((day) => day.mealCount > 0);
  const averageOf = (pick: (day: ReportDay) => number) =>
    loggedDays.length > 0
      ? Math.round(loggedDays.reduce((sum, day) => sum + pick(day), 0) / loggedDays.length)
      : 0;

  // Macro targets follow each day's own calorie target, so the comparison is
  // against what that day actually asked for.
  const macroTargets = loggedDays.map((day) => macroGrams(split, day.target));
  const averageTargetOf = (pick: (m: { proteinG: number; carbsG: number; fatG: number }) => number) =>
    macroTargets.length > 0
      ? Math.round(macroTargets.reduce((sum, m) => sum + pick(m), 0) / macroTargets.length)
      : 0;

  return {
    period,
    offset,
    label: periodLabel(period, first, last, offset),
    from: format(first, "yyyy-MM-dd"),
    to: format(last, "yyyy-MM-dd"),
    inProgress,
    days,
    totals,
    macros: {
      protein: { average: averageOf((d) => d.proteinG), target: averageTargetOf((m) => m.proteinG) },
      carbs: { average: averageOf((d) => d.carbsG), target: averageTargetOf((m) => m.carbsG) },
      fat: { average: averageOf((d) => d.fatG), target: averageTargetOf((m) => m.fatG) },
    },
  };
}

function periodLabel(
  period: ReportPeriod,
  first: Date,
  last: Date,
  offset: number,
): string {
  if (period === "month") {
    if (offset === 0) return "This month";
    if (offset === 1) return "Last month";
    return format(first, "MMMM yyyy");
  }

  if (offset === 0) return "This week";
  if (offset === 1) return "Last week";
  return `${format(first, "d MMM")} – ${format(last, "d MMM")}`;
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}
