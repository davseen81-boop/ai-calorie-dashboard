"use client";

import { format, parseISO } from "date-fns";
import { Dumbbell, Info, Trash2, TrendingUp } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useDeleteExercise } from "@/hooks/use-exercise";
import { LogExerciseSheet } from "@/components/exercise/log-exercise-sheet";
import type { TodaySummary } from "@/types/api";

const TONE_STYLES: Record<TodaySummary["advice"]["tone"], string> = {
  under: "bg-warning/10 text-warning",
  on_track: "bg-success/10 text-success",
  close: "bg-secondary text-muted-foreground",
  over: "bg-destructive/10 text-destructive",
};

/**
 * Today's exercise and how it moved the target.
 *
 * Shows the arithmetic — base goal, plus what training earned, equals today's
 * target — because a number that silently changes is a number people stop
 * trusting.
 */
export function ExerciseCard({ summary }: { summary: TodaySummary }) {
  const { exercise, advice, goals } = summary;
  const remove = useDeleteExercise();

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Exercise</CardTitle>
        <LogExerciseSheet />
      </CardHeader>

      <CardContent className="space-y-4">
        <div className={cn("rounded-lg px-3 py-2", TONE_STYLES[advice.tone])}>
          <p className="text-sm font-semibold">{advice.headline}</p>
          <p className="mt-0.5 text-xs opacity-90">{advice.detail}</p>
        </div>

        {exercise.caloriesBurned > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {exercise.baseGoal.toLocaleString()}
              {exercise.adjustsTarget ? (
                <>
                  {" + "}
                  <span className="font-medium text-success">
                    {exercise.caloriesBurned}
                  </span>
                </>
              ) : null}
            </span>
            <span className="font-semibold tabular-nums">
              = {goals.calories.toLocaleString()} kcal
            </span>
          </div>
        )}

        {exercise.entries.length === 0 ? (
          <div className="flex flex-col items-center gap-1 rounded-lg border border-dashed py-6 text-center">
            <Dumbbell className="size-5 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Nothing logged today
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {exercise.entries.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center gap-3 rounded-lg border px-3 py-2"
              >
                <TrendingUp className="size-4 shrink-0 text-success" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{entry.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {entry.durationMinutes} min ·{" "}
                    {format(parseISO(entry.performedAt), "h:mm a")}
                    {entry.source === "manual" && " · your figure"}
                  </p>
                </div>
                <span className="shrink-0 text-sm font-semibold tabular-nums text-success">
                  +{Math.round(entry.caloriesBurned)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Remove ${entry.name}`}
                  onClick={() => remove.mutate(entry.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}

        {!exercise.adjustsTarget && exercise.caloriesBurned > 0 && (
          <p className="flex gap-2 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Exercise isn&apos;t raising your target — you turned that off in
              Settings. It&apos;s still recorded here.
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}
