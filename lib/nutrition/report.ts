/**
 * Judging a period against its targets.
 *
 * The target moves day to day — rest, normal or training, plus whatever
 * exercise was logged — so "did I meet it" has to be asked one day at a time
 * against that day's own figure. A single period average compared against a
 * single number would quietly mark a heavy training day as an overshoot.
 */

export type DayStatus = "under" | "on_target" | "over" | "not_logged";

/**
 * How far from a day's target still counts as hitting it.
 *
 * Every figure in the app is an estimate — portion sizes, MET values, the BMR
 * equation itself — and each carries roughly this much uncertainty on its own.
 * Calling 2,150 against a 2,000 target a "miss" would be reading precision that
 * was never there.
 */
export const DAY_TOLERANCE = 0.1;

/** Tighter for a period: averaging many days cancels most of the daily noise. */
export const PERIOD_TOLERANCE = 0.05;

export function classifyDay(
  consumed: number,
  target: number,
  logged: boolean,
): DayStatus {
  if (!logged) return "not_logged";
  if (target <= 0) return "on_target";

  const ratio = consumed / target;
  if (ratio > 1 + DAY_TOLERANCE) return "over";
  if (ratio < 1 - DAY_TOLERANCE) return "under";
  return "on_target";
}

export interface ReportDayInput {
  consumed: number;
  target: number;
  logged: boolean;
}

export interface PeriodTotals {
  daysLogged: number;
  /** Days that have happened — a period in progress is not judged on its future. */
  daysElapsed: number;
  /** Averaged over logged days only; an unlogged day is missing data, not a zero. */
  averageConsumed: number;
  averageTarget: number;
  /** Positive means over target. */
  difference: number;
  onTargetDays: number;
  overDays: number;
  underDays: number;
  notLoggedDays: number;
  /** Null when too little was logged to answer honestly. */
  metTarget: boolean | null;
  /** Fraction of elapsed days with anything logged. */
  coverage: number;
}

/**
 * Below this, the average says more about which days were logged than about
 * what was eaten — someone who records four days out of thirty is not
 * "on target", they are unmeasured.
 */
export const MINIMUM_COVERAGE = 0.6;

export function summarisePeriod(days: ReportDayInput[]): PeriodTotals {
  const elapsed = days.length;
  const logged = days.filter((day) => day.logged);

  const averageConsumed =
    logged.length > 0
      ? logged.reduce((sum, day) => sum + day.consumed, 0) / logged.length
      : 0;

  // Averaged over the same days, so the comparison is like for like: including
  // an unlogged day's target would drag the target average toward a day whose
  // intake is unknown.
  const averageTarget =
    logged.length > 0
      ? logged.reduce((sum, day) => sum + day.target, 0) / logged.length
      : 0;

  const counts = { on_target: 0, over: 0, under: 0, not_logged: 0 };
  for (const day of days) {
    counts[classifyDay(day.consumed, day.target, day.logged)] += 1;
  }

  const coverage = elapsed > 0 ? logged.length / elapsed : 0;
  const withinTolerance =
    averageTarget > 0 &&
    Math.abs(averageConsumed - averageTarget) <= averageTarget * PERIOD_TOLERANCE;

  return {
    daysLogged: logged.length,
    daysElapsed: elapsed,
    averageConsumed: Math.round(averageConsumed),
    averageTarget: Math.round(averageTarget),
    difference: Math.round(averageConsumed - averageTarget),
    onTargetDays: counts.on_target,
    overDays: counts.over,
    underDays: counts.under,
    notLoggedDays: counts.not_logged,
    metTarget: coverage < MINIMUM_COVERAGE ? null : withinTolerance,
    coverage,
  };
}
