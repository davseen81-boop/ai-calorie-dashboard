"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bed, Dumbbell } from "lucide-react";
import { toast } from "sonner";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { api, ApiRequestError } from "@/lib/api/client";
import type { TodaySummary } from "@/types/api";

type Choice = "rest" | "active";

const OPTIONS: Array<{ value: Choice; label: string; hint: string; icon: typeof Bed }> = [
  { value: "rest", label: "Rest day", hint: "No training", icon: Bed },
  { value: "active", label: "Training day", hint: "Working out", icon: Dumbbell },
];

/**
 * Rest day or training day.
 *
 * Two options rather than three: a middle "normal" was a third thing to decide
 * every morning, and the anchor that matters is the weekly average, not a
 * per-day "neither". The targets sit either side of the daily goal, so a week
 * that alternates still averages out to it.
 *
 * The buttons are deliberately large. This is the one control on the dashboard
 * pressed with a thumb, often mid-cooking, and the previous row of three was
 * about half the recommended minimum touch target.
 */
export function DayTypeSelector({ summary }: { summary: TodaySummary }) {
  const queryClient = useQueryClient();

  const setDay = useMutation({
    mutationFn: (dayType: Choice) =>
      api.patch<{ dayType: Choice }>("/api/day-plan", {
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

  const current: Choice = summary.day.type === "active" ? "active" : "rest";
  const fromPlan = summary.day.source === "plan";

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">Today is a…</p>
          {fromPlan && (
            <span className="text-xs text-muted-foreground">
              from your weekly plan
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          {OPTIONS.map((option) => {
            const Icon = option.icon;
            const active = current === option.value;

            return (
              <button
                key={option.value}
                type="button"
                disabled={setDay.isPending}
                onClick={() => setDay.mutate(option.value)}
                aria-pressed={active}
                className={cn(
                  // min-h-20 clears the 44px minimum comfortably, and the whole
                  // tile is the target rather than just the label.
                  "flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border-2 px-3 py-4 transition-colors disabled:opacity-60",
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground",
                )}
              >
                <Icon className="size-5" />
                <span className="text-sm font-semibold">{option.label}</span>
                <span className="text-[11px] opacity-80">{option.hint}</span>
              </button>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground">
          {summary.day.baseCalories.toLocaleString()} kcal
          {summary.exercise.caloriesBurned > 0 && summary.exercise.adjustsTarget
            ? `, ${summary.goals.calories.toLocaleString()} with today's logged training`
            : " today"}
          . Macros scale with it.
        </p>
      </CardContent>
    </Card>
  );
}
