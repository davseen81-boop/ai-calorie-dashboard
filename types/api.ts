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
    /** "explicit" when the user tapped it, "plan" from their weekly training. */
    source: "explicit" | "plan" | "default";
    baseCalories: number;
    normalCalories: number;
    /** What each choice is worth, so each button can show its own figure. */
    options: { rest: number; normal: number; active: number };
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

export interface TrainingSession {
  id: string;
  name: string;
  activityKey: string | null;
  durationMinutes: number;
  /** ISO weekdays, 1 = Monday. */
  daysOfWeek: number[];
  /** Net calories for one occurrence. */
  caloriesPerSession: number;
}

export interface SuggestedTargets {
  restDayCalories: number;
  trainingDayCalories: number;
  difference: number;
  weeklyAverage: number;
  flooredAt: number | null;
}

export interface TrainingPlan {
  sessions: TrainingSession[];
  trainingDays: number[];
  restDayCount: number;
  weeklyCalories: number;
  averageDailyCalories: number;
  typicalTrainingBurn: number;
  caloriesByWeekday: Record<number, number>;
  suggested: SuggestedTargets;
  dailyGoal: number;
  usingAssumedWeight: boolean;
}

export type ReportPeriod = "week" | "month";
export type DayStatus = "under" | "on_target" | "over" | "not_logged";

export interface ReportDay {
  date: string;
  dayType: DayType;
  target: number;
  consumed: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealCount: number;
  exerciseCalories: number;
  status: DayStatus;
}

export interface PeriodTotals {
  daysLogged: number;
  daysElapsed: number;
  averageConsumed: number;
  averageTarget: number;
  difference: number;
  onTargetDays: number;
  overDays: number;
  underDays: number;
  notLoggedDays: number;
  /** Null when too little was logged to answer honestly. */
  metTarget: boolean | null;
  coverage: number;
}

export interface PeriodReport {
  period: ReportPeriod;
  offset: number;
  label: string;
  from: string;
  to: string;
  inProgress: boolean;
  days: ReportDay[];
  totals: PeriodTotals;
  macros: {
    protein: { average: number; target: number };
    carbs: { average: number; target: number };
    fat: { average: number; target: number };
  };
}
/** One side effect Jarvis carried out, shown under its reply. */
export interface JarvisAction {
  tool: string;
  summary: string;
  /** Whether cached dashboard data is now stale. */
  mutating: boolean;
}

export interface JarvisReply {
  reply: string;
  actions: JarvisAction[];
}

export type { MealType, DayType };
