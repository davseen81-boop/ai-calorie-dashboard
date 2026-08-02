"use client";

import { CalendarClock, Loader2, Repeat2, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useApplyRoutine, useRoutines, useUpdateRoutine } from "@/hooks/use-routines";
import type { ApiRoutine } from "@/types/api";

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * One-tap re-logging of saved routines.
 *
 * Ordered by the API as favourites first, then most-used — so the thing you
 * actually eat every day rises to the top without any organising.
 */
export function RepeatPicker({ onLogged }: { onLogged: () => void }) {
  const routines = useRoutines();
  const apply = useApplyRoutine();
  const update = useUpdateRoutine();

  // Also show the skeleton while revalidating an empty cache: reopening the
  // sheet right after saving a routine would otherwise flash "No routines yet"
  // for a moment before the refetch lands.
  if (routines.isPending || (routines.isFetching && routines.data?.length === 0)) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>
    );
  }

  if (routines.isError) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
        Couldn&apos;t load your routines. Close and try again.
      </p>
    );
  }

  if (routines.data.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <Repeat2 className="mx-auto size-8 text-muted-foreground" />
        <p className="mt-2 font-medium">No routines yet</p>
        <p className="mx-auto mt-1 max-w-xs text-sm text-muted-foreground">
          Log a meal, then choose <span className="font-medium">Save as
          routine</span> from its menu. It&apos;ll appear here for one-tap
          logging.
        </p>
      </div>
    );
  }

  return (
    <ul className="space-y-3">
      {routines.data.map((routine) => (
        <li key={routine.id}>
          <div className="rounded-xl border bg-card p-3 shadow-sm">
            <div className="flex items-start gap-2">
              <button
                type="button"
                aria-label={
                  routine.isFavorite
                    ? `Unpin ${routine.name}`
                    : `Pin ${routine.name}`
                }
                onClick={() =>
                  update.mutate({ id: routine.id, isFavorite: !routine.isFavorite })
                }
                className="mt-0.5 shrink-0 text-muted-foreground transition-colors hover:text-warning"
              >
                <Star
                  className={cn(
                    "size-4",
                    routine.isFavorite && "fill-warning text-warning",
                  )}
                />
              </button>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{routine.name}</span>
                  {routine.kind === "day" && (
                    <Badge variant="secondary">
                      {routine.meals.length} meals
                    </Badge>
                  )}
                  {routine.schedule?.enabled && (
                    <Badge
                      variant="outline"
                      className="gap-1 border-primary/30 text-primary"
                    >
                      <CalendarClock className="size-3" />
                      {formatSchedule(routine.schedule)}
                    </Badge>
                  )}
                </div>

                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {summarise(routine)}
                </p>

                <p className="mt-1 text-xs font-medium tabular-nums">
                  {Math.round(totalCalories(routine))} kcal
                  {routine.useCount > 0 && (
                    <span className="ml-2 font-normal text-muted-foreground">
                      used {routine.useCount}×
                    </span>
                  )}
                </p>
              </div>

              <Button
                size="sm"
                className="shrink-0"
                disabled={apply.isPending}
                onClick={() =>
                  apply.mutate(routine.id, { onSuccess: onLogged })
                }
              >
                {apply.isPending && apply.variables === routine.id ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    <Repeat2 className="mr-1.5 size-4" />
                    Log
                  </>
                )}
              </Button>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function totalCalories(routine: ApiRoutine): number {
  return routine.meals.reduce(
    (sum, meal) => sum + meal.items.reduce((s, i) => s + i.calories, 0),
    0,
  );
}

function summarise(routine: ApiRoutine): string {
  if (routine.kind === "day") {
    return routine.meals
      .map((m) => (m.timeOfDay ? `${m.timeOfDay} ${m.name}` : m.name))
      .join(" · ");
  }
  return routine.meals[0]?.items.map((i) => i.name).join(", ") ?? "";
}

/** "Mon–Fri 08:00", "Daily 08:00", or an explicit day list. */
function formatSchedule(schedule: NonNullable<ApiRoutine["schedule"]>): string {
  const days = schedule.daysOfWeek
    .split(",")
    .map((d) => Number.parseInt(d, 10))
    .filter((d) => d >= 1 && d <= 7)
    .sort((a, b) => a - b);

  const label =
    days.length === 7
      ? "Daily"
      : days.join(",") === "1,2,3,4,5"
        ? "Mon–Fri"
        : days.join(",") === "6,7"
          ? "Weekends"
          : days.map((d) => WEEKDAY_LABELS[d - 1]).join(" ");

  return `${label} ${schedule.timeOfDay}`;
}
