"use client";

import { format, parseISO } from "date-fns";

import { Card, CardContent } from "@/components/ui/card";
import { CalorieRing } from "@/components/dashboard/calorie-ring";
import { MacroDonut } from "@/components/dashboard/macro-donut";
import { DayTypeSelector } from "@/components/dashboard/day-type-selector";
import { ExerciseCard } from "@/components/dashboard/exercise-card";
import { SummaryCards } from "@/components/dashboard/summary-cards";
import { WeeklyChart } from "@/components/dashboard/weekly-chart";
import { InstallPrompt } from "@/components/layout/install-prompt";
import { MealTimeline } from "@/components/meals/meal-timeline";
import { DashboardSkeleton, QueryError } from "@/components/ui/query-states";
import { Skeleton } from "@/components/ui/skeleton";
import { useTodaySummary, useWeeklySummary } from "@/hooks/use-meals";

export default function DashboardPage() {
  const today = useTodaySummary();
  const weekly = useWeeklySummary(7);

  if (today.isPending) return <DashboardSkeleton />;
  if (today.isError) {
    return <QueryError error={today.error} onRetry={() => void today.refetch()} />;
  }

  const summary = today.data;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Today</h1>
        <p className="text-sm text-muted-foreground">
          {format(parseISO(summary.date), "EEEE d MMMM")}
        </p>
      </header>

      {/* Renders nothing once installed or dismissed. */}
      <InstallPrompt />

      <DayTypeSelector summary={summary} />

      <SummaryCards
        consumed={summary.consumed}
        goals={summary.goals}
        remaining={summary.remainingCalories}
      />

      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <CardContent className="flex items-center justify-center py-8">
            <CalorieRing
              consumed={summary.consumed.calories}
              goal={summary.goals.calories}
              progress={summary.goalProgress}
            />
          </CardContent>
        </Card>

        <MacroDonut consumed={summary.consumed} goals={summary.goals} />
      </div>

      <ExerciseCard summary={summary} />

      {/* The weekly chart loads independently so a slow week query never
          blocks today's numbers, which are the reason the page exists. */}
      {weekly.isPending ? (
        <Skeleton className="h-[280px] rounded-xl" />
      ) : weekly.isError ? (
        <QueryError error={weekly.error} onRetry={() => void weekly.refetch()} />
      ) : (
        <WeeklyChart summary={weekly.data} />
      )}

      <section className="space-y-3">
        <h2 className="text-lg font-semibold tracking-tight">
          Today&apos;s meals
        </h2>
        <MealTimeline meals={summary.meals} />
      </section>
    </div>
  );
}
