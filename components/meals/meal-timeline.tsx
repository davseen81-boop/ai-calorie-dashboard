"use client";

import { useState } from "react";
import { format, parseISO } from "date-fns";
import {
  MoreVertical,
  Pencil,
  Repeat2,
  Sparkles,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useDeleteMeal } from "@/hooks/use-meals";
import type { ApiMeal } from "@/types/api";
import { EditMealDialog } from "./edit-meal-dialog";
import { SaveAsRoutineDialog } from "./save-as-routine-dialog";

const MEAL_TYPE_STYLES: Record<string, string> = {
  breakfast: "bg-warning/10 text-warning border-warning/20",
  lunch: "bg-carbs/10 text-carbs border-carbs/20",
  dinner: "bg-primary/10 text-primary border-primary/20",
  supper: "bg-protein/10 text-protein border-protein/20",
  snack: "bg-muted text-muted-foreground",
};

export function MealTimeline({ meals }: { meals: ApiMeal[] }) {
  const [pendingDelete, setPendingDelete] = useState<ApiMeal | null>(null);
  const [editing, setEditing] = useState<ApiMeal | null>(null);
  const [savingRoutine, setSavingRoutine] = useState<ApiMeal | null>(null);
  const deleteMeal = useDeleteMeal();

  if (meals.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-secondary">
            <UtensilsCrossed className="size-6 text-muted-foreground" />
          </span>
          <p className="font-medium">Nothing logged yet</p>
          <p className="max-w-xs text-sm text-muted-foreground">
            Tap <span className="font-medium">Log meal</span> to describe what
            you ate or snap a photo.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <ul className="space-y-3">
        {meals.map((meal) => (
          <li key={meal.id}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-start gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate font-medium">{meal.name}</h3>
                    <Badge
                      variant="outline"
                      className={cn(
                        "capitalize",
                        MEAL_TYPE_STYLES[meal.mealType] ?? MEAL_TYPE_STYLES.snack,
                      )}
                    >
                      {meal.mealType}
                    </Badge>
                    {meal.aiConfidence !== null && meal.aiConfidence < 0.4 && (
                      <Badge
                        variant="outline"
                        className="border-warning/40 text-warning"
                        title="The AI was unsure about this estimate"
                      >
                        <Sparkles className="mr-1 size-3" />
                        Low confidence
                      </Badge>
                    )}
                  </div>

                  <p className="mt-1 text-sm text-muted-foreground">
                    {format(parseISO(meal.loggedAt), "h:mm a")} ·{" "}
                    {meal.items.length} item
                    {meal.items.length === 1 ? "" : "s"}
                  </p>

                  <p className="mt-2 truncate text-sm text-muted-foreground">
                    {meal.items.map((item) => item.name).join(", ")}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    <span className="font-semibold text-foreground">
                      {Math.round(meal.totalCalories)} kcal
                    </span>
                    <span>P {round1(meal.totalProteinG)}g</span>
                    <span>C {round1(meal.totalCarbsG)}g</span>
                    <span>F {round1(meal.totalFatG)}g</span>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      aria-label={`Actions for ${meal.name}`}
                    >
                      <MoreVertical className="size-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditing(meal)}>
                      <Pencil className="mr-2 size-4" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setSavingRoutine(meal)}>
                      <Repeat2 className="mr-2 size-4" />
                      Save as routine
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setPendingDelete(meal)}
                    >
                      <Trash2 className="mr-2 size-4" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {/* Deletion is irreversible and the row vanishes optimistically, so it
          gets an explicit confirmation rather than an undo affordance. */}
      <Dialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this meal?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.name} and its{" "}
              {pendingDelete?.items.length ?? 0} item
              {pendingDelete?.items.length === 1 ? "" : "s"} will be removed.
              This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (pendingDelete) deleteMeal.mutate(pendingDelete.id);
                setPendingDelete(null);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EditMealDialog meal={editing} onClose={() => setEditing(null)} />

      <SaveAsRoutineDialog
        meal={savingRoutine}
        onClose={() => setSavingRoutine(null)}
      />
    </>
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
