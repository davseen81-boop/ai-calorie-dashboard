import type {
  DayType,
  ExerciseEntryRow,
  MealItemRow,
  MealRow,
  MealType,
  ProfileRow,
  RoutineMealItemRow,
  RoutineMealRow,
  RoutineRow,
  RoutineScheduleRow,
} from "@/lib/db/schema";

/**
 * The wire shapes shared between the route handlers and the client.
 *
 * Dates cross the wire as ISO strings, so the row types can't be reused
 * verbatim — `Serialized<T>` rewrites every Date field to string.
 */
type Serialized<T> = {
  [K in keyof T]: T[K] extends Date
    ? string
    : T[K] extends Date | null
      ? string | null
      : T[K];
};

export type ApiMealItem = Serialized<MealItemRow>;
export type ApiMeal = Serialized<MealRow> & { items: ApiMealItem[] };
/**
 * `dietaryPreferences` is Omit-ed before being re-added: a plain intersection
 * would collapse it to `string & string[]`, which nothing can satisfy.
 */
export type ApiProfile = Omit<
  Serialized<ProfileRow>,
  "dietaryPreferences"
> & {
  /** Decoded from the JSON string the database stores. */
  dietaryPreferences: string[];
};

export type ApiRoutine = Serialized<RoutineRow> & {
  meals: Array<
    Serialized<RoutineMealRow> & { items: Array<Serialized<RoutineMealItemRow>> }
  >;
  schedule: Serialized<RoutineScheduleRow> | null;
};

export type ApiExerciseEntry = Serialized<ExerciseEntryRow>;

export interface TargetAdvice {
  tone: "under" | "on_track" | "close" | "over";
  headline: string;
  detail: string;
}

export interface MacroTotals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface DailyGoals {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface TodaySummary {
  date: string;
  timezone: string;
  consumed: MacroTotals;
  goals: DailyGoals;
  remainingCalories: number;
  goalProgress: number;
  localDate: string;
  meals: ApiMeal[];
  day: {
    type: DayType;
    baseCalories: number;
    normalCalories: number;
    split: { protein: number; carbs: number; fat: number };
  };
  exercise: {
    entries: ApiExerciseEntry[];
    caloriesBurned: number;
    adjustsTarget: boolean;
    baseGoal: number;
  };
  advice: TargetAdvice;
}

export interface WeeklyDay {
  date: string;
  totals: MacroTotals;
  mealCount: number;
  metGoal: boolean;
}

export interface WeeklySummary {
  timezone: string;
  goals: DailyGoals;
  days: WeeklyDay[];
  averageCalories: number;
  daysLogged: number;
}

export interface MealListResponse {
  meals: ApiMeal[];
  hasMore: boolean;
  limit: number;
  offset: number;
}

/** A single food row as the analyze endpoint returns it, before the user edits. */
export interface AnalyzedItem {
  name: string;
  quantity: number;
  unit: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

export interface AnalyzeResponse {
  name: string;
  mealType: MealType;
  confidence: number;
  notes: string | null;
  items: AnalyzedItem[];
}

export type { MealType, DayType };
