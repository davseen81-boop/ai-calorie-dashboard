"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bed, Dumbbell, Minus } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api, ApiRequestError } from "@/lib/api/client";
import type { DayType, TodaySummary } from "@/types/api";

const OPTIONS: Array<{
  value: DayType;
  label: string;
  hint: string;
  icon: typeof Bed;
}> = [
  { value: "rest", label: "Rest", hint: "Lighter", icon: Bed },
  { value: "normal", label: "Normal", hint: "Average", icon: Minus },
  { value: "active", label: "Training", hint: "Heavier", icon: Dumbbell },
];

/**
 * Rest, normal, or training.
 *
 * Normal is the plain daily goal — the weekly average — and exists because
 * cycling is a choice rather than an obligation. Someone tracking against one
 * steady figure should not be pushed into a deficit just because they did not
 * train that day.
 *
 * Each tile carries its own target. Three options in a row is tight on a phone,
 * and a label alone would make you tap one to find out what it costs; the
 * number turns a guess into a comparison. The tiles stay large — this is the
 * one control here pressed with a thumb, often mid-cooking.
 */
export function DayTypeSelector({
  summary,
  isToday = true,
}: {
  summary: TodaySummary;
  /** False when an earlier day is on screen, so the copy stops saying "today". */
  isToday?: boolean;
}) {
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

  const fromPlan = summary.day.source === "plan";

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {isToday ? "Today" : "That day"} is a…
          </p>
          {fromPlan && (
            <span className="text-xs text-muted-foreground">
              from your weekly plan
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-2">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = summary.day.type === option.value;
            const calories = summary.day.options[option.value];

            return (
              <button
                key={option.value}
                type="button"
                disabled={setDay.isPending}
                onClick={() => setDay.mutate(option.value)}
                aria-pressed={active}
                aria-label={`${option.label} day, ${calories} kcal`}
                className={cn(
                  // min-h-24 keeps the target well clear of the 44px minimum
                  // even at three across, and the whole tile is pressable.
                  "flex min-h-24 flex-col items-center justify-center gap-0.5 rounded-xl border-2 px-1 py-3 transition-colors disabled:opacity-60",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <Icon className="size-5" />
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-xs font-medium tabular-nums">
                  {calories.toLocaleString()}
                </span>
                <span className="text-[10px] opacity-70">{option.hint}</span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          {summary.exercise.caloriesBurned > 0 && summary.exercise.adjustsTarget
            ? `${summary.goals.calories.toLocaleString()} kcal, including what was logged as training. `
            : `${summary.day.baseCalories.toLocaleString()} kcal. `}
          Macros scale with it. Normal is your plain daily goal, for tracking
          against one steady number.
        </p>
      </CardContent>
    </Card>
  );
}
