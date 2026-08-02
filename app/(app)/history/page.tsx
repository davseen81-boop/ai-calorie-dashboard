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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useMeals } from "@/hooks/use-meals";
import { MEAL_TYPES } from "@/lib/db/schema";
import type { ApiMeal, MealType } from "@/types/api";
import { cn } from "@/lib/utils";

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
  const hasFilters = Boolean(search || mealType !== ALL || date);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">History</h1>
        <p className="text-sm text-muted-foreground">
          Everything you&apos;ve logged, newest first.
        </p>
      </header>

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
          onValueChange={(value) => setMealType(value as MealType | typeof ALL)}
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
        <QueryError error={meals.error} onRetry={() => void meals.refetch()} />
      ) : meals.data.meals.length === 0 ? (
        <EmptyState hasFilters={hasFilters} />
      ) : (
        <GroupedMeals meals={meals.data.meals} />
      )}
    </div>
  );
}

/** Groups the flat, newest-first list into day sections. */
function GroupedMeals({ meals }: { meals: ApiMeal[] }) {
  const groups = useMemo(() => {
    const byDay = new Map<string, ApiMeal[]>();
    for (const meal of meals) {
      const key = format(parseISO(meal.loggedAt), "yyyy-MM-dd");
      const bucket = byDay.get(key);
      if (bucket) bucket.push(meal);
      else byDay.set(key, [meal]);
    }
    return Array.from(byDay.entries());
  }, [meals]);

  return (
    <div className="space-y-6">
      {groups.map(([day, dayMeals]) => {
        const total = dayMeals.reduce((sum, m) => sum + m.totalCalories, 0);
        return (
          <section key={day} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold text-muted-foreground">
                {format(parseISO(day), "EEEE d MMMM")}
              </h2>
              <span className="text-sm tabular-nums text-muted-foreground">
                {Math.round(total).toLocaleString()} kcal
              </span>
            </div>
            <MealTimeline meals={dayMeals} />
          </section>
        );
      })}
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
