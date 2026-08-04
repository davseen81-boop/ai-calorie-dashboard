import "server-only";

import { and, asc, eq } from "drizzle-orm";

import { db } from "./index";
import { trainingSessions, type TrainingSessionRow } from "./schema";
import type { PlannedSession } from "@/lib/nutrition/training-plan";

/** The user's recurring training sessions. */

export interface CreateTrainingSessionInput {
  name: string;
  activityKey: string | null;
  durationMinutes: number;
  /** ISO weekdays, 1 = Monday. */
  daysOfWeek: number[];
}

/** SQLite has no array type; weekdays are stored as sorted CSV. */
function encodeDays(days: number[]): string {
  return Array.from(new Set(days)).sort((a, b) => a - b).join(",");
}

function decodeDays(csv: string): number[] {
  return csv
    .split(",")
    .map((value) => Number.parseInt(value, 10))
    .filter((day) => Number.isFinite(day) && day >= 1 && day <= 7);
}

/** Row shape converted to what the nutrition maths expects. */
export function toPlannedSession(row: TrainingSessionRow): PlannedSession {
  return {
    id: row.id,
    name: row.name,
    activityKey: row.activityKey,
    durationMinutes: row.durationMinutes,
    daysOfWeek: decodeDays(row.daysOfWeek),
  };
}

export async function listTrainingSessions(
  userId: string,
): Promise<PlannedSession[]> {
  const rows = await db.query.trainingSessions.findMany({
    where: eq(trainingSessions.userId, userId),
    orderBy: asc(trainingSessions.createdAt),
  });

  return rows.map(toPlannedSession);
}

export async function createTrainingSession(
  input: CreateTrainingSessionInput,
  userId: string,
): Promise<PlannedSession> {
  const id = crypto.randomUUID();

  await db.insert(trainingSessions).values({
    id,
    userId,
    name: input.name,
    activityKey: input.activityKey,
    durationMinutes: input.durationMinutes,
    daysOfWeek: encodeDays(input.daysOfWeek),
  });

  const created = await db.query.trainingSessions.findFirst({
    where: eq(trainingSessions.id, id),
  });
  if (!created) throw new Error("Training session vanished after creation");
  return toPlannedSession(created);
}

export async function deleteTrainingSession(
  id: string,
  userId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(trainingSessions)
    .where(
      and(eq(trainingSessions.id, id), eq(trainingSessions.userId, userId)),
    )
    .returning({ id: trainingSessions.id });

  return deleted.length > 0;
}
