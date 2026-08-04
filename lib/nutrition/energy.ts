import type {
  ActivityLevel,
  BiologicalSex,
  GoalType,
} from "@/lib/db/schema";

/**
 * Energy-requirement estimates.
 *
 * Pure functions with no I/O so the same numbers are produced on the server and
 * in the settings UI as the user drags the inputs.
 *
 * These are population-average estimates, not measurements. Real requirements
 * vary by roughly ±10% between people with identical inputs, before accounting
 * for body composition, medication or medical conditions.
 */

export interface BodyMetrics {
  sex: BiologicalSex;
  age: number;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  goalType: GoalType;
}

/**
 * How much you move **outside** deliberate training.
 *
 * The textbook ladder ("moderate exercise 3–5 days a week" → ×1.55) bundles
 * training into the multiplier. That was fine when the multiplier was the only
 * thing there was, but this app also knows the user's actual weekly sessions —
 * and counting the same runs in both places inflates the target by hundreds of
 * calories a day.
 *
 * So the question is now about daily life only — job, commute, errands — and
 * training is added on top from real MET arithmetic. The multipliers are
 * correspondingly lower, topping out around 1.7 for heavy manual work rather
 * than 1.9 for someone who also trains twice a day.
 *
 * The stored keys are unchanged so existing profiles stay valid; what each one
 * means has narrowed.
 */
export const ACTIVITY_OPTIONS: Array<{
  value: ActivityLevel;
  label: string;
  description: string;
  multiplier: number;
}> = [
  { value: "sedentary", label: "Mostly sitting", description: "Desk job, drive, little walking", multiplier: 1.2 },
  { value: "light", label: "Lightly active", description: "Some walking and light chores", multiplier: 1.3 },
  { value: "moderate", label: "On your feet often", description: "Teaching, retail, small children", multiplier: 1.4 },
  { value: "active", label: "Physically active job", description: "Trades, warehouse, delivery", multiplier: 1.55 },
  { value: "very_active", label: "Heavy manual work", description: "Construction, farming, labouring", multiplier: 1.7 },
];

export const GOAL_OPTIONS: Array<{
  value: GoalType;
  label: string;
  description: string;
  /** Applied to TDEE. */
  adjustment: number;
}> = [
  { value: "lose", label: "Lose weight", description: "About 0.5 kg a week", adjustment: -0.2 },
  { value: "maintain", label: "Maintain", description: "Stay where you are", adjustment: 0 },
  { value: "gain", label: "Gain weight", description: "About 0.25 kg a week", adjustment: 0.12 },
];

/**
 * Lowest intake these targets will ever recommend.
 *
 * Below roughly this level it becomes hard to meet micronutrient needs from
 * food alone, so an aggressive deficit on a small body is clamped rather than
 * shown. The floor is a guardrail on arithmetic, not clinical advice.
 */
const MINIMUM_KCAL: Record<BiologicalSex, number> = {
  female: 1200,
  male: 1500,
};

/**
 * Mifflin-St Jeor basal metabolic rate — energy used at complete rest.
 *
 * Chosen over Harris-Benedict because it is more accurate for contemporary
 * populations, and over Katch-McArdle because that needs a body-fat percentage
 * most people don't have.
 */
export function calculateBmr(metrics: BodyMetrics): number {
  const base =
    10 * metrics.weightKg + 6.25 * metrics.heightCm - 5 * metrics.age;
  return metrics.sex === "male" ? base + 5 : base - 161;
}

/** BMR scaled for daily life — everything except deliberate training. */
export function calculateDailyLiving(metrics: BodyMetrics): number {
  const activity =
    ACTIVITY_OPTIONS.find((o) => o.value === metrics.activityLevel)?.multiplier ??
    1.2;
  return calculateBmr(metrics) * activity;
}

/**
 * Total daily energy expenditure.
 *
 * `trainingPerDay` is the user's weekly training burn spread across seven days,
 * from their actual sessions. It is added rather than folded into the
 * multiplier, which is the whole point: one term for living, one for training,
 * each counted exactly once.
 */
export function calculateTdee(
  metrics: BodyMetrics,
  trainingPerDay = 0,
): number {
  return calculateDailyLiving(metrics) + Math.max(0, trainingPerDay);
}

export interface EnergyEstimate {
  bmr: number;
  /** BMR × the daily-life multiplier, before training. */
  dailyLiving: number;
  /** Weekly training burn averaged over seven days. */
  trainingPerDay: number;
  tdee: number;
  /** TDEE after the goal adjustment, before the floor. */
  rawTarget: number;
  /** What to actually use — `rawTarget` clamped to the minimum. */
  target: number;
  /** True when the floor changed the answer, so the UI can say so. */
  flooredAt: number | null;
  /** Negative for a deficit. */
  adjustment: number;
  macros: { proteinG: number; carbsG: number; fatG: number };
}

/**
 * The daily target, as a weekly average.
 *
 * This is deliberately one number for the whole week, not a per-day figure.
 * Splitting it into rest and training days is a separate step
 * (`suggestTargets` in ./training-plan) which only reshapes the week — the
 * total it distributes is exactly what comes out of here.
 */
export function estimateEnergy(
  metrics: BodyMetrics,
  trainingPerDay = 0,
): EnergyEstimate {
  const bmr = calculateBmr(metrics);
  const dailyLiving = calculateDailyLiving(metrics);
  const training = Math.max(0, trainingPerDay);
  const tdee = dailyLiving + training;

  const adjustment =
    GOAL_OPTIONS.find((o) => o.value === metrics.goalType)?.adjustment ?? 0;

  const rawTarget = tdee * (1 + adjustment);
  const floor = MINIMUM_KCAL[metrics.sex];
  const target = Math.max(rawTarget, floor);

  return {
    bmr: Math.round(bmr),
    dailyLiving: Math.round(dailyLiving),
    trainingPerDay: Math.round(training),
    tdee: Math.round(tdee),
    rawTarget: Math.round(rawTarget),
    target: Math.round(target / 10) * 10,
    flooredAt: rawTarget < floor ? floor : null,
    adjustment: Math.round(target - tdee),
    macros: suggestMacros(target, metrics),
  };
}

/**
 * Macro split for a calorie target.
 *
 * Protein is set per kilogram of body weight rather than as a percentage,
 * because protein needs track body size, not energy intake — a percentage
 * split silently cuts protein exactly when you cut calories. Fat is held at
 * 25% of energy (a rough lower bound for hormone function) and carbohydrate
 * takes the remainder.
 */
function suggestMacros(
  targetKcal: number,
  metrics: BodyMetrics,
): { proteinG: number; carbsG: number; fatG: number } {
  const proteinPerKg = metrics.goalType === "lose" ? 2.0 : 1.6;
  const proteinG = Math.round(metrics.weightKg * proteinPerKg);
  const fatG = Math.round((targetKcal * 0.25) / 9);

  const remaining = targetKcal - proteinG * 4 - fatG * 9;
  const carbsG = Math.max(0, Math.round(remaining / 4));

  return { proteinG, carbsG, fatG };
}

/** True when every field the estimate needs is present. */
export function hasCompleteMetrics(
  profile: Partial<BodyMetrics> | null | undefined,
): profile is BodyMetrics {
  return Boolean(
    profile?.sex &&
      profile.age &&
      profile.heightCm &&
      profile.weightKg &&
      profile.activityLevel &&
      profile.goalType,
  );
}
