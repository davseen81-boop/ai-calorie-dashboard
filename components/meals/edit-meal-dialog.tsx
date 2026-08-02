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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { MEAL_TYPES } from "@/lib/db/schema";
import { useUpdateMeal } from "@/hooks/use-meals";
import type { AnalyzedItem, ApiMeal, MealType } from "@/types/api";
import { AnalyzedItemsEditor } from "./analyzed-items-editor";

interface Props {
  meal: ApiMeal | null;
  onClose: () => void;
}

/**
 * Edit an existing meal.
 *
 * Sending `items` replaces the whole list server-side and re-derives the
 * totals, so the local edits and the stored totals can never disagree.
 */
export function EditMealDialog({ meal, onClose }: Props) {
  const [name, setName] = useState("");
  const [mealType, setMealType] = useState<MealType>("snack");
  const [items, setItems] = useState<AnalyzedItem[]>([]);
  const update = useUpdateMeal();

  // Re-seed the form whenever a different meal is opened.
  useEffect(() => {
    if (!meal) return;
    setName(meal.name);
    setMealType(meal.mealType);
    setItems(
      meal.items.map((item) => ({
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        proteinG: item.proteinG,
        carbsG: item.carbsG,
        fatG: item.fatG,
      })),
    );
  }, [meal]);

  function handleSave() {
    if (!meal) return;
    update.mutate(
      { id: meal.id, name: name.trim(), mealType, items },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open={meal !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit meal</DialogTitle>
          <DialogDescription>
            Correct the name, meal type, or any of the nutrition figures.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Meal</Label>
              <Select
                value={mealType}
                onValueChange={(value) => setMealType(value as MealType)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_TYPES.map((type) => (
                    <SelectItem key={type} value={type} className="capitalize">
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <AnalyzedItemsEditor items={items} onChange={setItems} />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={update.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={
              update.isPending || name.trim().length === 0 || items.length === 0
            }
          >
            {update.isPending ? (
              <>
                <Loader2 className="mr-2 size-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
