import { z } from "zod";

/** POST /api/exercise */
export const createExerciseSchema = z
  .object({
    /** Key from the MET table. Omit for a hand-entered activity. */
    activityKey: z.string().trim().max(60).nullish(),
    /** Required only when there's no activityKey to derive a label from. */
    name: z.string().trim().min(1).max(120).optional(),
    durationMinutes: z.number().int().min(1).max(600),
    /** Overrides the MET estimate when the user knows better (e.g. a watch). */
    caloriesBurned: z.number().min(0).max(5000).optional(),
    notes: z.string().trim().max(300).nullish(),
    performedAt: z.coerce.date().optional(),
  })
  .refine((v) => Boolean(v.activityKey) || Boolean(v.name), {
    path: ["name"],
    message: "Pick an activity or give it a name.",
  });

export const listExerciseQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;
