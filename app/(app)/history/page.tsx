"use client";

import { useMemo, useState } from "react";
import { format, parseISO, startOfDay } from "date-fns";
import { CalendarIcon, Search, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListSkeleton, QueryError } from "@/components/ui/query-states";
import { MealTimeline } from "@/components/meals/meal-timeline";
import { PeriodReportView } from "@/components/reports/period-report";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useMeals, useProfile } from "@/hooks/use-meals";
import { MEAL_TYPES } from "@/lib/db/schema";
import type { ApiMeal, MealType } from "@/types/api";
import { cn } from "@/lib/utils";
import { localDateString } from "@/lib/date";

const ALL = "all";

export default function HistoryPage() {
  const [search, setSearch] = useState("");
  const [mealType, setMealType] = useState<MealType | typeof ALL>(ALL);
  const [date, setDate] = useState<Date | undefined>();

  // Without debouncing, every keystroke would fire a request and the results
  // would flicker as out-of-order responses landed.
  const debouncedSearch = useDebouncedValue(search, 300);

  const filters = useMemo(() => {
    const dayStart = date ? startOfDay(date) : undefined;
    const dayEnd = dayStart
      ? new Date(dayStart.getTime() + 24 * 60 * 60 * 1000)
      : undefined;

    return {
      ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
      ...(mealType !== ALL ? { mealType } : {}),
      ...(dayStart ? { from: dayStart.toISOString() } : {}),
      ...(dayEnd ? { to: dayEnd.toISOString() } : {}),
    };
  }, [debouncedSearch, mealType, date]);

  const meals = useMeals(filters);
  const profile = useProfile();
  const zone = profile.data?.timezone ?? "UTC";
  const hasFilters = Boolean(search || mealType !== ALL || date);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground">
          How the week and month went, and everything you&apos;ve logged.
        </p>
      </header>

      <Tabs defaultValue="report" className="space-y-4">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="report">Report</TabsTrigger>
          <TabsTrigger value="meals">Meals</TabsTrigger>
        </TabsList>

        <TabsContent value="report">
          <PeriodReportView />
        </TabsContent>

        <TabsContent value="meals" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search meals…"
                className="pl-9"
                aria-label="Search meals by name"
              />
            </div>

            <Select
              value={mealType}
              onValueChange={(value) =>
                setMealType(value as MealType | typeof ALL)
              }
            >
              <SelectTrigger className="sm:w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All meals</SelectItem>
                {MEAL_TYPES.map((type) => (
                  <SelectItem key={type} value={type} className="capitalize">
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn("sm:w-44", !date && "text-muted-foreground")}
                >
                  <CalendarIcon className="mr-2 size-4" />
                  {date ? format(date, "d MMM yyyy") : "Any date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="single"
                  selected={date}
                  onSelect={setDate}
                  disabled={{ after: new Date() }}
                  autoFocus
                />
              </PopoverContent>
            </Popover>

            {hasFilters && (
              <Button
                variant="ghost"
                onClick={() => {
                  setSearch("");
                  setMealType(ALL);
                  setDate(undefined);
                }}
              >
                <X className="mr-2 size-4" />
                Clear
              </Button>
            )}
          </div>

          {meals.isPending ? (
            <ListSkeleton />
          ) : meals.isError ? (
            <QueryError
              error={meals.error}
              onRetry={() => void meals.refetch()}
            />
          ) : meals.data.meals.length === 0 ? (
            <EmptyState hasFilters={hasFilters} />
          ) : (
            <GroupedMeals meals={meals.data.meals} zone={zone} />
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * A day's heading: the date, its calories, and where they came from.
 *
 * The bar is split by **energy**, not by grams — 10g of fat and 10g of carbs
 * are equal by weight but contribute very differently, so a gram-weighted bar
 * would misrepresent the day. The labels stay in grams, because that is what
 * the targets are set in.
 */
function DayHeading({ day, meals }: { day: string; meals: ApiMeal[] }) {
  const totals = meals.reduce(
    (acc, meal) => ({
      calories: acc.calories + meal.totalCalories,
      protein: acc.protein + meal.totalProteinG,
      carbs: acc.carbs + meal.totalCarbsG,
      fat: acc.fat + meal.totalFatG,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const energy = {
    protein: totals.protein * 4,
    carbs: totals.carbs * 4,
    fat: totals.fat * 9,
  };
  const fromMacros = energy.protein + energy.carbs + energy.fat;

  const share = (value: number) =>
    fromMacros > 0 ? (value / fromMacros) * 100 : 0;

  const parts = [
    { key: "protein", label: "P", grams: totals.protein, width: share(energy.protein), colour: "bg-arc-blue" },
    { key: "carbs", label: "C", grams: totals.carbs, width: share(energy.carbs), colour: "bg-arc-orange" },
    { key: "fat", label: "F", grams: totals.fat, width: share(energy.fat), colour: "bg-arc-yellow" },
  ];

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {format(parseISO(day), "EEEE d MMMM")}
        </h2>
        <span className="shrink-0 text-sm font-medium tabular-nums">
          {Math.round(totals.calories).toLocaleString()} kcal
        </span>
      </div>

      {fromMacros > 0 && (
        <>
          <div className="flex h-1.5 overflow-hidden rounded-full bg-foreground/[0.07]">
            {parts.map((part) => (
              <div
                key={part.key}
                className={part.colour}
                style={{ width: `${part.width}%` }}
              />
            ))}
          </div>
          <div className="flex gap-3 text-xs text-muted-foreground">
            {parts.map((part) => (
              <span key={part.key} className="flex items-center gap-1.5">
                <span
                  className={cn("size-2 shrink-0 rounded-full", part.colour)}
                  aria-hidden
                />
                <span className="tabular-nums">
                  {part.label} {round1(part.grams)}g
                </span>
                <span className="tabular-nums opacity-70">
                  {Math.round(part.width)}%
                </span>
              </span>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** Groups the flat, newest-first list into day sections. */
function GroupedMeals({ meals, zone }: { meals: ApiMeal[]; zone: string }) {
  const groups = useMemo(() => {
    const byDay = new Map<string, ApiMeal[]>();
    for (const meal of meals) {
      const key = localDateString(parseISO(meal.loggedAt), zone);
      const bucket = byDay.get(key);
      if (bucket) bucket.push(meal);
      else byDay.set(key, [meal]);
    }
    return Array.from(byDay.entries());
  }, [meals, zone]);

  return (
    <div className="space-y-6">
      {groups.map(([day, dayMeals]) => (
        <section key={day} className="space-y-3">
          <DayHeading day={day} meals={dayMeals} />
          <MealTimeline meals={dayMeals} />
        </section>
      ))}
    </div>
  );
}

function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
        <p className="font-medium">
          {hasFilters ? "No meals match those filters" : "No meals logged yet"}
        </p>
        <p className="max-w-xs text-sm text-muted-foreground">
          {hasFilters
            ? "Try a different date or clear the filters."
            : "Once you log a meal it will show up here."}
        </p>
      </CardContent>
    </Card>
  );
}
