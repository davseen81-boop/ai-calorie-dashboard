import { estimateCaloriesBurned, findActivity } from "./exercise";

/**
 * Turning a weekly training plan into per-day calorie targets.
 *
 * The important idea: the plan **redistributes** the week's energy, it does not
 * add to it. A daily goal derived from BMR already carries an activity
 * multiplier covering the exercise someone does — adding the same training on
 * top counts it twice, which is how "eat back your workout" quietly becomes a
 * surplus.
 *
 * So the week's total stays exactly as it was and only its shape changes:
 * training days go up by what they cost, rest days come down to pay for it.
 */

export interface PlannedSession {
  id: string;
  name: string;
  activityKey: string | null;
  durationMinutes: number;
  /** ISO weekdays, 1 = Monday. */
  daysOfWeek: number[];
}

export interface SessionCost extends PlannedSession {
  /** Net calories for one occurrence. */
  caloriesPerSession: number;
}

export interface PlanSummary {
  sessions: SessionCost[];
  /** ISO weekdays that have at least one session. */
  trainingDays: number[];
  restDayCount: number;
  weeklyCalories: number;
  /** Weekly burn spread over all seven days. */
  averageDailyCalories: number;
  /** Average burn on a day that has training — the gap between the targets. */
  typicalTrainingBurn: number;
  /** Burn per ISO weekday, for showing the week at a glance. */
  caloriesByWeekday: Record<number, number>;
}

/** Sessions on a given ISO weekday. */
export function sessionsOnDay(
  sessions: PlannedSession[],
  isoWeekday: number,
): PlannedSession[] {
  return sessions.filter((session) => session.daysOfWeek.includes(isoWeekday));
}

export function summarisePlan(
  sessions: PlannedSession[],
  weightKg: number | null,
): PlanSummary {
  const costed: SessionCost[] = sessions.map((session) => {
    const activity = session.activityKey
      ? findActivity(session.activityKey)
      : undefined;

    return {
      ...session,
      // No recognised activity means no MET value to work from, so it
      // contributes nothing rather than a fabricated figure.
      caloriesPerSession: activity
        ? estimateCaloriesBurned({
            met: activity.met,
            minutes: session.durationMinutes,
            weightKg,
          })
        : 0,
    };
  });

  const caloriesByWeekday: Record<number, number> = {};
  for (let day = 1; day <= 7; day += 1) caloriesByWeekday[day] = 0;

  for (const session of costed) {
    for (const day of session.daysOfWeek) {
      caloriesByWeekday[day] =
        (caloriesByWeekday[day] ?? 0) + session.caloriesPerSession;
    }
  }

  const trainingDays = Object.entries(caloriesByWeekday)
    .filter(([, calories]) => calories > 0)
    .map(([day]) => Number(day))
    .sort((a, b) => a - b);

  const weeklyCalories = trainingDays.reduce(
    (sum, day) => sum + caloriesByWeekday[day],
    0,
  );

  return {
    sessions: costed,
    trainingDays,
    restDayCount: 7 - trainingDays.length,
    weeklyCalories,
    averageDailyCalories: Math.round(weeklyCalories / 7),
    typicalTrainingBurn:
      trainingDays.length > 0
        ? Math.round(weeklyCalories / trainingDays.length)
        : 0,
    caloriesByWeekday,
  };
}

export interface SuggestedTargets {
  restDayCalories: number;
  trainingDayCalories: number;
  /** How far apart they are — equal to a training day's burn. */
  difference: number;
  /** Confirms the week still averages the user's goal. */
  weeklyAverage: number;
  /** Set when the rest day hit the floor and the split had to be compressed. */
  flooredAt: number | null;
}

/**
 * Below this, meeting micronutrient needs from food alone gets hard. Mirrors
 * the floor in `energy.ts`; the lower of the two values is used because sex
 * isn't always known here.
 */
const ABSOLUTE_FLOOR = 1200;

/**
 * Split a daily goal into rest-day and training-day targets.
 *
 * With T training days and R rest days in the week, and B the burn on a
 * training day:
 *
 *   training = goal + B × R/7
 *   rest     = goal − B × T/7
 *
 * which keeps `T × training + R × rest = 7 × goal` — the week is unchanged —
 * while making a training day exactly B kcal higher than a rest day.
 */
export function suggestTargets(
  dailyGoal: number,
  plan: PlanSummary,
): SuggestedTargets {
  const training = plan.trainingDays.length;
  const rest = plan.restDayCount;

  // Nothing to redistribute: no sessions, or training every single day.
  if (training === 0 || rest === 0 || plan.typicalTrainingBurn === 0) {
    return {
      restDayCalories: dailyGoal,
      trainingDayCalories: dailyGoal,
      difference: 0,
      weeklyAverage: dailyGoal,
      flooredAt: null,
    };
  }

  const burn = plan.typicalTrainingBurn;
  let restTarget = Math.round(dailyGoal - (burn * training) / 7);
  let trainingTarget = Math.round(dailyGoal + (burn * rest) / 7);
  let flooredAt: number | null = null;

  // A big weekly burn against a small goal can push the rest day below the
  // floor. Raise it and take the difference off the training day, so the
  // week still averages the goal rather than quietly gaining calories.
  if (restTarget < ABSOLUTE_FLOOR) {
    flooredAt = ABSOLUTE_FLOOR;
    const shortfall = (ABSOLUTE_FLOOR - restTarget) * rest;
    restTarget = ABSOLUTE_FLOOR;
    trainingTarget = Math.round(trainingTarget - shortfall / training);
  }

  return {
    restDayCalories: roundTo10(restTarget),
    trainingDayCalories: roundTo10(trainingTarget),
    difference: roundTo10(trainingTarget) - roundTo10(restTarget),
    weeklyAverage: Math.round(
      (training * roundTo10(trainingTarget) + rest * roundTo10(restTarget)) / 7,
    ),
    flooredAt,
  };
}

/** Targets are estimates; ten-calorie precision is already generous. */
function roundTo10(value: number): number {
  return Math.round(value / 10) * 10;
}
