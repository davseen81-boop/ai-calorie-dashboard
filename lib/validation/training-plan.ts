import { z } from "zod";

/** POST /api/training-plan */
export const createTrainingSessionSchema = z.object({
  name: z.string().trim().min(1, "Give the session a name.").max(80),
  /** A key from lib/nutrition/exercise.ts. Null means no MET value is known,
   *  so the session contributes nothing to the estimate. */
  activityKey: z.string().trim().min(1).max(60).nullish(),
  durationMinutes: z.number().int().min(5).max(600),
  daysOfWeek: z
    .array(z.number().int().min(1).max(7))
    .min(1, "Pick at least one day.")
    .max(7),
});

export type CreateTrainingSessionBody = z.infer<
  typeof createTrainingSessionSchema
>;
