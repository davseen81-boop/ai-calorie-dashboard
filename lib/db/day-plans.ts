import "server-only";

import { and, eq, gte, inArray, lte } from "drizzle-orm";

import { db } from "./index";
import { listTrainingSessions } from "./training-plan";
import { dayPlans, type DayPlanRow, type DayType } from "./schema";

/**
 * Planned day types.
 *
 * A row means the user chose that day's type themselves. A missing row does
 * not mean "normal" — it means "decide from my weekly training plan", which is
 * what keeps the table proportional to how often someone overrides rather than
 * one row per day forever.
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
  type: DayType;
  source: DayTypeSource;
}

/**
 * The day's type, from the user's choice or their weekly plan.
 *
 * Order matters: an explicit tap for this date always wins, because it records
 * what actually happened rather than what was scheduled. Otherwise the weekly
 * plan decides, which is the point of having one — a normal week should need no
 * daily tapping at all.
 *
 * With **no plan at all** a day is normal, not rest. Cycling only makes sense
 * against a plan that says which days are which; without one, quietly holding
 * someone 15% under their goal every day they forget to tap is a deficit they
 * never asked for.
 */
export async function resolveDayType(
  date: string,
  isoWeekday: number,
  userId: string,
): Promise<ResolvedDayType> {
  const row = await db.query.dayPlans.findFirst({
    where: and(eq(dayPlans.userId, userId), eq(dayPlans.date, date)),
  });

  if (row) return { type: row.dayType, source: "explicit" };

  const sessions = await listTrainingSessions(userId);
  if (sessions.length === 0) return { type: "normal", source: "default" };

  const trains = sessions.some((session) =>
    session.daysOfWeek.includes(isoWeekday),
  );

  // With a plan, the non-training days are what pay for the training ones —
  // that is the arrangement the suggested targets were built around.
  return { type: trains ? "active" : "rest", source: "plan" };
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
 * Every value is stored, including "normal". Absence means "follow my weekly
 * plan", so choosing normal on a day the plan calls a training day has to be
 * written down or it would be silently overridden on the next page load.
 */
export async function setDayType(
  date: string,
  dayType: DayType,
  userId: string,
): Promise<DayType> {
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
