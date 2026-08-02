import { z } from "zod";

import { MEAL_TYPES, ROUTINE_KINDS } from "@/lib/db/schema";
import { mealItemInputSchema } from "./meals";

/** `HH:mm`, 24-hour. */
const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use a 24-hour time like 08:30");

const routineMealSchema = z.object({
  name: z.string().trim().min(1).max(120),
  mealType: z.enum(MEAL_TYPES),
  timeOfDay: timeOfDaySchema.nullish(),
  items: z.array(mealItemInputSchema).min(1).max(30),
});

const scheduleSchema = z.object({
  enabled: z.boolean().default(true),
  /** ISO weekdays, 1 = Monday. */
  daysOfWeek: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  timeOfDay: timeOfDaySchema,
});

export const createRoutineSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    kind: z.enum(ROUTINE_KINDS).default("meal"),
    isFavorite: z.boolean().optional(),
    meals: z.array(routineMealSchema).min(1).max(12),
    schedule: scheduleSchema.nullish(),
  })
  .refine((v) => v.kind !== "meal" || v.meals.length === 1, {
    path: ["meals"],
    message: "A single-meal routine holds exactly one meal — use kind 'day' for more.",
  });

export const updateRoutineSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    isFavorite: z.boolean().optional(),
    meals: z.array(routineMealSchema).min(1).max(12).optional(),
    // `null` clears the schedule; omitting it leaves the schedule untouched.
    schedule: scheduleSchema.nullish(),
  })
  .refine((v) => Object.keys(v).length > 0, {
    message: "Provide at least one field to update.",
  });

export const applyRoutineSchema = z.object({
  /** ISO instant anchoring the local day; defaults to now. */
  at: z.coerce.date().optional(),
});

export type CreateRoutineBody = z.infer<typeof createRoutineSchema>;
export type UpdateRoutineBody = z.infer<typeof updateRoutineSchema>;
