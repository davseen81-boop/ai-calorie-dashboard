"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useCreateRoutine } from "@/hooks/use-routines";
import { ScheduleEditor, type ScheduleDraft } from "./schedule-editor";
import type { ApiMeal } from "@/types/api";

/**
 * Turn an already-logged meal into a reusable routine.
 *
 * Copies the items by value rather than referencing the meal, so editing or
 * deleting the original later never changes the routine.
 */
export function SaveAsRoutineDialog({
  meal,
  onClose,
}: {
  meal: ApiMeal | null;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [favorite, setFavorite] = useState(false);
  const [scheduled, setScheduled] = useState(false);
  const [schedule, setSchedule] = useState<ScheduleDraft>({
    daysOfWeek: [1, 2, 3, 4, 5],
    timeOfDay: "08:00",
  });

  const create = useCreateRoutine();

  useEffect(() => {
    if (meal) setName(meal.name);
  }, [meal]);

  function handleSave() {
    if (!meal) return;
    create.mutate(
      {
        name: name.trim(),
        kind: "meal",
        isFavorite: favorite,
        meals: [
          {
            name: meal.name,
            mealType: meal.mealType,
            items: meal.items.map((item) => ({
              name: item.name,
              quantity: item.quantity,
              unit: item.unit,
              calories: item.calories,
              proteinG: item.proteinG,
              carbsG: item.carbsG,
              fatG: item.fatG,
            })),
          },
        ],
        schedule: scheduled
          ? { enabled: true, daysOfWeek: schedule.daysOfWeek, timeOfDay: schedule.timeOfDay }
          : null,
      },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open={meal !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Save as routine</DialogTitle>
          <DialogDescription>
            Re-log this in one tap from the Repeat tab. A copy is stored, so
            editing this meal later won&apos;t change the routine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="routine-name">Name</Label>
            <Input
              id="routine-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My usual breakfast"
              maxLength={120}
            />
          </div>

          {meal && (
            <p className="rounded-lg bg-secondary/60 px-3 py-2 text-sm text-muted-foreground">
              {meal.items.map((i) => i.name).join(", ")} ·{" "}
              <span className="font-medium text-foreground">
                {Math.round(meal.totalCalories)} kcal
              </span>
            </p>
          )}

          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Pin to top</p>
              <p className="text-xs text-muted-foreground">
                Keeps it first in the Repeat list.
              </p>
            </div>
            <Switch checked={favorite} onCheckedChange={setFavorite} />
          </div>

          <div className="rounded-lg border p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Log automatically</p>
                <p className="text-xs text-muted-foreground">
                  Added when you next open the app after this time.
                </p>
              </div>
              <Switch checked={scheduled} onCheckedChange={setScheduled} />
            </div>

            {scheduled && (
              <div className="mt-4">
                <ScheduleEditor value={schedule} onChange={setSchedule} />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={create.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={create.isPending || name.trim().length === 0}
          >
            {create.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save routine"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
