import "server-only";

import { z } from "zod";

import { getTodaySummary } from "@/lib/db/dashboard";
import { createMeal, deleteMeal, getOrCreateProfile } from "@/lib/db/queries";
import { createExercise } from "@/lib/db/exercise";
import { setDayType } from "@/lib/db/day-plans";
import { applyRoutine, listRoutines } from "@/lib/db/routines";
import { DAY_TYPES, MEAL_TYPES } from "@/lib/db/schema";
import {
  ACTIVITIES,
  estimateCaloriesBurned,
  findActivity,
} from "@/lib/nutrition/exercise";
import { localDateString, localTimeLabel } from "@/lib/date";
import type { JarvisAction, ToolSpec } from "./types";

/**
 * What Jarvis can actually do.
 *
 * Deliberately transport-agnostic: nothing here knows it is being driven by a
 * chat panel. Every tool goes through the same data layer the UI uses, so a
 * meal logged by Jarvis is an ordinary meal — same totals, same edit and delete
 * paths, no "logged by bot" special case anywhere downstream.
 */

export interface ToolContext {
  userId: string;
  now: Date;
}

interface ToolOutcome {
  output: Record<string, unknown>;
  action?: JarvisAction;
}

interface JarvisTool {
  spec: ToolSpec;
  run(args: Record<string, unknown>, ctx: ToolContext): Promise<ToolOutcome>;
}

// ---------------------------------------------------------------------------
// Shared argument schemas
// ---------------------------------------------------------------------------

/**
 * Bounds mirror `mealItemInputSchema`, so a hallucinated 90,000 kcal apple is
 * rejected here rather than stored. The model reads the rejection and retries.
 */
const itemSchema = z.object({
  name: z.string().trim().min(1).max(120),
  quantity: z.number().positive().max(1000),
  unit: z.string().trim().min(1).max(40),
  calories: z.number().min(0).max(10000),
  protein_g: z.number().min(0).max(1000),
  carbs_g: z.number().min(0).max(1000),
  fat_g: z.number().min(0).max(1000),
});

const logMealArgs = z.object({
  name: z.string().trim().min(1).max(120),
  meal_type: z.enum(MEAL_TYPES),
  items: z.array(itemSchema).min(1).max(30),
  notes: z.string().trim().max(500).optional(),
});

const logExerciseArgs = z.object({
  name: z.string().trim().min(1).max(120),
  minutes: z.number().int().min(1).max(1440),
  activity_key: z.string().trim().min(1).max(60).optional(),
  calories_burned: z.number().int().min(0).max(10000).optional(),
});

const setDayTypeArgs = z.object({ day_type: z.enum(DAY_TYPES) });
const routineArgs = z.object({ routine_id: z.string().trim().min(1).max(64) });
const mealIdArgs = z.object({ meal_id: z.string().trim().min(1).max(64) });

// ---------------------------------------------------------------------------
// Today
// ---------------------------------------------------------------------------

/**
 * A compact snapshot of the day.
 *
 * Shared by the tool and by the system prompt's opening context, so the first
 * turn can answer "how am I doing?" without spending a round trip on a tool
 * call. After any mutation the model must call the tool again — the prompt
 * snapshot is a point-in-time copy and goes stale the moment food is logged.
 */
export async function todaySnapshot(
  ctx: ToolContext,
): Promise<Record<string, unknown>> {
  const summary = await getTodaySummary(ctx.userId, ctx.now);
  const zone = summary.timezone;

  return {
    date: summary.localDate,
    local_time: localTimeLabel(zone, ctx.now),
    day_type: summary.day.type,
    calorie_target: summary.goals.calories,
    calorie_target_before_exercise: summary.day.baseCalories,
    normal_day_target: summary.day.normalCalories,
    calories_eaten: summary.consumed.calories,
    calories_remaining: summary.remainingCalories,
    protein_g: { eaten: summary.consumed.proteinG, target: summary.goals.proteinG },
    carbs_g: { eaten: summary.consumed.carbsG, target: summary.goals.carbsG },
    fat_g: { eaten: summary.consumed.fatG, target: summary.goals.fatG },
    macro_split_percent: summary.day.split,
    exercise_calories_today: summary.exercise.caloriesBurned,
    exercise_raises_target: summary.exercise.adjustsTarget,
    exercise: summary.exercise.entries.map((entry) => ({
      id: entry.id,
      name: entry.name,
      minutes: entry.durationMinutes,
      calories_burned: entry.caloriesBurned,
      at: localTimeLabel(zone, entry.performedAt),
    })),
    meals: summary.meals.map((meal) => ({
      id: meal.id,
      name: meal.name,
      meal_type: meal.mealType,
      calories: meal.totalCalories,
      protein_g: meal.totalProteinG,
      carbs_g: meal.totalCarbsG,
      fat_g: meal.totalFatG,
      at: localTimeLabel(zone, meal.loggedAt),
    })),
  };
}

// ---------------------------------------------------------------------------
// The catalogue
// ---------------------------------------------------------------------------

/** Every activity Jarvis may pick, as an enum so it cannot invent a key. */
const ACTIVITY_KEYS = ACTIVITIES.map((activity) => activity.key);

const TOOLS: JarvisTool[] = [
  {
    spec: {
      name: "get_today",
      description:
        "Read the current state of today: calorie target, what has been eaten, " +
        "macros, day type, logged exercise, and every meal logged so far with its id. " +
        "Call this before answering any question about how the day is going, and " +
        "again after logging anything — earlier numbers in this conversation are stale.",
      parameters: { type: "object", properties: {} },
    },
    async run(_args, ctx) {
      return { output: await todaySnapshot(ctx) };
    },
  },

  {
    spec: {
      name: "log_meal",
      description:
        "Log food the user says they ate. You supply the nutrition estimate — " +
        "one entry per distinct food, figures for the FULL quantity stated. " +
        "Returns the day's updated totals.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Short name for the whole meal, e.g. 'Eggs on toast'.",
          },
          meal_type: {
            type: "string",
            enum: [...MEAL_TYPES],
            description: "Infer from the local time if the user does not say.",
          },
          items: {
            type: "array",
            description: "One entry per distinct food or drink.",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                quantity: { type: "number" },
                unit: {
                  type: "string",
                  description: "e.g. 'g', 'ml', 'slice', 'serving'.",
                },
                calories: { type: "number", description: "Total for the full quantity." },
                protein_g: { type: "number" },
                carbs_g: { type: "number" },
                fat_g: { type: "number" },
              },
              required: ["name", "quantity", "unit", "calories", "protein_g", "carbs_g", "fat_g"],
            },
          },
          notes: {
            type: "string",
            description: "Assumptions you made about portion size. One sentence.",
          },
        },
        required: ["name", "meal_type", "items"],
      },
    },
    async run(args, ctx) {
      const input = logMealArgs.parse(args);

      const meal = await createMeal(
        {
          name: input.name,
          mealType: input.meal_type,
          // "text" rather than a new source: this is still an AI estimate from
          // a written description, and history should treat it identically.
          source: "text",
          rawInput: null,
          notes: input.notes ?? null,
          // Deliberately null. Confidence is a number the analyse endpoint
          // produces under a schema that forces the model to justify it; a
          // figure invented mid-chat would look equally authoritative and
          // mean much less.
          aiConfidence: null,
          loggedAt: ctx.now,
          items: input.items.map((item) => ({
            name: item.name,
            quantity: item.quantity,
            unit: item.unit,
            calories: item.calories,
            proteinG: item.protein_g,
            carbsG: item.carbs_g,
            fatG: item.fat_g,
          })),
        },
        ctx.userId,
      );

      const after = await todaySnapshot(ctx);

      return {
        output: {
          logged: true,
          meal_id: meal.id,
          name: meal.name,
          calories: meal.totalCalories,
          protein_g: meal.totalProteinG,
          carbs_g: meal.totalCarbsG,
          fat_g: meal.totalFatG,
          calories_eaten_today: after.calories_eaten,
          calories_remaining: after.calories_remaining,
        },
        action: {
          tool: "log_meal",
          summary: `Logged ${meal.name} — ${Math.round(meal.totalCalories)} kcal`,
          mutating: true,
        },
      };
    },
  },

  {
    spec: {
      name: "log_exercise",
      description:
        "Log a workout. Prefer activity_key so the calories are computed from " +
        "MET values and the user's weight. Only send calories_burned when the " +
        "user states a figure themselves (e.g. from a watch) or nothing in the " +
        "list fits.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "What the user called it." },
          minutes: { type: "integer", minimum: 1, maximum: 1440 },
          activity_key: {
            type: "string",
            enum: ACTIVITY_KEYS,
            description: "The closest match from the supported activities.",
          },
          calories_burned: {
            type: "integer",
            description: "Only when the user gave a figure, or no key fits.",
          },
        },
        required: ["name", "minutes"],
      },
    },
    async run(args, ctx) {
      const input = logExerciseArgs.parse(args);
      const activity = input.activity_key ? findActivity(input.activity_key) : undefined;

      if (!activity && input.calories_burned === undefined) {
        return {
          output: {
            error:
              "Send either a valid activity_key or calories_burned. " +
              `Valid keys: ${ACTIVITY_KEYS.join(", ")}.`,
          },
        };
      }

      const profile = await getOrCreateProfile(ctx.userId);

      // An explicit figure from the user always wins — a watch reading is
      // better evidence than a MET table.
      const burned =
        input.calories_burned !== undefined
          ? input.calories_burned
          : estimateCaloriesBurned({
              met: activity!.met,
              minutes: input.minutes,
              weightKg: profile.weightKg,
            });

      const entry = await createExercise(
        {
          name: input.name,
          activityKey: activity?.key ?? null,
          durationMinutes: input.minutes,
          caloriesBurned: burned,
          source: input.calories_burned !== undefined ? "manual" : "estimated",
          notes: null,
          performedAt: ctx.now,
        },
        ctx.userId,
      );

      const after = await todaySnapshot(ctx);

      return {
        output: {
          logged: true,
          exercise_id: entry.id,
          name: entry.name,
          minutes: entry.durationMinutes,
          calories_burned: entry.caloriesBurned,
          estimated_from: activity?.label ?? "the figure you were given",
          // Whether this actually moved the target depends on a profile
          // setting, so the model must not assume it did.
          raises_target: after.exercise_raises_target,
          calorie_target: after.calorie_target,
          calories_remaining: after.calories_remaining,
        },
        action: {
          tool: "log_exercise",
          summary: `Logged ${entry.name}, ${entry.durationMinutes} min — ${entry.caloriesBurned} kcal`,
          mutating: true,
        },
      };
    },
  },

  {
    spec: {
      name: "set_day_type",
      description:
        "Mark today as a rest, normal or active day. This is the plan for the " +
        "day and is separate from logged exercise — rest lowers the target, " +
        "active raises it, and the macro grams scale with whichever applies.",
      parameters: {
        type: "object",
        properties: {
          day_type: { type: "string", enum: [...DAY_TYPES] },
        },
        required: ["day_type"],
      },
    },
    async run(args, ctx) {
      const { day_type: dayType } = setDayTypeArgs.parse(args);

      // The plan is keyed by the user's local calendar date, not the server's
      // — the same conversion the dashboard uses, so the two never disagree
      // either side of midnight.
      const profile = await getOrCreateProfile(ctx.userId);
      await setDayType(
        localDateString(ctx.now, profile.timezone),
        dayType,
        ctx.userId,
      );
      const after = await todaySnapshot(ctx);

      return {
        output: {
          day_type: dayType,
          calorie_target: after.calorie_target,
          calories_remaining: after.calories_remaining,
          protein_g: after.protein_g,
          carbs_g: after.carbs_g,
          fat_g: after.fat_g,
        },
        action: {
          tool: "set_day_type",
          summary: `Today is now a ${dayType} day — ${String(after.calorie_target)} kcal`,
          mutating: true,
        },
      };
    },
  },

  {
    spec: {
      name: "list_routines",
      description:
        "List the user's saved meals and day templates, with their ids. Use " +
        "this when they refer to something they eat regularly — 'my usual " +
        "breakfast', 'the same as yesterday'.",
      parameters: { type: "object", properties: {} },
    },
    async run(_args, ctx) {
      const routines = await listRoutines(ctx.userId);

      return {
        output: {
          routines: routines.map((routine) => ({
            id: routine.id,
            name: routine.name,
            // "day" templates log several meals at once, so the model should
            // not offer one when the user asks about a single meal.
            kind: routine.kind,
            times_used: routine.useCount,
            meals: routine.meals.map((meal) => ({
              name: meal.name,
              meal_type: meal.mealType,
              calories: Math.round(
                meal.items.reduce((sum, item) => sum + item.calories, 0),
              ),
            })),
          })),
        },
      };
    },
  },

  {
    spec: {
      name: "apply_routine",
      description:
        "Log a saved routine. Call list_routines first to get the id. A 'day' " +
        "routine logs several meals at once — say so before using one.",
      parameters: {
        type: "object",
        properties: { routine_id: { type: "string" } },
        required: ["routine_id"],
      },
    },
    async run(args, ctx) {
      const { routine_id: routineId } = routineArgs.parse(args);

      const result = await applyRoutine(routineId, { at: ctx.now }, ctx.userId);
      if (!result) {
        return { output: { error: "No routine with that id. Call list_routines again." } };
      }

      const after = await todaySnapshot(ctx);
      const count = result.mealIds.length;

      return {
        output: {
          logged: true,
          routine: result.routine.name,
          meals_logged: count,
          calories_eaten_today: after.calories_eaten,
          calories_remaining: after.calories_remaining,
        },
        action: {
          tool: "apply_routine",
          summary: `Logged "${result.routine.name}" — ${count} meal${count === 1 ? "" : "s"}`,
          mutating: true,
        },
      };
    },
  },

  {
    spec: {
      name: "delete_meal",
      description:
        "Remove a meal logged today — for corrections like a double entry. " +
        "Get the id from get_today, tell the user exactly which meal you are " +
        "about to remove, and only call this once they have agreed.",
      parameters: {
        type: "object",
        properties: { meal_id: { type: "string" } },
        required: ["meal_id"],
      },
    },
    async run(args, ctx) {
      const { meal_id: mealId } = mealIdArgs.parse(args);

      // Scoped to today on purpose. A conversational delete is the one action
      // here the user cannot see coming, so it is confined to entries that are
      // on screen behind the chat panel.
      const summary = await getTodaySummary(ctx.userId, ctx.now);
      const target = summary.meals.find((meal) => meal.id === mealId);

      if (!target) {
        return {
          output: {
            error:
              "That meal is not in today's log. Jarvis can only remove meals " +
              "logged today — anything older has to be deleted from the History page.",
          },
        };
      }

      await deleteMeal(mealId, ctx.userId);
      const after = await todaySnapshot(ctx);

      return {
        output: {
          deleted: true,
          name: target.name,
          calories: target.totalCalories,
          calories_eaten_today: after.calories_eaten,
          calories_remaining: after.calories_remaining,
        },
        action: {
          tool: "delete_meal",
          summary: `Removed ${target.name} — ${Math.round(target.totalCalories)} kcal`,
          mutating: true,
        },
      };
    },
  },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.spec.name, tool]));

export const TOOL_SPECS: ToolSpec[] = TOOLS.map((tool) => tool.spec);

/**
 * Run one tool call.
 *
 * Failures come back as `{ error }` in the tool output rather than as a thrown
 * exception, because the model can act on them: a Zod rejection tells it what
 * was wrong with its arguments and it retries on the next round. Only genuine
 * bugs are logged server-side, and even those become a readable message rather
 * than a 500 that loses the whole conversation.
 */
export async function executeTool(
  call: { name: string; args: Record<string, unknown> },
  ctx: ToolContext,
): Promise<ToolOutcome> {
  const tool = BY_NAME.get(call.name);
  if (!tool) {
    return { output: { error: `No tool named "${call.name}".` } };
  }

  try {
    return await tool.run(call.args, ctx);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        output: {
          error: "Those arguments were rejected. Fix them and try again.",
          issues: error.issues.map((issue) => ({
            field: issue.path.join("."),
            problem: issue.message,
          })),
        },
      };
    }

    console.error(`Jarvis tool "${call.name}" failed:`, error);
    return { output: { error: `The ${call.name} step failed. Tell the user to try again.` } };
  }
}
