"use client";

import { Plus, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AnalyzedItem } from "@/types/api";

interface Props {
  items: AnalyzedItem[];
  onChange: (items: AnalyzedItem[]) => void;
}

/**
 * Editable list of the foods the AI identified.
 *
 * The estimate is a starting point, not an answer — the user can correct every
 * number before anything is saved. Totals shown here are recomputed locally so
 * corrections are reflected instantly; the server re-derives them on save.
 */
export function AnalyzedItemsEditor({ items, onChange }: Props) {
  function updateItem(index: number, patch: Partial<AnalyzedItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  function removeItem(index: number) {
    onChange(items.filter((_, i) => i !== index));
  }

  function addItem() {
    onChange([
      ...items,
      {
        name: "",
        quantity: 1,
        unit: "serving",
        calories: 0,
        proteinG: 0,
        carbsG: 0,
        fatG: 0,
      },
    ]);
  }

  const totals = items.reduce(
    (acc, item) => ({
      calories: acc.calories + item.calories,
      protein: acc.protein + item.proteinG,
      carbs: acc.carbs + item.carbsG,
      fat: acc.fat + item.fatG,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  if (items.length === 0) {
    return (
      <div className="space-y-3 rounded-lg border border-dashed p-6 text-center">
        <p className="text-sm text-muted-foreground">
          No items yet — a meal needs at least one before it can be saved.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={addItem}>
          <Plus className="mr-2 size-4" />
          Add an item
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div key={index} className="rounded-xl border bg-card p-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Input
              value={item.name}
              onChange={(e) => updateItem(index, { name: e.target.value })}
              className="h-9 font-medium"
              aria-label={`Item ${index + 1} name`}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => removeItem(index)}
              aria-label={`Remove ${item.name}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <NumberField
              label="Qty"
              value={item.quantity}
              min={0.1}
              step={0.1}
              onChange={(quantity) => updateItem(index, { quantity })}
            />
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Unit</Label>
              <Input
                value={item.unit}
                onChange={(e) => updateItem(index, { unit: e.target.value })}
                className="h-8"
              />
            </div>
            <NumberField
              label="Calories"
              value={item.calories}
              onChange={(calories) => updateItem(index, { calories })}
            />
            <NumberField
              label="Protein (g)"
              value={item.proteinG}
              onChange={(proteinG) => updateItem(index, { proteinG })}
            />
            <NumberField
              label="Carbs (g)"
              value={item.carbsG}
              onChange={(carbsG) => updateItem(index, { carbsG })}
            />
            <NumberField
              label="Fat (g)"
              value={item.fatG}
              onChange={(fatG) => updateItem(index, { fatG })}
            />
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="w-full"
        onClick={addItem}
      >
        <Plus className="mr-2 size-4" />
        Add another item
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/60 px-4 py-3 text-sm">
        <span className="font-semibold">
          {Math.round(totals.calories)} kcal
        </span>
        <span className="text-muted-foreground">
          P {round1(totals.protein)}g · C {round1(totals.carbs)}g · F{" "}
          {round1(totals.fat)}g
        </span>
      </div>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  min = 0,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  step?: number;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="number"
        inputMode="decimal"
        min={min}
        step={step}
        value={value}
        onChange={(e) => {
          // An empty or half-typed field parses to NaN, which would render as
          // a blank controlled input and lose the user's place. Clamp to 0.
          const parsed = Number.parseFloat(e.target.value);
          onChange(Number.isFinite(parsed) ? Math.max(min === 0 ? 0 : 0, parsed) : 0);
        }}
        className="h-8"
      />
    </div>
  );
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
