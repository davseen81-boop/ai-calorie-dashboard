"use client";

import { useMemo, useState } from "react";
import { Check, Info } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ACTIVITY_OPTIONS,
  GOAL_OPTIONS,
  estimateEnergy,
  hasCompleteMetrics,
  type BodyMetrics,
} from "@/lib/nutrition/energy";
import { BIOLOGICAL_SEXES } from "@/lib/db/schema";
import type { ApiProfile } from "@/types/api";

interface Props {
  profile: ApiProfile;
  saving: boolean;
  /** Persists the metrics themselves. */
  onSaveMetrics: (metrics: Partial<BodyMetrics>) => void;
  /** Applies the computed figures to the daily goals. */
  onApply: (goals: {
    dailyCalorieGoal: number;
    proteinGoalG: number;
    carbsGoalG: number;
    fatGoalG: number;
  }) => void;
}

/**
 * Estimates a calorie target from body metrics.
 *
 * Deliberately does not overwrite the goals on its own — it computes, shows its
 * working, and applies only when asked. The manual sliders stay authoritative,
 * because plenty of people have a target from a coach or clinician that no
 * formula should quietly replace.
 */
export function BmrCalculator({ profile, saving, onSaveMetrics, onApply }: Props) {
  const [draft, setDraft] = useState<Partial<BodyMetrics>>({
    sex: profile.sex ?? undefined,
    age: profile.age ?? undefined,
    heightCm: profile.heightCm ?? undefined,
    weightKg: profile.weightKg ?? undefined,
    activityLevel: profile.activityLevel ?? undefined,
    goalType: profile.goalType ?? undefined,
  });

  const estimate = useMemo(
    () => (hasCompleteMetrics(draft) ? estimateEnergy(draft) : null),
    [draft],
  );

  function update(patch: Partial<BodyMetrics>) {
    const next = { ...draft, ...patch };
    setDraft(next);
    // Persisted as you go so the figures survive a reload without a save step.
    onSaveMetrics(patch);
  }

  const applied = estimate
    ? profile.dailyCalorieGoal === estimate.target
    : false;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Work out my target</CardTitle>
        <CardDescription>
          Estimates what you burn from your body metrics, then suggests a
          calorie target for your goal.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Sex</Label>
            <Select
              value={draft.sex ?? ""}
              onValueChange={(v) => update({ sex: v as BodyMetrics["sex"] })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select" />
              </SelectTrigger>
              <SelectContent>
                {BIOLOGICAL_SEXES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <NumberField
            label="Age"
            unit="years"
            value={draft.age}
            min={13}
            max={120}
            onChange={(age) => update({ age })}
          />
          <NumberField
            label="Height"
            unit="cm"
            value={draft.heightCm}
            min={90}
            max={250}
            onChange={(heightCm) => update({ heightCm })}
          />
          <NumberField
            label="Weight"
            unit="kg"
            value={draft.weightKg}
            min={25}
            max={400}
            step={0.1}
            onChange={(weightKg) => update({ weightKg })}
          />
        </div>

        <div className="space-y-2">
          <Label>Activity level</Label>
          <Select
            value={draft.activityLevel ?? ""}
            onValueChange={(v) =>
              update({ activityLevel: v as BodyMetrics["activityLevel"] })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="How active are you?" />
            </SelectTrigger>
            <SelectContent>
              {ACTIVITY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  <span className="font-medium">{option.label}</span>
                  <span className="ml-2 text-muted-foreground">
                    {option.description}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label>Goal</Label>
          <div className="grid grid-cols-3 gap-2">
            {GOAL_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => update({ goalType: option.value })}
                className={cn(
                  "rounded-xl border p-3 text-center transition-colors",
                  draft.goalType === option.value
                    ? "border-primary bg-primary/5"
                    : "hover:border-primary/40",
                )}
              >
                <p className="text-sm font-medium">{option.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {option.description}
                </p>
              </button>
            ))}
          </div>
        </div>

        {estimate ? (
          <div className="space-y-3 rounded-xl border bg-secondary/40 p-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              <Figure label="At rest" value={estimate.bmr} hint="BMR" />
              <Figure label="You burn" value={estimate.tdee} hint="daily" />
              <Figure
                label="Target"
                value={estimate.target}
                hint={
                  estimate.adjustment === 0
                    ? "maintain"
                    : `${estimate.adjustment > 0 ? "+" : ""}${estimate.adjustment}`
                }
                emphasis
              />
            </div>

            <p className="text-xs text-muted-foreground">
              Suggested macros: {estimate.macros.proteinG}g protein ·{" "}
              {estimate.macros.carbsG}g carbs · {estimate.macros.fatG}g fat
            </p>

            {estimate.flooredAt && (
              <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
                Your goal would put the target below {estimate.flooredAt} kcal,
                so it&apos;s been raised to that. Going lower makes it hard to
                get enough nutrients from food — worth talking to a doctor or
                dietitian first.
              </p>
            )}

            <Button
              className="w-full"
              variant={applied ? "outline" : "default"}
              disabled={saving || applied}
              onClick={() =>
                onApply({
                  dailyCalorieGoal: estimate.target,
                  proteinGoalG: estimate.macros.proteinG,
                  carbsGoalG: estimate.macros.carbsG,
                  fatGoalG: estimate.macros.fatG,
                })
              }
            >
              {applied ? (
                <>
                  <Check className="mr-2 size-4" />
                  This is your current target
                </>
              ) : (
                `Use ${estimate.target} kcal as my daily goal`
              )}
            </Button>
          </div>
        ) : (
          <p className="rounded-lg border border-dashed px-3 py-4 text-center text-sm text-muted-foreground">
            Fill in all six fields to see your estimate.
          </p>
        )}

        <p className="flex gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            These are population-average estimates from the Mifflin-St Jeor
            equation. Two people with identical numbers can differ by around
            10%, and it can&apos;t account for body composition, medication or
            medical conditions. Treat it as a starting point — adjust based on
            what actually happens over a few weeks, and talk to a doctor or
            dietitian for anything medical.
          </span>
        </p>
      </CardContent>
    </Card>
  );
}

function Figure({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: number;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={cn(
          "font-semibold tabular-nums",
          emphasis ? "text-2xl text-primary" : "text-xl",
        )}
      >
        {value.toLocaleString()}
      </p>
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  unit: string;
  value: number | undefined;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label} <span className="text-muted-foreground">({unit})</span>
      </Label>
      <Input
        type="number"
        inputMode="decimal"
        min={min}
        max={max}
        step={step}
        value={value ?? ""}
        onChange={(e) => {
          const parsed = Number.parseFloat(e.target.value);
          // Clearing the field must not persist 0 — that would fail validation
          // and read as "answered" when it isn't.
          onChange(Number.isFinite(parsed) ? parsed : undefined);
        }}
      />
    </div>
  );
}
