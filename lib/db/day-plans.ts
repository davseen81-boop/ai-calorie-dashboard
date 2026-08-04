import "server-only";

import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "./index";
import { listTrainingSessions } from "./training-plan";
import {
  dayPlans,
  type DayPlanRow,
  type DayType,
  type TrainingDayType,
} from "./schema";

/**
 * Planned day types.
 *
 * Only non-normal days are stored — a missing row means a normal day. That
 * keeps the table proportional to how often someone actually deviates, rather
 * than one row per day forever.
 */

export async function getDayType(
  date: string,
  userId: string,
): Promise<DayType> {
  const row = await db.query.dayPlans.findFirst({
    where: and(eq(dayPlans.userId, userId), eq(dayPlans.date, date)),
  });
  return row?.dayType ?? "normal";
}

/** Where a day's type came from, so the UI can say whether it was chosen. */
export type DayTypeSource = "explicit" | "plan" | "default";

export interface ResolvedDayType {
  type: TrainingDayType;
  source: DayTypeSource;
}

/**
 * The day's type, from the user's choice or their weekly plan.
 *
 * Order matters: an explicit tap for this date always wins, because it records
 * what actually happened rather than what was scheduled. Otherwise the weekly
 * plan decides, which is the point of having one — a normal week should need no
 * daily tapping at all. With no plan and no tap, a day is a rest day: training
 * is something you did, and the app should not assume you did it.
 */
export async function resolveDayType(
  date: string,
  isoWeekday: number,
  userId: string,
): Promise<ResolvedDayType> {
  const row = await db.query.dayPlans.findFirst({
    where: and(eq(dayPlans.userId, userId), eq(dayPlans.date, date)),
  });

  if (row) {
    // "normal" can only come from a row written before the two-way switch;
    // it reads as a rest day now.
    return { type: row.dayType === "active" ? "active" : "rest", source: "explicit" };
  }

  const sessions = await listTrainingSessions(userId);
  const trains = sessions.some((session) =>
    session.daysOfWeek.includes(isoWeekday),
  );

  return trains
    ? { type: "active", source: "plan" }
    : { type: "rest", source: sessions.length > 0 ? "plan" : "default" };
}

export async function listDayPlans(
  range: { from: string; to: string },
  userId: string,
): Promise<DayPlanRow[]> {
  return db.query.dayPlans.findMany({
    where: and(
      eq(dayPlans.userId, userId),
      gte(dayPlans.date, range.from),
      lte(dayPlans.date, range.to),
    ),
  });
}

/**
 * Record the user's choice for a date.
 *
 * Both values are stored now, including rest. Absence no longer means "normal"
 * — it means "follow my weekly plan" — so choosing rest on a day the plan calls
 * a training day has to be written down or it would be silently overridden on
 * the next page load.
 */
export async function setDayType(
  date: string,
  dayType: TrainingDayType,
  userId: string,
): Promise<TrainingDayType> {
  await db
    .insert(dayPlans)
    .values({ id: crypto.randomUUID(), userId, date, dayType })
    .onConflictDoUpdate({
      // Matches the unique index on (user_id, date).
      target: [dayPlans.userId, dayPlans.date],
      set: { dayType, updatedAt: new Date() },
    });

  return dayType;
}

/** Day types for a set of dates, for the weekly chart. */
export async function getDayTypeMap(
  dates: string[],
  userId: string,
): Promise<Map<string, DayType>> {
  if (dates.length === 0) return new Map();

  const rows = await db.query.dayPlans.findMany({
    where: and(eq(dayPlans.userId, userId), inArray(dayPlans.date, dates)),
  });

  return new Map(rows.map((row) => [row.date, row.dayType]));
}
