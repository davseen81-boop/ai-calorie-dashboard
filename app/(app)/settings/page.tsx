"use client";

import { useEffect, useMemo, useState } from "react";
import { Info, Loader2, Monitor, Moon, Sun, X } from "lucide-react";
import { useTheme } from "next-themes";

import { Badge } from "@/components/ui/badge";
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
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { QueryError } from "@/components/ui/query-states";
import { BmrCalculator } from "@/components/settings/bmr-calculator";
import { TrainingPlanCard } from "@/components/settings/training-plan";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useProfile, useUpdateProfile } from "@/hooks/use-meals";
import {
  detectBrowserTimeZone,
  listTimeZones,
  timeZoneOffsetLabel,
} from "@/lib/timezones";
import {
  DEFAULT_SPLIT,
  macroGrams,
  rebalanceMacros,
  splitFromGrams,
  type MacroSplit,
} from "@/lib/nutrition/macros";
import { resolveDayCalories } from "@/lib/nutrition/day-targets";
import type { Theme } from "@/lib/db/schema";

const SUGGESTED_PREFERENCES = [
  "vegetarian",
  "vegan",
  "pescatarian",
  "gluten-free",
  "dairy-free",
  "halal",
  "kosher",
  "low-carb",
  "keto",
  "nut allergy",
];

export default function SettingsPage() {
  const profile = useProfile();
  const update = useUpdateProfile();
  const { theme, setTheme } = useTheme();

  const [calories, setCalories] = useState(2000);
  const [restCalories, setRestCalories] = useState<number | null>(null);
  const [activeCalories, setActiveCalories] = useState<number | null>(null);
  const [split, setSplit] = useState<MacroSplit>(DEFAULT_SPLIT);
  const [preferences, setPreferences] = useState<string[]>([]);
  const [customPreference, setCustomPreference] = useState("");
  const [timezone, setTimezone] = useState("UTC");
  const [loaded, setLoaded] = useState(false);

  // Computed once — the zone list is ~400 entries and never changes.
  const zones = useMemo(listTimeZones, []);
  const browserZone = useMemo(detectBrowserTimeZone, []);

  // Seed the controls once the profile arrives. Guarded so a background
  // refetch can't overwrite edits the user is midway through.
  useEffect(() => {
    if (!profile.data || loaded) return;
    setCalories(profile.data.dailyCalorieGoal);
    setRestCalories(profile.data.restDayCalories);
    setActiveCalories(profile.data.activeDayCalories);
    setSplit({
      protein: profile.data.proteinPct,
      carbs: profile.data.carbsPct,
      fat: profile.data.fatPct,
    });
    setPreferences(profile.data.dietaryPreferences);
    setTimezone(profile.data.timezone);
    setLoaded(true);
  }, [profile.data, loaded]);

  // Recomputed on render so it reflects the zone currently selected, giving
  // immediate feedback that the choice is the intended one.
  const localNow = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: timezone,
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date());
    } catch {
      return "—";
    }
  }, [timezone]);

  if (profile.isPending) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-[280px] rounded-xl" />
        <Skeleton className="h-[220px] rounded-xl" />
      </div>
    );
  }

  if (profile.isError) {
    return (
      <QueryError error={profile.error} onRetry={() => void profile.refetch()} />
    );
  }

  // Percentages always total 100 by construction, so there is no longer an
  // inconsistent state to warn about — the grams are simply derived.
  const grams = macroGrams(split, calories);
  const restTarget = resolveDayCalories("rest", {
    normalGoal: calories,
    restGoal: restCalories,
    activeGoal: activeCalories,
  });
  const activeTarget = resolveDayCalories("active", {
    normalGoal: calories,
    restGoal: restCalories,
    activeGoal: activeCalories,
  });

  const dirty =
    calories !== profile.data.dailyCalorieGoal ||
    restCalories !== profile.data.restDayCalories ||
    activeCalories !== profile.data.activeDayCalories ||
    split.protein !== profile.data.proteinPct ||
    split.carbs !== profile.data.carbsPct ||
    split.fat !== profile.data.fatPct ||
    preferences.join("|") !== profile.data.dietaryPreferences.join("|");

  function addPreference(value: string) {
    const clean = value.trim().toLowerCase();
    if (!clean || preferences.includes(clean) || preferences.length >= 20) return;
    setPreferences([...preferences, clean]);
    setCustomPreference("");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Targets and preferences used across the dashboard and by the AI.
        </p>
      </header>

      {/* Offered before the manual sliders: most people don't know what their
          target should be, and guessing with a slider is worse than a formula. */}
      <BmrCalculator
        profile={profile.data}
        saving={update.isPending}
        onSaveMetrics={(metrics) => update.mutate(metrics)}
        onApply={(goals) => {
          // The calculator works in grams; targets are stored as percentages,
          // so convert once here rather than teaching it about both.
          const nextSplit = splitFromGrams({
            proteinG: goals.proteinGoalG,
            carbsG: goals.carbsGoalG,
            fatG: goals.fatGoalG,
          });

          // Mirror into local state so the controls move with it, rather than
          // silently disagreeing with the target just applied.
          setCalories(goals.dailyCalorieGoal);
          setSplit(nextSplit);
          update.mutate({
            dailyCalorieGoal: goals.dailyCalorieGoal,
            proteinPct: nextSplit.protein,
            carbsPct: nextSplit.carbs,
            fatPct: nextSplit.fat,
          });
        }}
      />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daily targets</CardTitle>
          <CardDescription>
            A normal day, plus lighter and heavier variants for rest and
            training days.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <SliderField
            label="Normal day"
            value={calories}
            min={1000}
            max={5000}
            step={50}
            unit="kcal"
            onChange={setCalories}
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <DayGoalField
              label="Rest day"
              tone="rest"
              value={restCalories}
              derived={restTarget}
              onChange={setRestCalories}
            />
            <DayGoalField
              label="Training day"
              tone="active"
              value={activeCalories}
              derived={activeTarget}
              onChange={setActiveCalories}
            />
          </div>

          <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
            Leave these blank and they follow your normal day automatically
            (&minus;15% and +15%). Cycling only works if the week still averages
            out — three heavy days without light ones is just eating more.
          </p>
        </CardContent>
      </Card>

      <TrainingPlanCard
        onApply={({ rest, training }) => {
          setRestCalories(rest);
          setActiveCalories(training);
          update.mutate({ restDayCalories: rest, activeDayCalories: training });
        }}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Macro split</CardTitle>
          <CardDescription>
            Percentages of your daily energy. Move one and the others adjust,
            so the three always total 100%.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {(
            [
              { key: "protein", label: "Protein" },
              { key: "carbs", label: "Carbs" },
              { key: "fat", label: "Fat" },
            ] as const
          ).map((macro) => (
            <div key={macro.key} className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-2">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ backgroundColor: `hsl(var(--${macro.key}))` }}
                    aria-hidden
                  />
                  {macro.label}
                </Label>
                <span className="text-sm font-medium tabular-nums">
                  {split[macro.key]}%
                  <span className="ml-2 text-muted-foreground">
                    {macro.key === "protein"
                      ? grams.proteinG
                      : macro.key === "carbs"
                        ? grams.carbsG
                        : grams.fatG}
                    g
                  </span>
                </span>
              </div>
              <Slider
                value={[split[macro.key]]}
                min={0}
                max={100}
                step={1}
                onValueChange={([next]) =>
                  setSplit((current) =>
                    rebalanceMacros(current, macro.key, next),
                  )
                }
                aria-label={`${macro.label} percentage`}
              />
            </div>
          ))}

          <div className="flex items-center justify-between rounded-lg bg-secondary/60 px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              {split.protein}% · {split.carbs}% · {split.fat}%
            </span>
            <span className="font-medium tabular-nums text-success">
              = {split.protein + split.carbs + split.fat}%
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            Grams shown are for a normal day. On a{" "}
            {restTarget.toLocaleString()} kcal rest day or a{" "}
            {activeTarget.toLocaleString()} kcal active day they scale with the
            target automatically.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dietary preferences</CardTitle>
          <CardDescription>
            Passed to the AI as context — it uses these to pick the more likely
            reading when a description is ambiguous.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {preferences.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {preferences.map((pref) => (
                <Badge key={pref} variant="secondary" className="gap-1 capitalize">
                  {pref}
                  <button
                    type="button"
                    onClick={() =>
                      setPreferences(preferences.filter((p) => p !== pref))
                    }
                    aria-label={`Remove ${pref}`}
                    className="ml-0.5 rounded-full hover:text-destructive"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={customPreference}
              onChange={(e) => setCustomPreference(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addPreference(customPreference);
                }
              }}
              placeholder="Add your own…"
              maxLength={40}
            />
            <Button
              variant="outline"
              onClick={() => addPreference(customPreference)}
              disabled={!customPreference.trim()}
            >
              Add
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {SUGGESTED_PREFERENCES.filter((p) => !preferences.includes(p)).map(
              (pref) => (
                <button
                  key={pref}
                  type="button"
                  onClick={() => addPreference(pref)}
                  className="rounded-full border px-3 py-1 text-xs capitalize text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  + {pref}
                </button>
              ),
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Exercise</CardTitle>
          <CardDescription>
            How logged workouts affect the day&apos;s calorie target.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">
                Add exercise calories to my target
              </p>
              <p className="text-xs text-muted-foreground">
                A 300 kcal workout raises today&apos;s target to{" "}
                {(profile.data.dailyCalorieGoal + 300).toLocaleString()}.
              </p>
            </div>
            <Switch
              checked={profile.data.adjustTargetForExercise}
              onCheckedChange={(on) =>
                update.mutate({ adjustTargetForExercise: on })
              }
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Genuinely a matter of preference. Eating back what you burn helps
            fuel training; leaving it off keeps a steadier deficit, which some
            people prefer because burn estimates — from any app or watch — tend
            to read high. Either way the workout is still recorded.
          </p>

          {!profile.data.weightKg && (
            <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-warning">
              Exercise burn is estimated from body weight. Without yours it
              assumes 70 kg — fill in the calculator above for a closer figure.
            </p>
          )}

          {profile.data.activityLevel &&
            profile.data.activityLevel !== "sedentary" && (
              <p className="flex gap-2 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3.5 shrink-0" />
                <span>
                  Your activity level is set to{" "}
                  <span className="font-medium">
                    {profile.data.activityLevel.replace("_", " ")}
                  </span>
                  , which already assumes regular exercise. Logging workouts on
                  top counts them twice — if you log most sessions here, set
                  activity level to <span className="font-medium">sedentary</span>{" "}
                  and let this do the work.
                </span>
              </p>
            )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Timezone</CardTitle>
          <CardDescription>
            Decides which day a meal counts towards. Detected automatically on
            first run — change it if you travel or it guessed wrong.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={timezone}
            onValueChange={(value) => {
              setTimezone(value);
              update.mutate({ timezone: value });
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {zones.map((zone) => (
                <SelectItem key={zone} value={zone}>
                  {zone.replace(/_/g, " ")}
                  <span className="ml-2 text-muted-foreground">
                    {timeZoneOffsetLabel(zone)}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <p className="text-sm text-muted-foreground">
            Your local time is{" "}
            <span className="font-medium tabular-nums text-foreground">
              {localNow}
            </span>
            {timezone !== browserZone && (
              <>
                {" — "}
                <button
                  type="button"
                  className="font-medium text-primary underline underline-offset-2"
                  onClick={() => {
                    setTimezone(browserZone);
                    update.mutate({ timezone: browserZone });
                  }}
                >
                  use this device&apos;s zone ({browserZone.replace(/_/g, " ")})
                </button>
              </>
            )}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Appearance</CardTitle>
          <CardDescription>
            Applies immediately and is remembered on this device.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
                { value: "system", label: "System", icon: Monitor },
              ] as const
            ).map((option) => {
              const Icon = option.icon;
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setTheme(option.value);
                    // Persisted too, so the choice survives a new device.
                    update.mutate({ theme: option.value satisfies Theme });
                  }}
                  className={cn(
                    "flex flex-col items-center gap-2 rounded-xl border p-4 text-sm font-medium transition-colors",
                    active
                      ? "border-primary bg-primary/5 text-primary"
                      : "text-muted-foreground hover:border-primary/40",
                  )}
                >
                  <Icon className="size-5" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Sticky so the save action stays reachable on a long mobile page. */}
      <div className="sticky bottom-20 z-30 md:bottom-4">
        <Button
          className="gradient-primary w-full shadow-lg hover:opacity-90"
          size="lg"
          disabled={!dirty || update.isPending}
          onClick={() =>
            update.mutate({
              dailyCalorieGoal: calories,
              restDayCalories: restCalories,
              activeDayCalories: activeCalories,
              proteinPct: split.protein,
              carbsPct: split.carbs,
              fatPct: split.fat,
              dietaryPreferences: preferences,
            })
          }
        >
          {update.isPending ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              Saving…
            </>
          ) : dirty ? (
            "Save changes"
          ) : (
            "All changes saved"
          )}
        </Button>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  accent,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  accent?: "protein" | "carbs" | "fat";
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="flex items-center gap-2">
          {accent && (
            <span
              className="size-2.5 rounded-full"
              style={{ backgroundColor: `hsl(var(--${accent}))` }}
              aria-hidden
            />
          )}
          {label}
        </Label>
        <span className="text-sm font-medium tabular-nums">
          {value.toLocaleString()} {unit}
        </span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={([next]) => onChange(next)}
        aria-label={`${label} goal`}
      />
    </div>
  );
}

/**
 * An optional day-type calorie override.
 *
 * Empty means "follow the normal day", and the placeholder shows what that
 * works out to — so leaving it blank is an informed choice rather than a gap.
 */
function DayGoalField({
  label,
  tone,
  value,
  derived,
  onChange,
}: {
  label: string;
  tone: "rest" | "active";
  value: number | null;
  derived: number;
  onChange: (value: number | null) => void;
}) {
  return (
    <div className="space-y-2">
      <Label className="flex items-center gap-2">
        <span
          className={cn(
            "size-2.5 rounded-full",
            tone === "rest" ? "bg-muted-foreground" : "bg-success",
          )}
          aria-hidden
        />
        {label}
      </Label>
      <Input
        type="number"
        inputMode="numeric"
        min={800}
        max={6000}
        step={50}
        value={value ?? ""}
        placeholder={String(derived)}
        onChange={(e) => {
          const parsed = Number.parseInt(e.target.value, 10);
          onChange(Number.isFinite(parsed) ? parsed : null);
        }}
      />
      <p className="text-xs text-muted-foreground">
        {value === null ? `Following your normal day: ${derived} kcal` : "Custom"}
      </p>
    </div>
  );
}
