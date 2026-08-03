"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bed, Flame, Minus } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api, ApiRequestError } from "@/lib/api/client";
import type { DayType, TodaySummary } from "@/types/api";

const OPTIONS: Array<{
  value: DayType;
  label: string;
  icon: typeof Bed;
}> = [
  { value: "rest", label: "Rest", icon: Bed },
  { value: "normal", label: "Normal", icon: Minus },
  { value: "active", label: "Active", icon: Flame },
];

/**
 * Marks today as a rest, normal or active day.
 *
 * This is the *plan* — separate from logged exercise, which records what
 * actually happened. Both can move the target, so the difference from a normal
 * day is spelled out rather than left for the user to infer from a number that
 * changed.
 */
export function DayTypeSelector({ summary }: { summary: TodaySummary }) {
  const queryClient = useQueryClient();

  const setDay = useMutation({
    mutationFn: (dayType: DayType) =>
      api.patch<{ dayType: DayType }>("/api/day-plan", {
        date: summary.localDate,
        dayType,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiRequestError
          ? error.message
          : "Could not change the day type.",
      ),
  });

  const difference = summary.day.baseCalories - summary.day.normalCalories;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">Today is a…</p>
          {difference !== 0 && (
            <span
              className={cn(
                "text-xs font-medium tabular-nums",
                difference > 0 ? "text-success" : "text-muted-foreground",
              )}
            >
              {difference > 0 ? "+" : ""}
              {difference} kcal vs normal
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = summary.day.type === option.value;
            return (
              <button
                key={option.value}
                type="button"
                disabled={setDay.isPending}
                onClick={() => setDay.mutate(option.value)}
                aria-pressed={active}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-xl border py-3 text-sm font-medium transition-colors disabled:opacity-60",
                  active
                    ? "border-primary bg-primary/5 text-primary"
                    : "text-muted-foreground hover:border-primary/40",
                )}
              >
                <Icon className="size-4" />
                {option.label}
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          {summary.day.baseCalories.toLocaleString()} kcal before exercise
          {summary.exercise.caloriesBurned > 0 &&
            summary.exercise.adjustsTarget &&
            `, ${summary.goals.calories.toLocaleString()} with today's training`}
          . Macros scale with it.
        </p>
      </CardContent>
    </Card>
  );
}
