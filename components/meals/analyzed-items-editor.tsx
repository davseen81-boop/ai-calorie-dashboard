"use client";

import { useState } from "react";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAnalyzeMeal } from "@/hooks/use-meals";
import type { AnalyzedItem } from "@/types/api";

interface Props {
  items: AnalyzedItem[];
  onChange: (items: AnalyzedItem[]) => void;
}

/** What a row describes, phrased as the analyser expects to read it. */
function describe(item: AnalyzedItem): string {
  return `${item.quantity} ${item.unit} ${item.name}`.trim();
}

/**
 * Editable list of the foods the AI identified.
 *
 * The estimate is a starting point, not an answer — the user can correct every
 * number before anything is saved. Totals shown here are recomputed locally so
 * corrections are reflected instantly; the server re-derives them on save.
 */
export function AnalyzedItemsEditor({ items, onChange }: Props) {
  const analyze = useAnalyzeMeal();
  // Which row is being re-estimated, or "all". Tracked here rather than using
  // the mutation's own pending flag, so only the affected row shows a spinner.
  const [busy, setBusy] = useState<number | "all" | null>(null);

  function updateItem(index: number, patch: Partial<AnalyzedItem>) {
    onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  }

  /**
   * Re-estimate one row from what it now says.
   *
   * Changing "chicken breast" to "salmon fillet" leaves the old calories in
   * place, which is worse than an empty field — the numbers look considered but
   * describe food that is no longer there.
   *
   * The name, quantity and unit the user typed are kept; only the nutrition is
   * replaced. If the analyser splits the description into several foods their
   * figures are summed back into the one row, so re-estimating never changes
   * the shape of the list underneath you.
   */
  function reestimateRow(index: number) {
    const item = items[index];
    if (!item.name.trim() || busy !== null) return;

    setBusy(index);
    analyze.mutate(
      { mode: "text", description: describe(item) },
      {
        onSuccess: (result) => {
          const sum = result.items.reduce(
            (acc, part) => ({
              calories: acc.calories + part.calories,
              proteinG: acc.proteinG + part.proteinG,
              carbsG: acc.carbsG + part.carbsG,
              fatG: acc.fatG + part.fatG,
            }),
            { calories: 0, proteinG: 0, carbsG: 0, fatG: 0 },
          );

          updateItem(index, {
            calories: round1(sum.calories),
            proteinG: round1(sum.proteinG),
            carbsG: round1(sum.carbsG),
            fatG: round1(sum.fatG),
          });
        },
        onSettled: () => setBusy(null),
      },
    );
  }

  /**
   * Re-estimate the whole meal in one request.
   *
   * Cheaper than a row at a time — each analysis costs one request against the
   * API quota — and the right choice when several foods changed. This one does
   * replace the list, because re-reading the whole meal is the point.
   */
  function reestimateAll() {
    const described = items.filter((item) => item.name.trim()).map(describe);
    if (described.length === 0 || busy !== null) return;

    setBusy("all");
    analyze.mutate(
      { mode: "text", description: described.join(", ") },
      {
        onSuccess: (result) => onChange(result.items),
        onSettled: () => setBusy(null),
      },
    );
  }

  /**
   * Quantity drives the nutrition.
   *
   * Halving the portion has to halve the calories — otherwise "0.5" reads as a
   * correction the numbers never received, which is worse than not offering the
   * field. Scaling is relative to the quantity currently committed, so
   * successive edits compose instead of compounding off the original.
   *
   * The nutrition fields stay directly editable: typing a calorie figure
   * overrides the scaled one and does not touch the quantity.
   */
  function setQuantity(index: number, nextQuantity: number) {
    const item = items[index];
    // A committed quantity is never 0 (see QuantityField), so this is safe;
    // the guard is for hand-constructed items.
    const ratio = item.quantity > 0 ? nextQuantity / item.quantity : 1;

    // One decimal, not whole calories. Editing "60" to "63" passes through
    // "6", and rounding that intermediate to a whole number loses about 1% by
    // the time it scales back up. A decimal round-trips exactly.
    updateItem(index, {
      quantity: nextQuantity,
      calories: round1(item.calories * ratio),
      proteinG: round1(item.proteinG * ratio),
      carbsG: round1(item.carbsG * ratio),
      fatG: round1(item.fatG * ratio),
    });
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
          <div className="flex items-center gap-1">
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
              className="shrink-0 text-muted-foreground hover:text-primary"
              disabled={busy !== null || item.name.trim().length === 0}
              onClick={() => reestimateRow(index)}
              aria-label={`Re-estimate the nutrition for ${item.name || `item ${index + 1}`}`}
              title="Changed this food? Re-estimate its calories."
            >
              {busy === index ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Sparkles className="size-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground hover:text-destructive"
              disabled={busy !== null}
              onClick={() => removeItem(index)}
              aria-label={`Remove ${item.name}`}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            <QuantityField
              value={item.quantity}
              onCommit={(quantity) => setQuantity(index, quantity)}
              label={`Item ${index + 1} quantity`}
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

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={busy !== null}
          onClick={addItem}
        >
          <Plus className="mr-2 size-4" />
          Add item
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex-1"
          disabled={busy !== null || items.every((item) => !item.name.trim())}
          onClick={reestimateAll}
        >
          {busy === "all" ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Re-estimating…
            </>
          ) : (
            <>
              <Sparkles className="mr-2 size-4" />
              Re-estimate all
            </>
          )}
        </Button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-secondary/60 px-4 py-3 text-sm">
        <span className="font-semibold">
          {Math.round(totals.calories)} kcal
        </span>
        <span className="text-muted-foreground">
          P {round1(totals.protein)}g · C {round1(totals.carbs)}g · F{" "}
          {round1(totals.fat)}g
        </span>
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Changed a food? Tap <Sparkles className="inline size-3" aria-hidden /> on
        that row to re-estimate its calories, or{" "}
        <span className="font-medium">Re-estimate all</span> if several changed.
        Changing the quantity rescales that row on its own — no analysis needed.
      </p>
    </div>
  );
}

/**
 * The quantity input, which rescales the row as it changes.
 *
 * It holds the typed text rather than a number, and only commits a value
 * greater than zero. That matters because changing 1 to 0.5 passes through
 * "0" — and a commit at zero would multiply the row's nutrition to nothing,
 * with no quantity left to scale back from. Anything invalid or zero simply
 * isn't committed, and the field snaps back on blur.
 */
function QuantityField({
  value,
  onCommit,
  label,
}: {
  value: number;
  onCommit: (value: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(() => String(value));
  const [lastValue, setLastValue] = useState(value);

  // Adjusting state during render rather than in an effect: this is the
  // documented way to react to a prop change without a second render pass.
  // The draft is left alone when it already represents `value`, so typing
  // "0.50" isn't rewritten to "0.5" under the cursor.
  if (value !== lastValue) {
    setLastValue(value);
    if (Number.parseFloat(draft) !== value) setDraft(String(value));
  }

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">Qty</Label>
      <Input
        type="number"
        inputMode="decimal"
        min={0}
        step={0.1}
        value={draft}
        aria-label={label}
        onChange={(event) => {
          setDraft(event.target.value);
          const parsed = Number.parseFloat(event.target.value);
          if (Number.isFinite(parsed) && parsed > 0) onCommit(parsed);
        }}
        onBlur={() => setDraft(String(value))}
        className="h-8"
      />
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
