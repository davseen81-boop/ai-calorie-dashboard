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

export const ACTIVITY_OPTIONS: Array<{
  value: ActivityLevel;
  label: string;
  description: string;
  multiplier: number;
}> = [
  { value: "sedentary", label: "Sedentary", description: "Desk job, little exercise", multiplier: 1.2 },
  { value: "light", label: "Lightly active", description: "Light exercise 1–3 days a week", multiplier: 1.375 },
  { value: "moderate", label: "Moderately active", description: "Moderate exercise 3–5 days a week", multiplier: 1.55 },
  { value: "active", label: "Very active", description: "Hard exercise 6–7 days a week", multiplier: 1.725 },
  { value: "very_active", label: "Extremely active", description: "Physical job or twice-daily training", multiplier: 1.9 },
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

/** Total daily energy expenditure: BMR scaled by how much you move. */
export function calculateTdee(metrics: BodyMetrics): number {
  const activity =
    ACTIVITY_OPTIONS.find((o) => o.value === metrics.activityLevel)?.multiplier ??
    1.2;
  return calculateBmr(metrics) * activity;
}

export interface EnergyEstimate {
  bmr: number;
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

export function estimateEnergy(metrics: BodyMetrics): EnergyEstimate {
  const bmr = calculateBmr(metrics);
  const tdee = calculateTdee(metrics);

  const adjustment =
    GOAL_OPTIONS.find((o) => o.value === metrics.goalType)?.adjustment ?? 0;

  const rawTarget = tdee * (1 + adjustment);
  const floor = MINIMUM_KCAL[metrics.sex];
  const target = Math.max(rawTarget, floor);

  return {
    bmr: Math.round(bmr),
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
