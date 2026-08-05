/**
 * Exercise energy estimates.
 *
 * Uses MET values (Compendium of Physical Activities): 1 MET is roughly what
 * you burn sitting still, and an activity's MET says how many times that rate
 * it costs.
 *
 * The important subtlety is **net vs gross**. A 6-MET run doesn't *add* six
 * times your resting burn — one of those METs is the resting burn you were
 * doing anyway, and which your daily target already counts. Using the gross
 * figure inflates every workout, so this subtracts the resting share and
 * reports the net.
 */

export interface ActivityOption {
  key: string;
  label: string;
  group: string;
  /** Compendium MET value. */
  met: number;
}

export const ACTIVITIES: ActivityOption[] = [
  // Walking and running
  { key: "walk_slow", label: "Walking, slow", group: "Walking & running", met: 2.8 },
  { key: "walk_brisk", label: "Walking, brisk", group: "Walking & running", met: 4.3 },
  { key: "hiking", label: "Hiking", group: "Walking & running", met: 6.0 },
  { key: "stairs", label: "Stair climbing", group: "Walking & running", met: 8.8 },
  { key: "run_easy", label: "Running, easy (8 km/h)", group: "Walking & running", met: 8.3 },
  { key: "run_moderate", label: "Running, moderate (10 km/h)", group: "Walking & running", met: 9.8 },
  { key: "run_fast", label: "Running, fast (12 km/h)", group: "Walking & running", met: 11.8 },

  // Gym
  { key: "strength_light", label: "Weights, light/moderate", group: "Gym", met: 3.5 },
  { key: "strength_hard", label: "Weights, vigorous", group: "Gym", met: 6.0 },
  { key: "hiit", label: "HIIT / circuits", group: "Gym", met: 8.0 },
  { key: "elliptical", label: "Elliptical", group: "Gym", met: 5.0 },
  { key: "rowing", label: "Rowing machine", group: "Gym", met: 7.0 },
  { key: "spin", label: "Spin class", group: "Gym", met: 8.5 },

  // Cycling and swimming
  { key: "cycle_leisure", label: "Cycling, leisurely", group: "Cycling & swimming", met: 4.0 },
  { key: "cycle_moderate", label: "Cycling, moderate", group: "Cycling & swimming", met: 8.0 },
  { key: "cycle_fast", label: "Cycling, vigorous", group: "Cycling & swimming", met: 10.0 },
  { key: "swim_leisure", label: "Swimming, leisurely", group: "Cycling & swimming", met: 6.0 },
  { key: "swim_laps", label: "Swimming, laps", group: "Cycling & swimming", met: 8.3 },

  // Sport
  { key: "football", label: "Football", group: "Sport", met: 7.0 },
  { key: "basketball", label: "Basketball", group: "Sport", met: 6.5 },
  { key: "badminton", label: "Badminton", group: "Sport", met: 5.5 },
  { key: "tennis", label: "Tennis", group: "Sport", met: 7.3 },
  { key: "martial_arts", label: "Martial arts", group: "Sport", met: 10.3 },
  { key: "climbing", label: "Climbing", group: "Sport", met: 7.5 },

  // Lower intensity
  { key: "yoga", label: "Yoga", group: "Low intensity", met: 2.5 },
  { key: "power_yoga", label: "Power yoga / pilates", group: "Low intensity", met: 4.0 },
  { key: "dancing", label: "Dancing", group: "Low intensity", met: 5.0 },
  { key: "housework", label: "Housework", group: "Low intensity", met: 3.0 },
  { key: "gardening", label: "Gardening", group: "Low intensity", met: 3.8 },
];

export function findActivity(key: string): ActivityOption | undefined {
  return ACTIVITIES.find((a) => a.key === key);
}

/** Used when the profile has no weight yet, so the estimate still works. */
export const ASSUMED_WEIGHT_KG = 70;

/**
 * Net calories burned by an activity.
 *
 * `(MET − 1)` removes the resting metabolism already counted in the daily
 * target — without it, an hour of yoga would "earn" the calories you'd have
 * burned lying on the sofa.
 *
 * The 3.5 × kg / 200 factor is the standard ACSM conversion from METs to
 * kcal/min.
 */
export function estimateCaloriesBurned(options: {
  met: number;
  minutes: number;
  weightKg?: number | null;
}): number {
  const weight = options.weightKg && options.weightKg > 0
    ? options.weightKg
    : ASSUMED_WEIGHT_KG;

  const netMet = Math.max(0, options.met - 1);
  const kcalPerMinute = (netMet * 3.5 * weight) / 200;

  return Math.round(kcalPerMinute * options.minutes);
}

export interface TargetAdvice {
  tone: "under" | "on_track" | "close" | "over";
  headline: string;
  detail: string;
}

/**
 * Plain-language read on where the day stands.
 *
 * Deliberately avoids prescribing what to eat — it reports the arithmetic and
 * flags the one case that matters clinically (eating far below target), which
 * is a conversation for a professional rather than an app.
 */
export function buildAdvice(input: {
  consumed: number;
  baseGoal: number;
  exerciseBurned: number;
  adjustedGoal: number;
  hoursLeftInDay: number;
}): TargetAdvice {
  const { consumed, baseGoal, exerciseBurned, adjustedGoal } = input;
  const remaining = Math.round(adjustedGoal - consumed);
  const earned = Math.round(exerciseBurned);

  /**
   * A finished day has nothing "left" — that word invites eating calories that
   * are no longer available. Reviewing an earlier day should read as a record,
   * not an allowance.
   */
  const dayIsOver = input.hoursLeftInDay <= 0.05;
  const shortfall = dayIsOver ? "under target" : "left";

  if (consumed === 0) {
    return {
      tone: "under",
      headline: dayIsOver
        ? "Nothing logged"
        : earned > 0
          ? `${adjustedGoal} kcal to play with`
          : "Nothing logged yet",
      detail: dayIsOver
        ? "No meals were recorded on this day."
        : earned > 0
          ? `Your ${baseGoal} target plus ${earned} earned from exercise.`
          : "Log a meal to see how the day is tracking.",
    };
  }

  if (remaining < -0.1 * adjustedGoal) {
    return {
      tone: "over",
      headline: `${Math.abs(remaining)} kcal over`,
      detail:
        earned > 0
          ? `Even with ${earned} earned from exercise. One heavy day changes little over a week.`
          : "One heavy day changes little over a week — what matters is the trend.",
    };
  }

  if (remaining < 0) {
    return {
      tone: "close",
      headline: `${Math.abs(remaining)} kcal over`,
      detail: "Close enough to target to be within the noise of any estimate.",
    };
  }

  // Well under target with the day nearly done is worth flagging: chronic
  // under-eating is the failure mode people don't notice.
  if (input.hoursLeftInDay <= 4 && remaining > 0.35 * adjustedGoal) {
    return {
      tone: "under",
      headline: `${remaining} kcal ${shortfall}`,
      detail:
        earned > 0
          ? `You trained today, which raised the target by ${earned}. Eating well under it regularly is worth a word with a doctor or dietitian.`
          : "That's a long way under with the day nearly done. Regularly under-eating is worth a word with a doctor or dietitian.",
    };
  }

  return {
    tone: "on_track",
    headline: `${remaining} kcal ${shortfall}`,
    detail: dayIsOver
      ? "Close enough to target for the day to count."
      : earned > 0
        ? `Includes ${earned} earned from today's exercise.`
        : "On track for your target.",
  };
}
