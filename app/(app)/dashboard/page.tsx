"use client";

import { useEffect, useMemo, useState } from "react";
import { format, parseISO, subDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useViewedDate } from "@/components/providers/viewed-date";
import { Card, CardContent } from "@/components/ui/card";
import { CalorieRing } from "@/components/dashboard/calorie-ring";
import { MacroArcs } from "@/components/dashboard/macro-arcs";
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
  // How many days back is being shown. 0 is today, which stays the default on
  // every visit — the dashboard is a today screen that can look back, not a
  // date browser that happens to start on today.
  const [daysBack, setDaysBack] = useState(0);
  const { setDate } = useViewedDate();

  const viewedDate = useMemo(
    () =>
      daysBack === 0 ? null : format(subDays(new Date(), daysBack), "yyyy-MM-dd"),
    [daysBack],
  );

  // Published so the log button in the app shell files food against the day on
  // screen, and cleared on the way out so another page never inherits it.
  useEffect(() => {
    setDate(viewedDate);
    return () => setDate(null);
  }, [viewedDate, setDate]);

  const today = useTodaySummary(viewedDate);
  const weekly = useWeeklySummary(7);

  if (today.isPending) return <DashboardSkeleton />;
  if (today.isError) {
    return <QueryError error={today.error} onRetry={() => void today.refetch()} />;
  }

  const summary = today.data;
  const isToday = daysBack === 0;

  return (
    <div className="space-y-6">
      <header className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {isToday ? "Today" : daysBack === 1 ? "Yesterday" : "Earlier"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {format(parseISO(summary.localDate), "EEEE d MMMM")}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            // A year back is plenty of history and stops a stuck key walking
            // into dates before the account existed.
            onClick={() => setDaysBack((d) => Math.min(d + 1, 365))}
            aria-label="Previous day"
          >
            <ChevronLeft className="size-5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            disabled={isToday}
            onClick={() => setDaysBack((d) => Math.max(d - 1, 0))}
            aria-label="Next day"
          >
            <ChevronRight className="size-5" />
          </Button>
        </div>
      </header>

      {!isToday && (
        <button
          type="button"
          onClick={() => setDaysBack(0)}
          className="w-full rounded-xl border border-primary/30 bg-primary/5 px-4 py-2 text-sm font-medium text-primary"
        >
          Showing an earlier day — anything you log goes here. Back to today
        </button>
      )}

      {/* Renders nothing once installed or dismissed. Today only — a nudge to
          install has no business interrupting a look back at last Tuesday. */}
      {isToday && <InstallPrompt />}

      <DayTypeSelector summary={summary} isToday={isToday} />

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

        <MacroArcs consumed={summary.consumed} goals={summary.goals} />
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
          {isToday ? "Today's meals" : "Meals that day"}
        </h2>
        <MealTimeline meals={summary.meals} />
      </section>
    </div>
  );
}
