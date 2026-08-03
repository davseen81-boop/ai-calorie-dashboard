/**
 * Macro splits expressed as percentages of energy.
 *
 * Storing percentages rather than grams means the split survives a change of
 * calorie target: on a heavier training day the grams scale up on their own,
 * and the three always describe a whole day rather than drifting into a set
 * that adds up to something other than the target.
 */

export type MacroKey = "protein" | "carbs" | "fat";

export interface MacroSplit {
  protein: number;
  carbs: number;
  fat: number;
}

/** kcal per gram. Protein and carbs 4, fat 9. */
export const KCAL_PER_GRAM: Record<MacroKey, number> = {
  protein: 4,
  carbs: 4,
  fat: 9,
};

export const DEFAULT_SPLIT: MacroSplit = { protein: 30, carbs: 40, fat: 30 };

/**
 * Move one macro and absorb the difference in the other two.
 *
 * The change is shared out in proportion to the others' current sizes, so
 * nudging protein up takes mostly from whichever of carbs/fat is larger rather
 * than flattening the smaller one first. Any rounding remainder is pushed onto
 * the largest of the two, which keeps the total at exactly 100 — the whole
 * point of the exercise.
 */
export function rebalanceMacros(
  current: MacroSplit,
  changed: MacroKey,
  nextValue: number,
): MacroSplit {
  const target = clamp(Math.round(nextValue), 0, 100);
  const others = (["protein", "carbs", "fat"] as MacroKey[]).filter(
    (k) => k !== changed,
  );

  const remaining = 100 - target;
  const [a, b] = others;
  const currentOthersTotal = current[a] + current[b];

  let aValue: number;
  let bValue: number;

  if (currentOthersTotal <= 0) {
    // Both were zero — nothing to keep in proportion, so split evenly.
    aValue = Math.round(remaining / 2);
    bValue = remaining - aValue;
  } else {
    aValue = Math.round((current[a] / currentOthersTotal) * remaining);
    bValue = remaining - aValue;
  }

  // A proportional share can still land outside 0..100 at the extremes.
  aValue = clamp(aValue, 0, remaining);
  bValue = clamp(remaining - aValue, 0, remaining);

  const result = { ...current, [changed]: target, [a]: aValue, [b]: bValue };

  // Belt and braces: never return a split that doesn't total 100.
  const total = result.protein + result.carbs + result.fat;
  if (total !== 100) {
    const largest = (["carbs", "fat", "protein"] as MacroKey[])
      .filter((k) => k !== changed)
      .sort((x, y) => result[y] - result[x])[0];
    result[largest] = clamp(result[largest] + (100 - total), 0, 100);
  }

  return result;
}

/** Grams implied by a split at a given calorie target. */
export function macroGrams(
  split: MacroSplit,
  calories: number,
): { proteinG: number; carbsG: number; fatG: number } {
  return {
    proteinG: Math.round((calories * (split.protein / 100)) / KCAL_PER_GRAM.protein),
    carbsG: Math.round((calories * (split.carbs / 100)) / KCAL_PER_GRAM.carbs),
    fatG: Math.round((calories * (split.fat / 100)) / KCAL_PER_GRAM.fat),
  };
}

/** Percentages implied by an existing set of gram goals — used to migrate. */
export function splitFromGrams(grams: {
  proteinG: number;
  carbsG: number;
  fatG: number;
}): MacroSplit {
  const kcal =
    grams.proteinG * 4 + grams.carbsG * 4 + grams.fatG * 9;
  if (kcal <= 0) return DEFAULT_SPLIT;

  const protein = Math.round((grams.proteinG * 4 * 100) / kcal);
  const carbs = Math.round((grams.carbsG * 4 * 100) / kcal);
  return { protein, carbs, fat: 100 - protein - carbs };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
