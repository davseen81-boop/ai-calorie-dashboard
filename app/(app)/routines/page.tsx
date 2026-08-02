"use client";

import { useState } from "react";
import { CalendarClock, Loader2, Repeat2, Star, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ListSkeleton, QueryError } from "@/components/ui/query-states";
import { ScheduleEditor, type ScheduleDraft } from "@/components/meals/schedule-editor";
import { cn } from "@/lib/utils";
import {
  useApplyRoutine,
  useDeleteRoutine,
  useRoutines,
  useUpdateRoutine,
} from "@/hooks/use-routines";
import type { ApiRoutine } from "@/types/api";

export default function RoutinesPage() {
  const routines = useRoutines();
  const apply = useApplyRoutine();
  const update = useUpdateRoutine();
  const remove = useDeleteRoutine();
  const [pendingDelete, setPendingDelete] = useState<ApiRoutine | null>(null);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Routines</h1>
        <p className="text-sm text-muted-foreground">
          Meals you eat regularly. Log them in one tap, or on a schedule.
        </p>
      </header>

      {routines.isPending ? (
        <ListSkeleton rows={3} />
      ) : routines.isError ? (
        <QueryError error={routines.error} onRetry={() => void routines.refetch()} />
      ) : routines.data.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-14 text-center">
            <Repeat2 className="size-8 text-muted-foreground" />
            <p className="font-medium">No routines yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Log a meal, open its menu, and choose{" "}
              <span className="font-medium">Save as routine</span>. It&apos;ll
              show up here and in the Repeat tab.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-4">
          {routines.data.map((routine) => (
            <li key={routine.id}>
              <RoutineCard
                routine={routine}
                busy={apply.isPending && apply.variables === routine.id}
                onLog={() => apply.mutate(routine.id)}
                onToggleFavorite={() =>
                  update.mutate({ id: routine.id, isFavorite: !routine.isFavorite })
                }
                onScheduleChange={(schedule) =>
                  update.mutate({ id: routine.id, schedule })
                }
                onDelete={() => setPendingDelete(routine)}
              />
            </li>
          ))}
        </ul>
      )}

      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this routine?</DialogTitle>
            <DialogDescription>
              &ldquo;{pendingDelete?.name}&rdquo; will be removed, along with any
              schedule. Meals you already logged from it are kept.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) remove.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoutineCard({
  routine,
  busy,
  onLog,
  onToggleFavorite,
  onScheduleChange,
  onDelete,
}: {
  routine: ApiRoutine;
  busy: boolean;
  onLog: () => void;
  onToggleFavorite: () => void;
  onScheduleChange: (
    schedule: { enabled: boolean; daysOfWeek: number[]; timeOfDay: string } | null,
  ) => void;
  onDelete: () => void;
}) {
  const scheduled = routine.schedule !== null;
  const [draft, setDraft] = useState<ScheduleDraft>({
    daysOfWeek: routine.schedule
      ? routine.schedule.daysOfWeek
          .split(",")
          .map((d) => Number.parseInt(d, 10))
          .filter((d) => d >= 1 && d <= 7)
      : [1, 2, 3, 4, 5],
    timeOfDay: routine.schedule?.timeOfDay ?? "08:00",
  });

  const kcal = routine.meals.reduce(
    (sum, meal) => sum + meal.items.reduce((s, i) => s + i.calories, 0),
    0,
  );

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex items-start gap-3">
          <button
            type="button"
            onClick={onToggleFavorite}
            aria-label={routine.isFavorite ? "Unpin" : "Pin to top"}
            className="mt-1 shrink-0 text-muted-foreground transition-colors hover:text-warning"
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
              <h2 className="truncate font-medium">{routine.name}</h2>
              <Badge variant="secondary">
                {routine.kind === "day" ? `${routine.meals.length} meals` : "Meal"}
              </Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {Math.round(kcal)} kcal
              {routine.useCount > 0 && ` · used ${routine.useCount}×`}
            </p>
          </div>

          <Button size="sm" onClick={onLog} disabled={busy} className="shrink-0">
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <>
                <Repeat2 className="mr-1.5 size-4" />
                Log now
              </>
            )}
          </Button>
        </div>

        <ul className="space-y-1 border-l-2 pl-3 text-sm text-muted-foreground">
          {routine.meals.map((meal) => (
            <li key={meal.id}>
              {meal.timeOfDay && (
                <span className="mr-2 font-medium tabular-nums text-foreground">
                  {meal.timeOfDay}
                </span>
              )}
              <span className="font-medium text-foreground">{meal.name}</span>
              {" — "}
              {meal.items.map((i) => i.name).join(", ")}
            </li>
          ))}
        </ul>

        <div className="rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CalendarClock className="size-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">Log automatically</p>
                <p className="text-xs text-muted-foreground">
                  Added when you next open the app after this time.
                </p>
              </div>
            </div>
            <Switch
              checked={scheduled}
              onCheckedChange={(on) =>
                onScheduleChange(
                  on
                    ? {
                        enabled: true,
                        daysOfWeek: draft.daysOfWeek,
                        timeOfDay: draft.timeOfDay,
                      }
                    : null,
                )
              }
            />
          </div>

          {scheduled && (
            <div className="mt-4 space-y-3">
              <ScheduleEditor
                value={draft}
                onChange={(next) => {
                  setDraft(next);
                  onScheduleChange({
                    enabled: true,
                    daysOfWeek: next.daysOfWeek,
                    timeOfDay: next.timeOfDay,
                  });
                }}
              />
              {routine.schedule?.lastRunOn && (
                <p className="text-xs text-muted-foreground">
                  Last logged automatically on {routine.schedule.lastRunOn}.
                </p>
              )}
            </div>
          )}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="text-muted-foreground hover:text-destructive"
          onClick={onDelete}
        >
          <Trash2 className="mr-2 size-4" />
          Delete routine
        </Button>
      </CardContent>
    </Card>
  );
}
